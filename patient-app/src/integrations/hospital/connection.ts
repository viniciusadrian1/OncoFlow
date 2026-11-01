import type {
  HospitalAppointment,
  HospitalDocument,
  HospitalJourneyEvent,
  HospitalMessage,
  HospitalPatientRepository,
  HospitalPatientRequest,
  HospitalPatientScope,
  HospitalPatientSummary,
  HospitalPreferences,
  HospitalPreferencesInput,
  HospitalRequestInput,
  HospitalWellbeingInput,
  HospitalMessageInput,
  HospitalReadOptions,
  HospitalSymptomReportInput,
  HospitalSymptomReportResult,
} from "../../../shared/hospitalContracts";
import { createHospitalRepository, isLocalDemoHost } from "./repository";
import { hospitalFetch } from "../nativeHttp";
import { HospitalIntegrationError } from "./errors";
import { parseScope } from "./validation";

export type HospitalView = {
  status: "loading" | "ready" | "offline";
  asOf?: string;
  summary?: HospitalPatientSummary;
  appointments: HospitalAppointment[];
  journey: HospitalJourneyEvent[];
  documents: HospitalDocument[];
  requests: HospitalPatientRequest[];
  messages: HospitalMessage[];
  preferences?: HospitalPreferences;
  savedMood: string;
  pending: number;
  error: "read" | "write" | null;
};
export const emptyHospitalView: HospitalView = {
  status: "loading",
  appointments: [],
  journey: [],
  documents: [],
  requests: [],
  messages: [],
  savedMood: "",
  pending: 0,
  error: null,
};

