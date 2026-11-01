import { Capacitor, CapacitorHttp } from "@capacitor/core";

const aborted = () => new DOMException("Request canceled", "AbortError");

function allowedDestination(url: URL): boolean {
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname;
  if (["localhost", "[::1]"].includes(host)) return true;
  const parts = host.split(".").map(Number);
  return (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
  );
}

/** Native transport for the explicitly paired service. No global fetch patch,
 * cookies, automatic redirects or retries. HTTP is restricted to local demo hosts;
 * the connection/repository layer additionally requires the user's LAN opt-in.
 */
export const hospitalFetch: typeof fetch = async (input, init) => {
  if (!Capacitor.isNativePlatform()) return globalThis.fetch(input, init);
  const request = new Request(input, init);
  const signal = init?.signal ?? request.signal;
  if (signal?.aborted) throw aborted();
  const url = new URL(request.url);
  if (!allowedDestination(url)) throw new Error("Invalid hospital destination");
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const data = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  if (data && data.length > 256 * 1024)
    throw new Error("Hospital request too large");
  if (signal?.aborted) throw aborted();
  // Capacitor cannot cancel an already dispatched HTTP request. Rejecting promptly
  // cancels its consumer; a dispatched write may still have an unknown outcome.
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(aborted());
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    CapacitorHttp.request({
      url: url.href,
      method: request.method,
      headers,
      data,
      responseType: "text",
      disableRedirects: true,
      connectTimeout: 10_000,
      readTimeout: 15_000,
    }).then(
      (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          if (result.url && new URL(result.url).origin !== url.origin)
            throw new Error();
          const body =
            typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data);
          if (!body || new TextEncoder().encode(body).byteLength > 256 * 1024)
            throw new Error();
          resolve(
            new Response(body, {
              status: result.status,
              headers: result.headers,
            }),
          );
        } catch {
          reject(new Error("Invalid hospital response"));
        }
      },
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Hospital connection unavailable"));
      },
    );
  });
};
