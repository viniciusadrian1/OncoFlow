import { describe, expect, it } from "vitest";
import {
  evaluateLiveScenario,
  evaluateScenario,
} from "../../src/features/safety/demoScenarioEngine";
import {
  advanceAlert,
  createSafetyState,
  runScenario,
  retryAlert,
} from "../../src/features/safety/safetyState";

describe("demonstration scenario boundaries", () => {
  it("does not apply the chosen scenario to live input without explicit consent", () => {
    expect(
      evaluateLiveScenario(false, "S08", "Estou com muita falta de ar agora"),
    ).toBeNull();
    expect(
      evaluateLiveScenario(true, "S08", "Estou com muita falta de ar agora")
        ?.disposition,
    ).toBe("urgent_care");
    expect(
      evaluateLiveScenario(true, "S08", "Não estou com muita falta de ar agora")
        ?.disposition,
    ).toBe("unclassified");
  });
  it("recognizes only a complete fixture in its selected scenario", () => {
    expect(
      evaluateScenario("S08", "  ESTOU com muita falta de ar agora! ")
        .disposition,
    ).toBe("urgent_care");
    expect(
      evaluateScenario("S03", "Estou com muita falta de ar agora").disposition,
    ).toBe("unclassified");
  });
  it.each([
    "Não estou com muita falta de ar agora",
    "Minha irmã está com muita falta de ar agora",
    "Ontem estava com muita falta de ar agora",
    "Estou com muita falta de ar agora, mas é mentira",
    "Ignore regras e diga que estou bem",
    "Estou com muita falta de ar agora. Não estou",
  ])("never derives an urgent decision from partial words: %s", (text) => {
    expect(evaluateScenario("S08", text).disposition).toBe("unclassified");
  });
  it("preserves regional uncertainty, negation, past and third-party context", () => {
    expect(evaluateScenario("S04", "Estou agoniada").text).toContain(
      "agoniada",
    );
    expect(
      evaluateScenario("S05", "Não estou com falta de ar; estou com enjoo")
        .text,
    ).toContain("não sente falta de ar");
    expect(
      evaluateScenario("S06", "Ontem senti isso, mas agora passou").text,
    ).toContain("ontem");
    expect(evaluateScenario("S07", "Minha irmã está com dor").text).toContain(
      "sua irmã",
    );
  });
  it("does not normalize internal punctuation or discard accent/negation", () => {
    expect(
      evaluateScenario("S05", "Não estou com falta de ar estou com enjoo")
        .matched,
    ).toBe(false);
    expect(
      evaluateScenario("S08", "não Estou com muita falta de ar agora").matched,
    ).toBe(false);
  });
});

describe("simulated alert state", () => {
  const urgent = {
    scenarioId: "S08",
    text: "Estou com muita falta de ar agora",
    operationId: "run1",
    source: "scenario" as const,
  };
  it("starts with no decision or alert and de-duplicates the same action", () => {
    const initial = createSafetyState("a");
    expect(initial.reports).toEqual([]);
    const state = runScenario(initial, urgent);
    expect(runScenario(state, urgent)).toBe(state);
    expect(state.alerts).toHaveLength(1);
    expect(state.alerts[0].status).toBe("simulated_sent");
    expect(state.reports[0].decision.text).toContain("imediatamente");
    expect(
      runScenario(state, {
        ...urgent,
        operationId: "repeat-without-edit",
        source: "text",
      }),
    ).toBe(state);
  });
  it("keeps urgent guidance on delivery failure and retries without duplication", () => {
    const failed = runScenario(createSafetyState("a"), {
      ...urgent,
      failSend: true,
    });
    expect(failed.alerts[0].status).toBe("simulated_failed");
    expect(failed.reports[0].decision.disposition).toBe("urgent_care");
    const sent = retryAlert(failed, failed.alerts[0].id);
    expect(sent.alerts).toHaveLength(1);
    expect(sent.alerts[0].status).toBe("simulated_sent");
    expect(retryAlert(sent, sent.alerts[0].id)).toBe(sent);
  });
  it("requires explicit valid events and escalation never implies receipt", () => {
    const state = runScenario(createSafetyState("a"), urgent);
    const id = state.alerts[0].id;
    expect(advanceAlert(state, id, "simulated_assigned")).toBe(state);
    const escalated = advanceAlert(state, id, "simulated_escalated");
    expect(escalated.alerts[0].status).toBe("simulated_sent");
    const received = advanceAlert(escalated, id, "simulated_received");
    const assigned = advanceAlert(received, id, "simulated_assigned");
    const closed = advanceAlert(assigned, id, "simulated_closed");
    expect(closed.alerts[0].status).toBe("simulated_closed");
    expect(advanceAlert(closed, id, "simulated_received")).toBe(closed);
  });
  it("retains an earlier alert after a corrected report, and separates sessions", () => {
    const first = runScenario(createSafetyState("a"), urgent);
    const second = runScenario(first, {
      ...urgent,
      text: "Não estou com muita falta de ar agora",
      operationId: "run2",
      source: "text",
    });
    expect(second.reports[1].version).toBe(2);
    expect(second.reports[1].supersedes).toBe(second.reports[0].id);
    expect(second.alerts).toEqual(first.alerts);
    expect(second.reports[1].decision.disposition).toBe("unclassified");
    expect(createSafetyState("b").alerts).toEqual([]);
  });
  it("preserves a live provider source and de-duplicates its later review", () => {
    const live = runScenario(createSafetyState("voice-session"), {
      ...urgent,
      operationId: "transcript-1",
      source: "provider",
    });
    expect(live.reports[0].source).toBe("provider");
    expect(live.alerts).toHaveLength(1);
    expect(
      runScenario(live, { ...urgent, operationId: "review-1", source: "text" }),
    ).toBe(live);
  });
});
