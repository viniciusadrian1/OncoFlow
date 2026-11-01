import type {
  HospitalPatientRepository,
  HospitalPatientScope,
  HospitalReadOptions,
  HospitalSnapshot,
} from "../../../shared/hospitalContracts";
import { HospitalIntegrationError, type HospitalErrorCode } from "./errors";
import {
  parseAppointment,
  parseDocument,
  parseJourney,
  parseList,
  parsePreferences,
  parseRequest,
  parseScope,
  parseSnapshot,
  parseSummary,
  parseWellbeing,
  parseMessage,
  validId,
  validateRequestInput,
  validateWellbeingInput,
  validateMessageInput,
  validatePreferencesInput,
  parseSymptomReport,
  validateSymptomReportInput,
} from "./validation";

export { HospitalIntegrationError } from "./errors";

export type HospitalTokenContext = Readonly<
  HospitalPatientScope & {
    subjectId: string;
    sessionId: string;
  }
>;

export type HospitalRepositoryOptions = {
  /** Explicit deployment configuration, never an AI/user message or document URL. */
  baseUrl: string;
  /** Exact HTTPS origins approved for this deployment; no wildcards. */
  allowedOrigins: readonly string[];
  authentication: {
    /** Supplied by the authenticated session, never from a demo persona or AI. */
    scope: HospitalPatientScope;
    subjectId: string;
    sessionId: string;
    isSessionActive(): boolean;
    /** Acquire a scoped access token in memory; do not put tokens in build envs. */
    getAccessToken(
      context: HospitalTokenContext,
      signal?: AbortSignal,
    ): Promise<string | null>;
  };
  fetch?: typeof fetch;
  /** Development-only opt-in. HTTP is still restricted to literal loopback hosts. */
  allowLoopbackHttp?: boolean;
  allowLocalDemoHttp?: boolean;
};

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_OPERATIONS_PER_SESSION = 256;

function configuredBaseUrl(options: HospitalRepositoryOptions): string {
  try {
    const base = new URL(options.baseUrl);
    if (
      !allowedProtocol(
        base,
        options.allowLoopbackHttp,
        options.allowLocalDemoHttp,
      ) ||
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      !/^\/[A-Za-z0-9/_-]*$/.test(base.pathname) ||
      !Array.isArray(options.allowedOrigins) ||
      !options.allowedOrigins.length
    )
      throw new Error();
    const approved = options.allowedOrigins.every((value) => {
      const origin = new URL(value);
      return (
        allowedProtocol(
          origin,
          options.allowLoopbackHttp,
          options.allowLocalDemoHttp,
        ) && origin.origin === value
      );
    });
    if (!approved || !options.allowedOrigins.includes(base.origin))
      throw new Error();
    return base.href.replace(/\/+$/, "");
  } catch {
    throw new HospitalIntegrationError("config");
  }
}

export function isLocalDemoHost(host: string) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return true;
  const octets = host.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (octets[0] === 10 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31))
  );
}
function allowedProtocol(
  url: URL,
  allowLoopbackHttp = false,
  allowLocalDemoHttp = false,
) {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ((allowLoopbackHttp &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
        (allowLocalDemoHttp && isLocalDemoHost(url.hostname))))
  );
}

function httpError(status: number, write: boolean): HospitalIntegrationError {
  const code: HospitalErrorCode =
    status === 401
      ? "auth"
      : status === 403
        ? "scope"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 429
              ? "rate_limited"
              : status >= 500
                ? "server"
                : "invalid_response";
  return new HospitalIntegrationError(
    code,
    status,
    write && (status >= 500 || code === "invalid_response")
      ? "unknown"
      : undefined,
  );
}

async function readBoundedJson(
  response: Response,
  check: () => void,
): Promise<unknown> {
  const invalid = () => new HospitalIntegrationError("invalid_response");
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      response.headers.get("Content-Type") ?? "",
    )
  )
    throw invalid();
  const length = response.headers.get("Content-Length");
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
  )
    throw invalid();
  if (!response.body) throw invalid();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      check();
      const next = await reader.read();
      check();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw invalid();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw invalid();
  }
}

