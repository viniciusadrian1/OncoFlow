import { expect, it } from "vitest";
import { startDemoHospital } from "../../src/integrations/hospital/demoAccess";

const service = {
  origin: "https://hospital.example",
  defaultPatientId: "pac-maria",
  allowLocalDemoHttp: false,
};
const scope = {
  tenantId: "demo",
  hospitalId: "oncoflow",
  patientId: "pac-maria",
};
const patients = {
  demo: true,
  patients: [
    { id: "pac-maria", displayName: "Maria do servidor" },
    { id: "pac-joao", displayName: "João do servidor" },
  ],
  defaultPatientId: "pac-maria",
};
function transport(receivedScope = scope) {
  const sent: { url: string; body?: unknown; authorization: string | null }[] =
    [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input),
      body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({
      url,
      body,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const data = url.endsWith("demo-patients")
      ? patients
      : {
          accessToken: "memory-only-server-token",
          expiresAt: "2099-01-01T00:00:00Z",
          scope: receivedScope,
          patient: { displayName: "Maria do servidor" },
          demo: true,
        };
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  };
  return { sent, fetcher };
}
it("enters the server's default fictional patient without a pairing code and keeps the token outside the visible result", async () => {
  const t = transport();
  const result = await startDemoHospital({ service, fetch: t.fetcher });
  expect(result.connection.scope).toEqual(scope);
  expect(result.connection.displayName).toBe("Maria do servidor");
  expect(result.patients).toEqual(patients.patients);
  expect(t.sent).toEqual([
    {
      url: "https://hospital.example/api/mobile/demo-patients",
      authorization: null,
    },
    {
      url: "https://hospital.example/api/mobile/demo-session",
      body: { patientId: "pac-maria" },
      authorization: null,
    },
  ]);
  expect(JSON.stringify(result)).not.toMatch(/memory-only-server-token|code/);
  result.connection.disconnect();
});
it("rejects a response bound to another patient, tenant or hospital", async () => {
  for (const bad of [
    { ...scope, patientId: "pac-joao" },
    { ...scope, tenantId: "other" },
    { ...scope, hospitalId: "other" },
  ]) {
    await expect(
      startDemoHospital({ service, fetch: transport(bad).fetcher }),
    ).rejects.toMatchObject({ code: "scope" });
  }
});
it("allows a different fictional profile only from the server list and never accepts an arbitrary patient ID", async () => {
  const otherScope = { ...scope, patientId: "pac-joao" };
  const t = transport(otherScope);
  const result = await startDemoHospital({
    service,
    patientId: "pac-joao",
    fetch: t.fetcher,
  });
  expect(result.connection.scope.patientId).toBe("pac-joao");
  const invalid = transport();
  await expect(
    startDemoHospital({
      service,
      patientId: "not-listed",
      fetch: invalid.fetcher,
    }),
  ).rejects.toMatchObject({ code: "scope" });
  expect(invalid.sent).toHaveLength(1);
});