/** The only HTTP exception is explicit local development on a literal loopback host. */
export function hospitalOrigin(
  value: string,
  allowLocalDemoHttp = false,
): string {
  try {
    const url = new URL(value.trim());
    const loopback =
      allowLocalDemoHttp &&
      url.protocol === "http:" &&
      isLocalDemoHost(url.hostname);
    if (
      (url.protocol !== "https:" && !loopback) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["", "/"].includes(url.pathname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new HospitalIntegrationError("config");
  }
}

export type HospitalConnection = {
  scope: Readonly<HospitalPatientScope>;
  displayName: string;
  expiresAt: string;
  getSnapshot(): HospitalView;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  reportSymptoms(
    value: HospitalSymptomReportInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSymptomReportResult>;
  submitRequest(
    value: Omit<HospitalRequestInput, "confirmation">,
    options?: HospitalReadOptions,
  ): Promise<void>;
  recordWellbeing(
    value: Omit<HospitalWellbeingInput, "confirmation" | "recordedAt">,
    options?: HospitalReadOptions,
  ): Promise<void>;
  sendMessage(
    value: Omit<HospitalMessageInput, "confirmation">,
    options?: HospitalReadOptions,
  ): Promise<void>;
  updatePreferences(
    value: HospitalPreferencesInput,
    options?: HospitalReadOptions,
  ): Promise<void>;
  disconnect(): void;
};

/** Tokens remain captured in memory. Neither the view, browser storage nor Lia receives one. */
export async function pairHospital(options: {
  origin: string;
  code: string;
  signal?: AbortSignal;
  allowLoopbackHttp?: boolean;
  allowLocalDemoHttp?: boolean;
  fetch?: typeof fetch;
}): Promise<HospitalConnection> {
  const origin = hospitalOrigin(
    options.origin,
    options.allowLocalDemoHttp || options.allowLoopbackHttp,
  );
  if (!/^[A-Za-z0-9-]{4,64}$/.test(options.code.trim()))
    throw new HospitalIntegrationError("invalid_input");
  const fetcher = options.fetch ?? hospitalFetch;
  let response: Response;
  try {
    response = await fetcher(`${origin}/api/mobile/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ code: options.code.trim() }),
      signal: options.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new HospitalIntegrationError(
      options.signal?.aborted ? "aborted" : "network",
    );
  }
  if (!response.ok)
    throw new HospitalIntegrationError(
      response.status === 401 || response.status === 410 ? "auth" : "server",
    );
  let body: Record<string, unknown>;
  try {
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("Content-Type") ?? "",
      )
    )
      throw new Error();
    const raw = await response.text();
    if (raw.length > 16_384) throw new Error();
    body = JSON.parse(raw);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).sort().join() !==
        "accessToken,demo,expiresAt,patient,scope"
    )
      throw new Error();
    if (
      body.demo !== true ||
      typeof body.accessToken !== "string" ||
      body.accessToken.length > 8192 ||
      !/^[A-Za-z0-9._~+/-]+=*$/.test(body.accessToken)
    )
      throw new Error();
    if (
      typeof body.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(body.expiresAt)) ||
      Date.parse(body.expiresAt) <= Date.now()
    )
      throw new Error();
    const patient = body.patient as Record<string, unknown>;
    if (
      !patient ||
      Object.keys(patient).join() !== "displayName" ||
      typeof patient.displayName !== "string" ||
      !patient.displayName.trim() ||
      patient.displayName.length > 200
    )
      throw new Error();
  } catch {
    throw new HospitalIntegrationError("invalid_response");
  }
  if (options.signal?.aborted) throw new HospitalIntegrationError("aborted");
  const scope = Object.freeze(parseScope(body.scope));
  let token: string | null = body.accessToken as string;
  const expiresAt = body.expiresAt as string;
  let active = true;
  const repository = createHospitalRepository({
    baseUrl: `${origin}/api/v1`,
    allowedOrigins: [origin],
    allowLoopbackHttp: options.allowLoopbackHttp,
    allowLocalDemoHttp: options.allowLocalDemoHttp,
    fetch: fetcher,
    authentication: {
      scope,
      subjectId: scope.patientId,
      sessionId: crypto.randomUUID(),
      isSessionActive: () => active && Date.now() < Date.parse(expiresAt),
      getAccessToken: async () => token,
    },
  });
  return createHospitalConnection(repository, {
    scope,
    displayName: (body.patient as { displayName: string }).displayName,
    expiresAt,
    onDisconnect: () => {
      active = false;
      token = null;
    },
  });
}

/** A session is a single abort boundary. Late reads and writes cannot publish after disconnect. */
export function createHospitalConnection(
  repository: HospitalPatientRepository,
  identity: {
    scope: HospitalPatientScope;
    displayName: string;
    expiresAt: string;
    onDisconnect?: () => void;
  },
): HospitalConnection {
  let view: HospitalView = { ...emptyHospitalView };
  let active = true;
  let refreshPromise: Promise<void> | null = null;
  let revision = 0;
  const controller = new AbortController();
  const listeners = new Set<() => void>();
  const operations = new Map<
    string,
    {
      signature: string;
      input: unknown;
      result?: Promise<unknown>;
      failed?: boolean;
    }
  >();
  function publish(change: Partial<HospitalView>) {
    if (!active) return;
    view = { ...view, ...change };
    listeners.forEach((listener) => listener());
  }
  function ensureActive() {
    if (!active) throw new HospitalIntegrationError("aborted");
  }
  async function refresh() {
    ensureActive();
    if (refreshPromise) return refreshPromise;
    const startedRevision = revision;
    refreshPromise = (async () => {
      try {
        const options = { signal: controller.signal };
        const [
          summary,
          appointments,
          journey,
          documents,
          requests,
          preferences,
          messages,
        ] = await Promise.all([
          repository.summary(options),
          repository.appointments(options),
          repository.journey(options),
          repository.documents(options),
          repository.requests(options),
          repository.preferences(options),
          repository.messages(options),
        ]);
        ensureActive();
        if (startedRevision !== revision) return;
        for (const [key, operation] of operations) {
          if (!operation.failed) continue;
          const input = operation.input as Record<string, unknown>;
          const confirmed = key.startsWith("request-")
            ? requests.data.some(
                (item) => item.idempotencyKey === input.idempotencyKey,
              )
            : key.startsWith("wellbeing-")
              ? summary.data.lastWellbeing?.feeling === input.feeling &&
                summary.data.lastWellbeing?.recordedAt === input.recordedAt
              : key.startsWith("preferences-")
                ? ["locale", "explanation", "speechRate", "textScale"].every(
                    (field) =>
                      preferences.data[field as keyof HospitalPreferences] ===
                      input[field],
                  )
                : false;
          if (confirmed) operation.failed = false;
        }
        const unresolved = [...operations.values()].some(
          (operation) => operation.failed,
        );
        publish({
          status: "ready",
          asOf: summary.asOf,
          summary: summary.data,
          appointments: appointments.data,
          journey: journey.data,
          documents: documents.data,
          requests: requests.data,
          preferences: preferences.data,
          messages: messages.data,
          savedMood: summary.data.lastWellbeing?.feeling ?? view.savedMood,
          error: unresolved ? "write" : null,
        });
      } catch {
        if (active)
          publish({
            status: "offline",
            error: view.error === "write" ? "write" : "read",
          });
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }
  async function mutate<T, TResult>(
    key: string,
    signature: string,
    createInput: () => T,
    write: (input: T, signal: AbortSignal) => Promise<TResult>,
    accepted: (result: TResult) => Partial<HospitalView>,
    signal?: AbortSignal,
  ) {
    ensureActive();
    if (signal?.aborted) throw new HospitalIntegrationError("aborted");
    let operation = operations.get(key);
    if (operation && operation.signature !== signature)
      throw new HospitalIntegrationError("conflict");
    if (!operation) {
      if (operations.size >= 256)
        throw new HospitalIntegrationError("invalid_input");
      operation = { signature, input: createInput() };
      operations.set(key, operation);
    }
    if (operation.result) return operation.result as Promise<TResult>;
    const captured = operation;
    revision += 1;
    publish({ pending: view.pending + 1 });
    const run = (async () => {
      const combined = new AbortController();
      const abort = () => combined.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        const result = await write(captured.input as T, combined.signal);
        ensureActive();
        if (combined.signal.aborted)
          throw new HospitalIntegrationError("aborted");
        revision += 1;
        captured.failed = false;
        publish({ ...accepted(result), error: null });
        return result;
      } catch (error) {
        captured.result = undefined;
        captured.failed = true;
        if (active) publish({ error: "write" });
        throw error;
      } finally {
        controller.signal.removeEventListener("abort", abort);
        signal?.removeEventListener("abort", abort);
        publish({ pending: Math.max(0, view.pending - 1) });
      }
    })();
    captured.result = run;
    return run;
  }
  const confirmation = () => ({
    confirmed: true as const,
    confirmedAt: new Date().toISOString(),
  });
  return {
    scope: Object.freeze({ ...identity.scope }),
    displayName: identity.displayName,
    expiresAt: identity.expiresAt,
    getSnapshot: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    reportSymptoms(value, options) {
      return mutate(
        `symptoms-${value.idempotencyKey}`,
        JSON.stringify(value),
        () => ({ ...value }),
        (input, signal) => repository.reportSymptoms(input, { signal }),
        () => ({}),
        options?.signal,
      ).then((result) => result.data);
    },
    submitRequest(value, options) {
      return mutate(
        `request-${value.idempotencyKey}`,
        JSON.stringify(value),
        () => ({ ...value, confirmation: confirmation() }),
        (input, signal) => repository.submitRequest(input, { signal }),
        (result) => {
          const record = (
            result as Awaited<ReturnType<typeof repository.submitRequest>>
          ).data;
          return {
            requests: [
              ...view.requests.filter((item) => item.id !== record.id),
              record,
            ],
          };
        },
        options?.signal,
      ).then(() => {});
    },
    recordWellbeing(value, options) {
      return mutate(
        `wellbeing-${value.idempotencyKey}`,
        JSON.stringify(value),
        () => ({
          ...value,
          recordedAt: new Date().toISOString(),
          confirmation: confirmation(),
        }),
        (input, signal) => repository.recordWellbeing(input, { signal }),
        (result) => ({
          savedMood: (
            result as Awaited<ReturnType<typeof repository.recordWellbeing>>
          ).data.feeling,
        }),
        options?.signal,
      ).then(() => {});
    },
    sendMessage(value, options) {
      return mutate(
        `message-${value.idempotencyKey}`,
        JSON.stringify(value),
        () => ({ ...value, confirmation: confirmation() }),
        (input, signal) => repository.sendMessage(input, { signal }),
        (result) => {
          const record = (
            result as Awaited<ReturnType<typeof repository.sendMessage>>
          ).data;
          return {
            messages: [
              ...view.messages.filter((item) => item.id !== record.id),
              record,
            ],
          };
        },
        options?.signal,
      ).then(() => {});
    },
    updatePreferences(value, options) {
      return mutate(
        `preferences-${value.idempotencyKey}`,
        JSON.stringify(value),
        () => value,
        (input, signal) => repository.updatePreferences(input, { signal }),
        (result) => ({
          preferences: (
            result as Awaited<ReturnType<typeof repository.updatePreferences>>
          ).data,
        }),
        options?.signal,
      ).then(() => {});
    },
    disconnect() {
      active = false;
      controller.abort();
      repository.disconnect();
      identity.onDisconnect?.();
      operations.clear();
      view = { ...emptyHospitalView };
      listeners.forEach((listener) => listener());
      listeners.clear();
    },
  };
}
