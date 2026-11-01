import { describe, expect, it } from "vitest";
import { discoverDemoService } from "../../src/integrations/hospital/discovery";

const api = "https://api.github.com/repos/viniciusadrian1/OncoFlow";
const deploymentList = `${api}/deployments?environment=Production&per_page=10`;
const publicConfig =
  "https://raw.githubusercontent.com/viniciusadrian1/OncoFlow/main/platform/mobile-config.json";
const config = (origin: string) => ({
  apiVersion: "1",
  demo: true,
  autoConnectEnabled: true,
  serviceUrl: origin,
  defaultPatientId: "pac-maria",
});
const health = { status: "ok", service: "OncoFlow" };
function harness(responses: Record<string, unknown>, cached?: string) {
  const values = new Map<string, string>();
  if (cached) values.set("oncoflow-public-service-origin", cached);
  const requested: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requested.push(url);
    expect(init?.redirect).toBe("error");
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    const body = responses[url];
    if (body instanceof Error) throw body;
    if (body === undefined)
      return new Response("{}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    return new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  };
  return {
    fetcher,
    requested,
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  };
}

describe("automatic public service discovery", () => {
  it("uses the hosted web origin and the server's canonical URL without GitHub or a typed address", async () => {
    const h = harness({
      "https://preview.example/api/health": health,
      "https://preview.example/api/mobile/config": config(
        "https://onco.example",
      ),
      "https://onco.example/api/health": health,
      "https://onco.example/api/mobile/config": config("https://onco.example"),
    });
    expect(
      await discoverDemoService({
        native: false,
        webOrigin: "https://preview.example",
        fetch: h.fetcher,
        storage: h.storage,
      }),
    ).toEqual({
      origin: "https://onco.example",
      defaultPatientId: "pac-maria",
      allowLocalDemoHttp: false,
    });
    expect(h.requested.some((url) => url.includes("github"))).toBe(false);
    expect([...h.values.values()]).toEqual(["https://onco.example"]);
  });

  it("discovers only successful Production deployment statuses from the fixed repository", async () => {
    const h = harness({
      [deploymentList]: [
        {
          id: 12,
          environment: "Production",
          statuses_url: "https://untrusted.example/status",
        },
        { id: 11, environment: "Production" },
      ],
      [`${api}/deployments/12/statuses?per_page=10`]: [
        { state: "failure", environment_url: "https://failed.example" },
      ],
      [`${api}/deployments/11/statuses?per_page=10`]: [
        { state: "success", environment_url: "https://deployment.example" },
      ],
      "https://deployment.example/api/health": health,
      "https://deployment.example/api/mobile/config": config(
        "https://deployment.example",
      ),
    });
    expect(
      (
        await discoverDemoService({
          native: true,
          fetch: h.fetcher,
          storage: h.storage,
        })
      ).origin,
    ).toBe("https://deployment.example");
    expect(h.requested).not.toContain("https://untrusted.example/status");
    expect(h.requested.some((url) => url.includes("failed.example"))).toBe(
      false,
    );
  });

  it("returns an ordinary unavailable error when no deployment exists, without inventing a hostname", async () => {
    const h = harness({ [deploymentList]: [] });
    await expect(
      discoverDemoService({
        native: true,
        fetch: h.fetcher,
        storage: h.storage,
      }),
    ).rejects.toMatchObject({ code: "server" });
    expect(
      h.requested.every(
        (url) =>
          url.startsWith("https://api.github.com/") ||
          url.startsWith("https://raw.githubusercontent.com/"),
      ),
    ).toBe(true);
    expect(h.values.size).toBe(0);
  });

  it("revalidates a cached public URL when GitHub is unavailable and never stores a credential", async () => {
    const h = harness(
      {
        [deploymentList]: new TypeError("GitHub unavailable"),
        "https://cached.example/api/health": health,
        "https://cached.example/api/mobile/config": config(
          "https://cached.example",
        ),
      },
      "https://cached.example",
    );
    expect(
      (
        await discoverDemoService({
          native: true,
          fetch: h.fetcher,
          storage: h.storage,
        })
      ).origin,
    ).toBe("https://cached.example");
    expect(h.requested.some((url) => url.includes("github.com"))).toBe(false);
    expect([...h.values.entries()]).toEqual([
      ["oncoflow-public-service-origin", "https://cached.example"],
    ]);
  });

  it("allows a developer's optional public repository config when deployment metadata is absent", async () => {
    const h = harness({
      [deploymentList]: [],
      [publicConfig]: {
        apiVersion: "1",
        serviceUrl: "https://configured.example",
      },
      "https://configured.example/api/health": health,
      "https://configured.example/api/mobile/config": config(
        "https://configured.example",
      ),
    });
    expect(
      (
        await discoverDemoService({
          native: true,
          fetch: h.fetcher,
          storage: h.storage,
        })
      ).origin,
    ).toBe("https://configured.example");
  });

  it("rejects public HTTP, credentials, wrong health, malformed config and disabled automatic sessions", async () => {
    for (const serviceUrl of [
      "http://public.example",
      "https://user:secret@public.example",
      "https://public.example/path",
      "https://public.example?token=secret",
    ]) {
      const h = harness({
        [deploymentList]: [],
        [publicConfig]: { apiVersion: "1", serviceUrl },
      });
      await expect(
        discoverDemoService({
          native: true,
          fetch: h.fetcher,
          storage: h.storage,
        }),
      ).rejects.toMatchObject({ code: "server" });
      expect(h.requested.some((url) => url.startsWith(serviceUrl))).toBe(false);
    }
    for (const bad of [
      { ...config("https://web.example"), autoConnectEnabled: false },
      { ...config("https://web.example"), demo: false },
      { ...config("https://web.example"), defaultPatientId: "../other" },
    ]) {
      const h = harness({
        "https://web.example/api/health": health,
        "https://web.example/api/mobile/config": bad,
      });
      await expect(
        discoverDemoService({
          native: false,
          webOrigin: "https://web.example",
          fetch: h.fetcher,
          storage: h.storage,
        }),
      ).rejects.toMatchObject({ code: "server" });
    }
    const h = harness({
      "https://web.example/api/health": {
        status: "ok",
        service: "Another app",
      },
      "https://web.example/api/mobile/config": config("https://web.example"),
    });
    await expect(
      discoverDemoService({
        native: false,
        webOrigin: "https://web.example",
        fetch: h.fetcher,
        storage: h.storage,
      }),
    ).rejects.toMatchObject({ code: "server" });
  });

  it("permits same-origin local web demonstrations without allowing a native HTTP discovery URL", async () => {
    const origin = "http://127.0.0.1:3000";
    const h = harness({
      [`${origin}/api/health`]: health,
      [`${origin}/api/mobile/config`]: config(origin),
    });
    expect(
      await discoverDemoService({
        native: false,
        webOrigin: origin,
        fetch: h.fetcher,
        storage: h.storage,
      }),
    ).toMatchObject({ origin, allowLocalDemoHttp: true });
  });
});
