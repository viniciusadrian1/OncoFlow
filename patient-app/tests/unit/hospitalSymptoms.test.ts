import { describe, expect, it } from "vitest";
import { createHospitalRepository } from "../../src/integrations/hospital/repository";
import { createHospitalConnection } from "../../src/integrations/hospital/connection";
import { buildLiaContext } from "../../src/features/lia/actions";
import { createConnectedSession } from "../../src/app/session";
import type { LiaAppSnapshot } from "../../shared/liaActions";
import { personas } from "../../src/demo/fixtures";

const scope = {
  tenantId: "demo",
  hospitalId: "oncoflow",
  patientId: "pac-maria",
};
const now = "2026-10-31T12:00:00Z";
const careContext = {
  diagnosisLabel: "Câncer de mama",
  treatmentLabel: "Acompanhamento com equipe",
  sourceLabel: "Cadastro confirmado do hospital",
  patientInstructions: [
    "Use o canal da equipe para dúvidas sobre o plano publicado.",
  ],
};
const json = (resourceType: string, data: unknown) =>
  new Response(
    JSON.stringify({ apiVersion: "1", resourceType, scope, asOf: now, data }),
    { headers: { "Content-Type": "application/json" } },
  );
const recorded = {
  ...scope,
  id: "report-1",
  text: "Estou com dor agora",
  source: "voice",
  recordedAt: now,
  status: "recorded",
  alertId: "alert-1",
  reviewRequired: true,
  guidance: "Relato registrado; a equipe precisa revisar.",
};
function repository(fetcher: typeof fetch) {
  return createHospitalRepository({
    baseUrl: "https://hospital.example/api/v1",
    allowedOrigins: ["https://hospital.example"],
    fetch: fetcher,
    authentication: {
      scope,
      subjectId: "patient-session",
      sessionId: "session-1",
      isSessionActive: () => true,
      getAccessToken: async () => "memory-token",
    },
  });
}
function appSnapshot(): LiaAppSnapshot {
  return {
    context: createConnectedSession("pac-maria"),
    persona: {
      ...personas[0],
      id: "pac-maria",
      name: "Maria",
      firstName: "Maria",
    },
    page: "profile",
    prefs: { explanation: "short", speechRate: 1, textScale: 1 },
    appointments: [],
    journey: [],
    documents: [],
    requests: [],
    savedMood: "",
    connected: { status: "ready", asOf: now },
    careContext,
  };
}

describe("authorized cancer context", () => {
  it("reads only the published context fields without manufacturing treatment or staging", async () => {
    const result = await repository(async () =>
      json("patient_summary", {
        ...scope,
        id: "summary",
        displayName: "Maria",
        careTeamLabel: "Equipe",
        careContext,
      }),
    ).summary();
    expect(result.data.careContext).toEqual(careContext);
    const context = JSON.parse(buildLiaContext(appSnapshot()));
    expect(context.careContext).toEqual(careContext);
    expect(JSON.stringify(context)).not.toMatch(
      /chemotherapy|quimioterapia|immunosuppressed|imunossupress|prognosis|prognóstico|stage|estágio/,
    );
    expect(context.careContext.cycleLabel).toBeUndefined();
  });

  it("rejects uncontracted clinical inferences and bounds published instructions as valid JSON", async () => {
    await expect(
      repository(async () =>
        json("patient_summary", {
          ...scope,
          id: "summary",
          displayName: "Maria",
          careTeamLabel: "Equipe",
          careContext: { ...careContext, immunosuppressed: true },
        }),
      ).summary(),
    ).rejects.toMatchObject({ code: "invalid_response" });
    const large = appSnapshot();
    large.careContext = {
      ...careContext,
      patientInstructions: Array.from({ length: 100 }, () => "x".repeat(50000)),
    };
    const serialized = buildLiaContext(large);
    expect(serialized.length).toBeLessThanOrEqual(20000);
    expect(JSON.parse(serialized)).toMatchObject({
      truncated: true,
      careContext: { diagnosisLabel: "Câncer de mama" },
    });
    large.connected = undefined;
    expect(JSON.parse(buildLiaContext(large)).careContext).toBeUndefined();
  });
});

describe("automatic scoped symptom reporting", () => {
  const input = {
    text: "Estou com dor agora",
    source: "voice" as const,
    locale: "pt-BR" as const,
    idempotencyKey: "utterance-1",
  };

  it("returns a server receipt only after acknowledgement and retries the same operation without duplicating it", async () => {
    const bodies: string[] = [];
    let stored = 0;
    const seen = new Set<string>();
    const repo = repository(async (url, init) => {
      expect(String(url)).toContain("/patients/pac-maria/symptom-reports");
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      bodies.push(body);
      const parsed = JSON.parse(body);
      expect(parsed).not.toHaveProperty("confirmation");
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe(
        "utterance-1",
      );
      if (!seen.has(parsed.idempotencyKey)) {
        seen.add(parsed.idempotencyKey);
        stored++;
      }
      if (bodies.length === 1)
        throw new TypeError("response lost after storage");
      return json("symptom_report", recorded);
    });
    const connection = createHospitalConnection(repo, {
      scope,
      displayName: "Maria",
      expiresAt: "2099-10-31T12:00:00Z",
    });
    expect(connection).toHaveProperty("reportSymptoms", expect.any(Function));
    const callerInput = { ...input };
    await expect(connection.reportSymptoms(callerInput)).rejects.toMatchObject({
      code: "network",
      outcome: "unknown",
    });
    callerInput.text = "Objeto do chamador alterado após o envio";
    const result = await connection.reportSymptoms(input);
    expect(result).toMatchObject({
      status: "recorded",
      alertId: "alert-1",
      reviewRequired: true,
    });
    expect(await connection.reportSymptoms(input)).toEqual(result);
    expect(stored).toBe(1);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
  });

  it("accepts a non-applicable classification without inventing a report or alert", async () => {
    const repo = repository(async () =>
      json("symptom_report", { ...scope, status: "not_applicable" }),
    );
    expect(repo).toHaveProperty("reportSymptoms", expect.any(Function));
    const result = await repo.reportSymptoms({
      ...input,
      text: "Quero abrir minha agenda",
    });
    expect(result.data).toEqual({ ...scope, status: "not_applicable" });
    expect(result.data).not.toHaveProperty("id");
  });

  it("rejects cross-patient receipts, unacknowledged statuses and false review claims", async () => {
    for (const bad of [
      { ...recorded, patientId: "pac-outro" },
      { ...recorded, status: "delivered" },
      { ...recorded, reviewRequired: false },
      { ...scope, status: "not_applicable", alertId: "invented" },
    ]) {
      const repo = repository(async () => json("symptom_report", bad));
      expect(repo).toHaveProperty("reportSymptoms", expect.any(Function));
      await expect(repo.reportSymptoms(input)).rejects.toMatchObject({
        code: "invalid_response",
        outcome: "unknown",
      });
    }
  });

  it("does not deliver a late receipt after disconnect or voice cancellation", async () => {
    let finish!: (response: Response) => void;
    const repo = repository(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const connection = createHospitalConnection(repo, {
      scope,
      displayName: "Maria",
      expiresAt: "2099-10-31T12:00:00Z",
    });
    expect(connection).toHaveProperty("reportSymptoms", expect.any(Function));
    const controller = new AbortController();
    const pending = connection.reportSymptoms(input, {
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    connection.disconnect();
    finish(json("symptom_report", recorded));
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(connection.getSnapshot()).toMatchObject({
      pending: 0,
      messages: [],
    });
  });
});
