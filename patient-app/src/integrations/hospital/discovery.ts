import { HospitalIntegrationError } from "./errors";
import { hospitalFetch } from "../nativeHttp";
import { hospitalOrigin } from "./connection";
import { validId } from "./validation";

export type DemoService = {
  origin: string;
  defaultPatientId: string;
  allowLocalDemoHttp: boolean;
};
export type DiscoveryOptions = {
  native: boolean;
  webOrigin?: string;
  fetch?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  signal?: AbortSignal;
};
const REPOSITORY_API = "https://api.github.com/repos/viniciusadrian1/OncoFlow";
const PUBLIC_CONFIGS = [
  "platform/mobile-config.json",
  "public/mobile-config.json",
].map(
  (path) =>
    `https://raw.githubusercontent.com/viniciusadrian1/OncoFlow/main/${path}`,
);
const CACHE_KEY = "oncoflow-public-service-origin";

/** Public metadata only. This transport never receives a patient token or provider key. */
export async function readPublicJson(
  url: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  plainText = false,
): Promise<unknown> {
  if (signal?.aborted) throw new HospitalIntegrationError("aborted");
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal,
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (
    !response.ok ||
    (!plainText &&
      !/^application\/(?:json|vnd\.github\+json)(?:\s*;|$)/i.test(
        response.headers.get("Content-Type") ?? "",
      )) ||
    !response.body
  )
    throw new HospitalIntegrationError("server");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new HospitalIntegrationError("aborted");
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > 128 * 1024) {
        await reader.cancel();
        throw new HospitalIntegrationError("invalid_response");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (signal?.aborted) throw new HospitalIntegrationError("aborted");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HospitalIntegrationError("invalid_response");
  }
}

function config(value: unknown, allowLocalDemoHttp: boolean): DemoService {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HospitalIntegrationError("invalid_response");
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).sort().join() !==
      "apiVersion,autoConnectEnabled,defaultPatientId,demo,serviceUrl" ||
    item.apiVersion !== "1" ||
    item.demo !== true ||
    item.autoConnectEnabled !== true ||
    typeof item.serviceUrl !== "string" ||
    !validId(item.defaultPatientId)
  )
    throw new HospitalIntegrationError("invalid_response");
  const origin = hospitalOrigin(item.serviceUrl, allowLocalDemoHttp);
  return {
    origin,
    defaultPatientId: item.defaultPatientId,
    allowLocalDemoHttp: origin.startsWith("http:"),
  };
}

async function validateService(
  candidate: string,
  options: DiscoveryOptions,
  signal: AbortSignal,
): Promise<DemoService> {
  const allowLocal = !options.native && candidate === options.webOrigin;
  const origin = hospitalOrigin(candidate, allowLocal);
  const fetcher = options.fetch ?? hospitalFetch;
  async function check(address: string) {
    const [health, rawConfig] = await Promise.all([
      readPublicJson(`${address}/api/health`, fetcher, signal),
      readPublicJson(`${address}/api/mobile/config`, fetcher, signal),
    ]);
    if (
      !health ||
      typeof health !== "object" ||
      (health as Record<string, unknown>).status !== "ok" ||
      (health as Record<string, unknown>).service !== "OncoFlow"
    )
      throw new HospitalIntegrationError("invalid_response");
    return config(rawConfig, allowLocal);
  }
  const first = await check(origin);
  if (first.origin === origin) return first;
  // A preview may point to the canonical production origin; validate it independently.
  const canonical = await check(first.origin);
  if (
    canonical.origin !== first.origin ||
    canonical.defaultPatientId !== first.defaultPatientId
  )
    throw new HospitalIntegrationError("invalid_response");
  return canonical;
}

/** Called only by an explicit entry action. No guessed host and no welcome-screen network activity. */
export async function discoverDemoService(
  options: DiscoveryOptions,
): Promise<DemoService> {
  const deadline = new AbortController();
  const abort = () => deadline.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) deadline.abort();
  const timer = setTimeout(abort, 12000);
  const fetcher = options.fetch ?? hospitalFetch;
  const candidates: string[] = [];
  const tryCandidate = async (candidate: string) => {
    try {
      const service = await validateService(
        candidate,
        options,
        deadline.signal,
      );
      try {
        options.storage?.setItem(CACHE_KEY, service.origin);
      } catch {
        /* Public URL cache is optional. */
      }
      return service;
    } catch {
      return null;
    }
  };
  try {
    if (!options.native) {
      if (options.webOrigin) {
        const service = await tryCandidate(options.webOrigin);
        if (service) return service;
      }
      throw new HospitalIntegrationError("server");
    }
    // The published address is bundled from the repository's public configuration.
    // A fresh APK can connect directly, without a GitHub request or a pairing code.
    const publishedOrigin = import.meta.env.VITE_ONCOFLOW_SERVICE_ORIGIN;
    if (typeof publishedOrigin === "string" && publishedOrigin) {
      const service = await tryCandidate(publishedOrigin);
      if (service) return service;
    }
    // A revalidated cache and repository discovery remain fallbacks if the domain changes.
    try {
      const cached = options.storage?.getItem(CACHE_KEY);
      if (cached) {
        const service = await tryCandidate(hospitalOrigin(cached));
        if (service) return service;
      }
    } catch {
      /* A stale URL falls through to discovery. */
    }
    try {
      const deployments = await readPublicJson(
        `${REPOSITORY_API}/deployments?environment=Production&per_page=10`,
        fetcher,
        deadline.signal,
      );
      if (Array.isArray(deployments)) {
        for (const value of deployments.slice(0, 10)) {
          if (!value || typeof value !== "object") continue;
          const item = value as Record<string, unknown>;
          if (
            !Number.isSafeInteger(item.id) ||
            Number(item.id) <= 0 ||
            item.environment !== "Production"
          )
            continue;
          try {
            // Construct the repository-scoped path; never follow statuses_url from a response.
            const statuses = await readPublicJson(
              `${REPOSITORY_API}/deployments/${item.id}/statuses?per_page=10`,
              fetcher,
              deadline.signal,
            );
            const latest = Array.isArray(statuses)
              ? (statuses[0] as Record<string, unknown>)
              : null;
            if (
              latest?.state === "success" &&
              typeof latest.environment_url === "string"
            ) {
              const service = await tryCandidate(
                hospitalOrigin(latest.environment_url),
              );
              if (service) return service;
            }
          } catch {
            /* Try another deployment, then public configuration/cache. */
          }
        }
      }
    } catch {
      /* GitHub may be rate-limited or deployment metadata may not exist yet. */
    }
    for (const url of PUBLIC_CONFIGS) {
      try {
        const item = (await readPublicJson(
          url,
          fetcher,
          deadline.signal,
          true,
        )) as Record<string, unknown>;
        if (
          item &&
          Object.keys(item).sort().join() === "apiVersion,serviceUrl" &&
          item.apiVersion === "1" &&
          typeof item.serviceUrl === "string"
        )
          candidates.push(hospitalOrigin(item.serviceUrl));
      } catch {
        /* An optional file may be absent. */
      }
    }
    try {
      const cached = options.storage?.getItem(CACHE_KEY);
      if (cached) candidates.push(hospitalOrigin(cached));
    } catch {
      /* Invalid or unavailable cache is ignored. */
    }
    for (const candidate of [...new Set(candidates)]) {
      const service = await tryCandidate(candidate);
      if (service) return service;
    }
    throw new HospitalIntegrationError(
      options.signal?.aborted ? "aborted" : "server",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
