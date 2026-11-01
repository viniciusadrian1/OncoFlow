import { describe, expect, it, vi } from "vitest";
import { createLiaAppBridge } from "../../src/app/liaAppBridge";
import { createPatientDataPort } from "../../src/adapters/patientData.mock";
import { createConnectedSession, createSession } from "../../src/app/session";
import { personas } from "../../src/demo/fixtures";
import type { LiaAppSnapshot, LiaAction } from "../../shared/liaActions";

function fixture() {
  const data = createPatientDataPort();
  const context = createSession("marina");
  const state: LiaAppSnapshot = {
    context,
    persona: personas[0],
    page: "home",
    prefs: { textScale: 1, speechRate: 1, explanation: "short" },
    appointments: data.appointments(context),
    documents: data.documents(context),
    journey: data.journey(context),
    requests: [],
    savedMood: "",
  };
  const navigate = vi.fn((page) => {
    state.page = page;
  });
  const openAppointment = vi.fn(),
    openDocument = vi.fn();
  const saveMood = vi.fn((mood) => {
    state.savedMood = mood;
  });
  const updatePreferences = vi.fn((prefs) => {
    state.prefs = prefs;
  });
  const bridge = createLiaAppBridge({
    data,
    getSnapshot: () => ({ ...state, requests: data.requests(state.context) }),
    navigate,
    openAppointment,
    openDocument,
    saveMood,
    updatePreferences,
  });
  const execute = (action: LiaAction) =>
    bridge.execute(action, "op-test", context);
  return {
    state,
    data,
    bridge,
    execute,
    navigate,
    openDocument,
    openAppointment,
    saveMood,
    updatePreferences,
  };
}

describe("Lia app actions execute against real demo state", () => {
  it("reads the current profile agenda without inventing another person or date", () => {
    const f = fixture();
    const result = f.execute({ type: "read", target: "agenda", value: null });
    expect(result.status).toBe("completed");
    expect(result.text).toContain("03 de novembro");
    expect(result.text).toContain("09:30");
    expect(f.navigate).not.toHaveBeenCalled();
  });
  it("navigates and opens only a document present in the current profile", () => {
    const f = fixture(),
      doc = f.state.documents[0];
    expect(
      f.execute({ type: "open_document", target: doc.id, value: null }).showApp,
    ).toBe(true);
    expect(f.navigate).toHaveBeenCalledWith("documents");
    expect(f.openDocument).toHaveBeenCalledWith(doc);
    f.openDocument.mockClear();
    expect(
      f.execute({
        type: "open_document",
        target: "other-profile-document",
        value: null,
      }).status,
    ).toBe("rejected");
    expect(f.openDocument).not.toHaveBeenCalled();
  });
  it("rejects a stale session before any side effect", () => {
    const f = fixture();
    createSession("joao");
    expect(
      f.execute({ type: "record_wellbeing", target: null, value: "Bem" })
        .status,
    ).toBe("rejected");
    expect(f.saveMood).not.toHaveBeenCalled();
  });
  it("saves wellbeing and reads the newly saved value", () => {
    const f = fixture();
    expect(
      f.execute({ type: "record_wellbeing", target: null, value: "Cansado(a)" })
        .status,
    ).toBe("completed");
    expect(f.saveMood).toHaveBeenCalledWith("Cansado(a)");
    expect(
      f.execute({ type: "read", target: "checkin", value: null }).text,
    ).toContain("Cansado(a)");
  });
  it("creates one simulated reschedule request and preserves the original appointment", () => {
    const f = fixture(),
      a = f.state.appointments.find((a) => a.status === "confirmed")!;
    const action: LiaAction = {
      type: "request_reschedule",
      target: a.id,
      value: null,
    };
    expect(f.execute(action).status).toBe("completed");
    expect(f.execute(action).status).toBe("completed");
    expect(f.data.requests(f.state.context)).toHaveLength(1);
    expect(
      f.data.appointments(f.state.context).find((x) => x.id === a.id)?.status,
    ).toBe("confirmed");
  });
  it("rejects invalid appointment IDs and unsupported preference values", () => {
    const f = fixture();
    expect(
      f.execute({ type: "request_reschedule", target: "unknown", value: null })
        .status,
    ).toBe("rejected");
    expect(f.data.requests(f.state.context)).toHaveLength(0);
    expect(
      f.execute({ type: "set_text_scale", target: null, value: "99" }).status,
    ).toBe("rejected");
    expect(f.updatePreferences).not.toHaveBeenCalled();
  });
  it("adjusts one preference while keeping the current other preferences", () => {
    const f = fixture();
    f.execute({ type: "set_speech_rate", target: null, value: "0.8" });
    f.execute({ type: "set_text_scale", target: null, value: "2" });
    expect(f.state.prefs).toEqual({
      textScale: 2,
      speechRate: 0.8,
      explanation: "short",
    });
    expect(
      f.execute({ type: "read", target: "profile", value: null }).text,
    ).toContain("200%");
  });
  it("reports contact requests only after they have been stored locally", () => {
    const f = fixture();
    const result = f.execute({
      type: "request_contact",
      target: null,
      value: null,
    });
    expect(f.data.requests(f.state.context)).toHaveLength(1);
    expect(result.text).toMatch(/simulad|demonstração/);
    expect(result.text).toMatch(/Nenhuma equipe|ninguém|não.*enviad/i);
  });
});