/** Inactive until explicitly constructed. No automatic retries, storage, logging or AI access. */
export function createHospitalRepository(
  options: HospitalRepositoryOptions,
): HospitalPatientRepository {
  const base = configuredBaseUrl(options);
  let scope: HospitalPatientScope;
  const auth = options.authentication;
  try {
    scope = Object.freeze(parseScope(auth.scope));
    if (
      !validId(auth.sessionId) ||
      typeof auth.subjectId !== "string" ||
      !auth.subjectId.trim() ||
      auth.subjectId.length > 512 ||
      /[\u0000-\u0020\u007f]/.test(auth.subjectId) ||
      typeof auth.isSessionActive !== "function" ||
      typeof auth.getAccessToken !== "function"
    )
      throw new Error();
  } catch {
    throw new HospitalIntegrationError("config");
  }
  const tokenContext: HospitalTokenContext = Object.freeze({
    ...scope,
    subjectId: auth.subjectId,
    sessionId: auth.sessionId,
  });
  const getAccessToken = auth.getAccessToken.bind(auth);
  const isSessionActive = auth.isSessionActive.bind(auth);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const path = `${base}/tenants/${scope.tenantId}/hospitals/${scope.hospitalId}/patients/${scope.patientId}`;
  const operations = new Map<string, string>();
  let disconnected = false;

  function check(signal?: AbortSignal, outcome?: "unknown") {
    if (signal?.aborted)
      throw new HospitalIntegrationError("aborted", undefined, outcome);
    let active = false;
    try {
      active = !disconnected && isSessionActive() === true;
    } catch {
      /* Sanitized below. */
    }
    if (!active) throw new HospitalIntegrationError("auth", undefined, outcome);
  }

  function bindOperation(key: string, body: string) {
    const previous = operations.get(key);
    if (previous !== undefined && previous !== body)
      throw new HospitalIntegrationError("conflict");
    if (previous === undefined && operations.size >= MAX_OPERATIONS_PER_SESSION)
      throw new HospitalIntegrationError("invalid_input");
    operations.set(key, body);
  }

  async function execute<T>(
    endpoint: string,
    resourceType: string,
    parse: (data: unknown, expectedScope: HospitalPatientScope) => T,
    readOptions: HospitalReadOptions = {},
    write?: { body: string; idempotencyKey: string; method?: "POST" | "PUT" },
  ): Promise<HospitalSnapshot<T>> {
    const signal = readOptions.signal;
    check(signal);
    let token: string | null;
    try {
      token = await getAccessToken(tokenContext, signal);
    } catch {
      check(signal);
      throw new HospitalIntegrationError("auth");
    }
    check(signal);
    if (!token || token.length > 8192 || !/^[A-Za-z0-9._~+/-]+=*$/.test(token))
      throw new HospitalIntegrationError("auth");
    let response: Response;
    try {
      response = await fetcher(`${path}/${endpoint}`, {
        method: write ? (write.method ?? "POST") : "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(write
            ? {
                "Content-Type": "application/json",
                "Idempotency-Key": write.idempotencyKey,
              }
            : {}),
        },
        ...(write ? { body: write.body } : {}),
        signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
    } catch {
      check(signal, write ? "unknown" : undefined);
      throw new HospitalIntegrationError(
        "network",
        undefined,
        write ? "unknown" : undefined,
      );
    } finally {
      token = null;
    }
    check(signal, write ? "unknown" : undefined);
    if (!(write ? [200, 201, 202] : [200]).includes(response.status))
      throw httpError(response.status, !!write);
    try {
      const body = await readBoundedJson(response, () =>
        check(signal, write ? "unknown" : undefined),
      );
      check(signal, write ? "unknown" : undefined);
      return parseSnapshot(body, scope, resourceType, parse);
    } catch (error) {
      check(signal, write ? "unknown" : undefined);
      if (error instanceof HospitalIntegrationError) {
        if (write && error.code === "invalid_response")
          throw new HospitalIntegrationError(
            "invalid_response",
            undefined,
            "unknown",
          );
        throw error;
      }
      throw new HospitalIntegrationError(
        "network",
        undefined,
        write ? "unknown" : undefined,
      );
    }
  }

  return {
    summary: (readOptions) =>
      execute("summary", "patient_summary", parseSummary, readOptions),
    appointments: (readOptions) =>
      execute(
        "appointments",
        "appointments",
        (data, expectedScope) =>
          parseList(data, expectedScope, parseAppointment),
        readOptions,
      ),
    journey: (readOptions) =>
      execute(
        "journey",
        "journey",
        (data, expectedScope) => parseList(data, expectedScope, parseJourney),
        readOptions,
      ),
    documents: (readOptions) =>
      execute(
        "documents",
        "documents",
        (data, expectedScope) => parseList(data, expectedScope, parseDocument),
        readOptions,
      ),
    requests: (readOptions) =>
      execute(
        "requests",
        "requests",
        (data, expectedScope) => parseList(data, expectedScope, parseRequest),
        readOptions,
      ),
    preferences: (readOptions) =>
      execute("preferences", "preferences", parsePreferences, readOptions),
    messages: (readOptions) =>
      execute(
        "messages",
        "messages",
        (data, expectedScope) => parseList(data, expectedScope, parseMessage),
        readOptions,
      ),
    async reportSymptoms(value, readOptions) {
      const input = validateSymptomReportInput(value);
      const body = JSON.stringify(input);
      bindOperation(`symptoms:${input.idempotencyKey}`, body);
      return execute(
        "symptom-reports",
        "symptom_report",
        (data, expectedScope) => {
          const result = parseSymptomReport(data, expectedScope);
          if (
            result.status === "recorded" &&
            (result.text !== input.text || result.source !== input.source)
          )
            throw new HospitalIntegrationError("invalid_response");
          return result;
        },
        readOptions,
        { body, idempotencyKey: input.idempotencyKey },
      );
    },
    async sendMessage(value, readOptions) {
      const input = validateMessageInput(value);
      const body = JSON.stringify(input);
      bindOperation(`message:${input.idempotencyKey}`, body);
      return execute(
        "messages",
        "message",
        (data, expectedScope) => {
          const result = parseMessage(data, expectedScope);
          if (result.role !== "patient" || result.text !== input.text)
            throw new HospitalIntegrationError("invalid_response");
          return result;
        },
        readOptions,
        { body, idempotencyKey: input.idempotencyKey },
      );
    },
    async updatePreferences(value, readOptions) {
      const input = validatePreferencesInput(value);
      const body = JSON.stringify(input);
      bindOperation(`preferences:${input.idempotencyKey}`, body);
      return execute(
        "preferences",
        "preferences",
        (data, expectedScope) => {
          const result = parsePreferences(data, expectedScope);
          if (
            ["locale", "explanation", "speechRate", "textScale"].some(
              (key) =>
                result[key as keyof typeof result] !==
                input[key as keyof typeof input],
            )
          )
            throw new HospitalIntegrationError("invalid_response");
          return result;
        },
        readOptions,
        { body, idempotencyKey: input.idempotencyKey, method: "PUT" },
      );
    },
    async submitRequest(value, readOptions) {
      const input = validateRequestInput(value);
      const body = JSON.stringify(input);
      bindOperation(`request:${input.idempotencyKey}`, body);
      return execute(
        "requests",
        "request",
        (data, expectedScope) => {
          const result = parseRequest(data, expectedScope);
          if (
            result.type !== input.type ||
            result.appointmentId !== input.appointmentId ||
            result.idempotencyKey !== input.idempotencyKey
          )
            throw new HospitalIntegrationError("invalid_response");
          return result;
        },
        readOptions,
        { body, idempotencyKey: input.idempotencyKey },
      );
    },
    async recordWellbeing(value, readOptions) {
      const input = validateWellbeingInput(value);
      const body = JSON.stringify(input);
      bindOperation(`wellbeing:${input.idempotencyKey}`, body);
      return execute(
        "wellbeing",
        "wellbeing_record",
        (data, expectedScope) => {
          const result = parseWellbeing(data, expectedScope);
          if (
            result.idempotencyKey !== input.idempotencyKey ||
            result.feeling !== input.feeling ||
            result.note !== input.note ||
            result.recordedAt !== input.recordedAt
          )
            throw new HospitalIntegrationError("invalid_response");
          return result;
        },
        readOptions,
        { body, idempotencyKey: input.idempotencyKey },
      );
    },
    disconnect() {
      disconnected = true;
      operations.clear();
    },
  };
}
