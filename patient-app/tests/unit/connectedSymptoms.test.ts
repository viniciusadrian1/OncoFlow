import { describe, expect, it, vi } from "vitest";
import { checkConnectedSymptoms } from "../../src/features/safety/connectedSymptoms";

const input = {
  text: "Estou com febre e vomitando",
  source: "voice" as const,
  locale: "pt-BR" as const,
  operationId: "turn-17",
};
const scope = {
  tenantId: "demo",
  hospitalId: "oncoflow",
  patientId: "pac-maria",
};
const recorded = {
  ...scope,
  id: "report-1",
  text: input.text,
  source: input.source,
  recordedAt: "2026-10-31T22:00:00Z",
  status: "recorded" as const,
  alertId: "alert-1",
  reviewRequired: true as const,
  guidance:
    "Procure avaliação no pronto atendimento, sem esperar pelo aplicativo.",
};

describe("connected symptoms before the model", () => {
  it("uses the authoritative guidance and announces only a recorded pending alert", async () => {
    const report = vi.fn().mockResolvedValue(recorded);
    const result = await checkConnectedSymptoms({
      report,
      input,
      signal: new AbortController().signal,
    });
    expect(report.mock.calls[0][0]).toEqual(input);
    expect(result.kind).toBe("recorded");
    expect(result.text).toContain(recorded.guidance);
    expect(result.text).toContain("Alerta registrado no painel");
    expect(result.text).not.toMatch(
      /médico foi notificado|a equipe leu|sem risco/i,
    );
  });
  it("lets an administrative, negated or educational turn continue when the server declines a report", async () => {
    const result = await checkConnectedSymptoms({
      report: async () => ({ ...scope, status: "not_applicable" }),
      input: { ...input, text: "E se eu tiver febre?" },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: "not_applicable" });
  });
  it("never claims delivery on a network failure and preserves urgent guidance", async () => {
    const result = await checkConnectedSymptoms({
      report: async () => {
        throw new Error("offline");
      },
      input,
      signal: new AbortController().signal,
    });
    expect(result.kind).toBe("unconfirmed");
    expect(result.text).toContain("Não consegui confirmar");
    expect(result.text).toContain("atendimento");
    expect(result.text).not.toContain("Alerta registrado");
  });
  it("bounds a stalled request and aborts its consumer without inventing an outcome", async () => {
    let dispatchedSignal: AbortSignal | undefined;
    const result = await checkConnectedSymptoms({
      report: async (_input, signal) => {
        dispatchedSignal = signal;
        return new Promise(() => {});
      },
      input,
      signal: new AbortController().signal,
      timeoutMs: 5,
    });
    expect(result.kind).toBe("unconfirmed");
    expect(dispatchedSignal?.aborted).toBe(true);
  });
  it("rejects cancellation instead of publishing a late acknowledgement to a closed or changed session", async () => {
    const controller = new AbortController();
    let accept!: (value: typeof recorded) => void;
    const task = checkConnectedSymptoms({
      report: async () =>
        new Promise((resolve) => {
          accept = resolve;
        }),
      input,
      signal: controller.signal,
    });
    const rejected = expect(task).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    accept(recorded);
    await rejected;
  });
  it("does not block an ordinary navigation request when symptom checking is unavailable", async () => {
    const result = await checkConnectedSymptoms({
      report: async () => {
        throw new Error("offline");
      },
      input: { ...input, text: "Abra minha agenda" },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ kind: "not_applicable" });
  });
  it("uses English when the current patient language is English", async () => {
    const result = await checkConnectedSymptoms({
      report: async () => {
        throw new Error("offline");
      },
      input: {
        ...input,
        locale: "en-US",
        text: "I have a fever and I am vomiting",
      },
      signal: new AbortController().signal,
    });
    expect(result.text).toContain("could not confirm");
    expect(result.text).toContain("care");
  });
});