describe("Lia uses the connected server snapshot and acknowledgement", () => {
  function connectedFixture() {
    const data = createPatientDataPort();
    const context = createConnectedSession("pac-maria");
    const state: LiaAppSnapshot = {
      context,
      persona: {
        ...personas[0],
        id: "pac-maria",
        name: "Maria do painel",
        firstName: "Maria",
      },
      page: "home",
      prefs: { textScale: 1, speechRate: 1, explanation: "short" },
      appointments: [],
      documents: [],
      journey: [],
      requests: [],
      savedMood: "",
      connected: { status: "ready" },
      messages: [
        {
          id: "message-1",
          role: "team",
          authorLabel: "Equipe de navegação",
          text: "Resposta publicada pelo profissional.",
          createdAt: "2026-10-31T12:00:00Z",
        },
      ],
    };
    const navigate = vi.fn();
    const remote = {
      saveMood: vi.fn(
        async (_feeling: string, _id: string, _signal?: AbortSignal) => {},
      ),
      submitRequest: vi.fn(
        async (
          _type: "contact" | "reschedule",
          _appointment: string | undefined,
          _id: string,
          _signal?: AbortSignal,
        ) => {},
      ),
      updatePreferences: vi.fn(async () => {}),
      reportSymptoms: vi.fn(async () => ({
        tenantId: "demo",
        hospitalId: "oncoflow",
        patientId: "pac-maria",
        status: "not_applicable" as const,
      })),
    };
    const bridge = createLiaAppBridge({
      data,
      getSnapshot: () => state,
      navigate,
      openAppointment: vi.fn(),
      openDocument: vi.fn(),
      saveMood: vi.fn(),
      updatePreferences: vi.fn(),
      connected: () => remote,
    });
    return { bridge, state, remote, navigate, context };
  }
  it("waits for server acceptance and forwards the operation identity and cancellation signal", async () => {
    const f = connectedFixture();
    let acknowledge!: () => void;
    f.remote.submitRequest.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const controller = new AbortController();
    const result = f.bridge.execute(
      { type: "request_contact", target: null, value: null },
      "stable-operation",
      f.context,
      controller.signal,
    );
    expect(f.navigate).not.toHaveBeenCalled();
    expect(f.remote.submitRequest).toHaveBeenCalledWith(
      "contact",
      undefined,
      "stable-operation",
      controller.signal,
    );
    acknowledge();
    expect(await result).toMatchObject({
      status: "completed",
      text: expect.stringContaining("confirmado pelo hospital"),
    });
    expect(f.navigate).toHaveBeenCalledWith("requests");
  });
  it("exposes automatic reporting only in a connected session and rejects a captured reporter after the patient changes", async () => {
    expect(fixture().bridge.reportSymptoms).toBeUndefined();
    const f = connectedFixture();
    expect(f.bridge.reportSymptoms).toEqual(expect.any(Function));
    const report = f.bridge.reportSymptoms!;
    const input = {
      text: "Estou com dor",
      source: "voice" as const,
      locale: "pt-BR" as const,
      operationId: "utterance-1",
    };
    expect(await report(input)).toMatchObject({ status: "not_applicable" });
    createSession("joao");
    await expect(report(input)).rejects.toThrow();
    expect(f.remote.reportSymptoms).toHaveBeenCalledTimes(1);
  });
  it("reads only confirmed cancer facts and published instructions in the connected profile", async () => {
    const f = connectedFixture();
    f.state.careContext = {
      diagnosisLabel: "Câncer de mama",
      treatmentLabel: "Acompanhamento com equipe",
      sourceLabel: "Cadastro confirmado",
      patientInstructions: [
        "Use o canal da equipe para dúvidas sobre o plano.",
      ],
    };
    const result = await f.bridge.execute(
      { type: "read", target: "profile", value: null },
      "read-profile",
      f.context,
    );
    expect(result.text).toContain("Câncer de mama");
    expect(result.text).toContain("Cadastro confirmado");
    expect(result.text).toContain("Use o canal da equipe");
    expect(result.text).not.toMatch(
      /quimioterapia|imunossupress|estágio|prognóstico/,
    );
    f.state.careContext.patientInstructions = ["x".repeat(4000)];
    const longResult = await f.bridge.execute(
      { type: "read", target: "profile", value: null },
      "read-profile-long",
      f.context,
    );
    expect(longResult.text.length).toBeLessThanOrEqual(2400);
    expect(longResult.text).not.toContain("xxxx");
    expect(longResult.text).toContain("orientações completas");
  });
  it("reads attributed team messages and actual request states", async () => {
    const f = connectedFixture();
    const messages = await f.bridge.execute(
      { type: "read", target: "messages", value: null },
      "read-messages",
      f.context,
    );
    expect(messages.text).toContain(
      "Equipe de navegação: Resposta publicada pelo profissional.",
    );
    f.state.requests = [
      {
        id: "request-1",
        context: f.context,
        type: "contact",
        status: "completed",
        idempotencyKey: "request-1",
        createdAt: "2026-10-31T12:00:00Z",
      },
    ];
    const requests = await f.bridge.execute(
      { type: "read", target: "requests", value: null },
      "read-requests",
      f.context,
    );
    expect(requests.text).toContain("Concluído pela equipe");
    expect(requests.text).not.toContain("Todos são simulados");
    f.state.connected!.status = "offline";
    expect(
      (
        await f.bridge.execute(
          { type: "read", target: "messages", value: null },
          "read-offline",
          f.context,
        )
      ).text,
    ).toContain("desatualizados");
  });
  it("suppresses navigation and success when a connected action ends before acknowledgement", async () => {
    const f = connectedFixture();
    let acknowledge!: () => void;
    f.remote.saveMood.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve;
        }),
    );
    const controller = new AbortController();
    const result = f.bridge.execute(
      { type: "record_wellbeing", target: null, value: "Bem" },
      "voice-operation",
      f.context,
      controller.signal,
    );
    controller.abort();
    acknowledge();
    expect(await result).toMatchObject({ status: "rejected" });
    expect(f.navigate).not.toHaveBeenCalled();
  });
});
