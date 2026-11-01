import { beforeEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ request: vi.fn(), isNative: true }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => native.isNative },
  CapacitorHttp: { request: native.request },
}));
import { hospitalFetch } from "../../src/integrations/nativeHttp";
beforeEach(() => {
  native.request.mockReset();
  native.isNative = true;
});
it("uses native JSON transport without following redirects or retrying a write", async () => {
  native.request.mockResolvedValue({
    data: { ok: true },
    status: 202,
    headers: { "content-type": "application/json" },
    url: "http://10.0.2.2:3000/api/request",
  });
  const response = await hospitalFetch("http://10.0.2.2:3000/api/request", {
    method: "POST",
    headers: {
      Authorization: "Bearer fictional-test",
      "Content-Type": "application/json",
      "Idempotency-Key": "one-operation",
    },
    body: JSON.stringify({ confirmed: true }),
  });
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ ok: true });
  expect(native.request).toHaveBeenCalledTimes(1);
  expect(native.request.mock.calls[0][0]).toMatchObject({
    disableRedirects: true,
    data: '{"confirmed":true}',
    headers: {
      authorization: "Bearer fictional-test",
      "idempotency-key": "one-operation",
    },
  });
});
it.each([
  "http://public.example/api",
  "https://user:password@example.org/api",
  "file:///tmp/a",
])("rejects unsafe native destinations: %s", async (url) => {
  await expect(hospitalFetch(url)).rejects.toThrow();
  expect(native.request).not.toHaveBeenCalled();
});
it("discards a late native response after consumer cancellation", async () => {
  let finish!: (value: unknown) => void;
  native.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new AbortController();
  const pending = hospitalFetch("https://demo.example/api", {
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  finish({
    status: 200,
    data: { ok: true },
    headers: { "content-type": "application/json" },
  });
  await Promise.resolve();
  expect(native.request).toHaveBeenCalledTimes(1);
});
