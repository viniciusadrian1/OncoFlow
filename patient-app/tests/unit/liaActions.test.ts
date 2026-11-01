import { describe, expect, it, vi } from "vitest";
import {
  parseLiaAction,
  type LiaAction,
  type LiaAppBridge,
  type LiaAppSnapshot,
} from "../../shared/liaActions";
import {
  buildLiaContext,
  createLiaActionSession,
} from "../../src/features/lia/actions";
import {
  appointments,
  documents,
  journey,
  personas,
} from "../../src/demo/fixtures";

const action = (
  type: LiaAction["type"],
  target: string | null = null,
  value: string | null = null,
): LiaAction => ({ type, target, value });
function fixture() {
  let current: LiaAppSnapshot = {
    context: { sessionId: "session-a", epoch: 1, personaId: "marina" },
    persona: personas.find((p) => p.id === "marina")!,
    page: "home",
    prefs: { explanation: "short", speechRate: 1, textScale: 1 },
    appointments: appointments.filter((a) => a.personaId === "marina"),
    documents: documents.filter((d) => d.personaId === "marina"),
    journey: journey.filter((j) => j.personaId === "marina"),
    requests: [],
    savedMood: "",
  };
  let time = 1000;
  const execute = vi.fn<LiaAppBridge["execute"]>(() => ({
    status: "completed",
    text: "Alteração concluída pelo aplicativo.",
  }));
  const bridge = { getSnapshot: () => current, execute };
  const session = createLiaActionSession(bridge, { now: () => time });
  return {
    session,
    execute,
    snapshot: () => current,
    replace: (next: LiaAppSnapshot) => {
      current = next;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("structured Lia actions", () => {
  it("accepts empty action and supported combinations without inventing fields", async () => {
    expect(parseLiaAction(null)).toBeNull();
    expect(parseLiaAction(undefined)).toBeNull();
    for (const candidate of [
      action("navigate", "home"),
      action("read", "help"),
      action("read", "requests"),
      action("open_document", "doc-a"),
      action("record_wellbeing", null, "Náusea"),
      action("request_contact"),
      action("set_text_scale", null, "2"),
      action("set_speech_rate", null, "0.8"),
      action("set_explanation", null, "step_by_step"),
    ]) {
      expect(parseLiaAction(candidate)).toEqual(candidate);
    }
  });
  it("rejects extra fields, unknown actions, mismatched parameters and invalid values", async () => {
    const invalid = [
      { ...action("navigate", "agenda"), script: "anything" },
      { type: "navigate", target: "agenda" },
      { type: "delete_all", target: null, value: null },
      [],
      "navigate",
      action("navigate", "https://example.org"),
      action("read", "lia"),
      action("navigate", "agenda", "extra"),
      action("request_contact", "team"),
      action("record_wellbeing", "Bem"),
      action("record_wellbeing", null, "Dor forte"),
      action("set_text_scale", null, "3"),
      action("set_speech_rate", null, "2"),
      action("set_explanation", null, "medical"),
      action("open_document", " "),
      action("open_document", "a".repeat(129)),
      action("open_document", "doc\nother"),
    ];
    for (const candidate of invalid)
      expect(() => parseLiaAction(candidate)).toThrow();
  });
});

describe("local Lia action session", () => {
  it("can request rescheduling for a server appointment that is scheduled but not confirmed", async () => {
    const f = fixture();
    const appointment = { ...f.snapshot().appointments[0]!, status: "scheduled" as const };
    f.replace({ ...f.snapshot(), appointments: [appointment], connected: {status:"ready"} });
    expect((await f.session.propose(action("request_reschedule",appointment.id))).status).toBe("needs_confirmation");
  });
  it("waits for the server and consumes confirmation before a duplicate can dispatch", async () => {
    const f = fixture();
    let finish!: (result: { status: "completed"; text: string }) => void;
    f.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await f.session.propose(action("request_contact"));
    const pending = f.session.pending()!;
    const result = f.session.confirm(pending.id);
    let completed = false;
    void result.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect((await f.session.confirm(pending.id)).status).toBe("rejected");
    expect(f.execute).toHaveBeenCalledTimes(1);
    finish({ status: "completed", text: "Servidor confirmou o registro." });
    expect((await result).text).toBe("Servidor confirmou o registro.");
  });
  it("handles asynchronous rejection without announcing success or automatically repeating", async () => {
    const f = fixture();
    f.execute.mockRejectedValue(new Error("network unavailable"));
    await f.session.propose(action("request_contact"));
    const id = f.session.pending()!.id;
    expect((await f.session.confirm(id)).status).toBe("rejected");
    expect((await f.session.confirm(id)).status).toBe("rejected");
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("ignores an acknowledgment after the action session was cleared", async () => {
    const f = fixture();
    let finish!: (result: {
      status: "completed";
      text: string;
      showApp: boolean;
    }) => void;
    f.execute.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = f.session.propose(action("navigate", "agenda"));
    f.session.clear();
    finish({ status: "completed", text: "Old result", showApp: true });
    const response = await result;
    expect(response.status).toBe("rejected");
    expect(response.showApp).not.toBe(true);
  });
  it("understands the exact confirmation phrases shown by the voice interface", async () => {
    const f = fixture();
    await f.session.propose(action("request_contact"));
    expect((await f.session.handleInput("Sim, confirmar"))?.status).toBe(
      "completed",
    );
    await f.session.propose(action("record_wellbeing", null, "Bem"));
    expect((await f.session.handleInput("Não, cancelar"))?.status).toBe(
      "cancelled",
    );
    expect(f.session.pending()).toBeNull();
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("executes navigation, reading and preferences directly using the real result", async () => {
    const f = fixture();
    for (const candidate of [
      action("navigate", "agenda"),
      action("read", "help"),
      action("set_text_scale", null, "2"),
    ]) {
      expect(await f.session.propose(candidate)).toEqual({
        status: "completed",
        text: "Alteração concluída pelo aplicativo.",
      });
    }
    expect(f.execute).toHaveBeenCalledTimes(3);
    expect(f.execute.mock.calls[0]?.[0]).toEqual(action("navigate", "agenda"));
    expect(f.session.pending()).toBeNull();
  });
  it("requires confirmation for wellbeing and simulated requests", async () => {
    const f = fixture();
    for (const candidate of [
      action("record_wellbeing", null, "Bem"),
      action("request_contact"),
      action("request_reschedule", f.snapshot().appointments[0]!.id),
    ]) {
      expect((await f.session.propose(candidate)).status).toBe(
        "needs_confirmation",
      );
      expect(f.session.pending()?.action).toEqual(candidate);
    }
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects unknown, foreign and cancelled rescheduling IDs", async () => {
    const f = fixture();
    for (const candidate of [
      action("open_appointment", "joao-consulta-1"),
      action("open_document", "missing"),
      action("request_reschedule", "joao-consulta-1"),
    ]) {
      expect((await f.session.propose(candidate)).status).toBe("rejected");
    }
    f.replace({
      ...f.snapshot(),
      appointments: f
        .snapshot()
        .appointments.map((a) => ({ ...a, status: "cancelled" })),
    });
    expect(
      (
        await f.session.propose(
          action("request_reschedule", f.snapshot().appointments[0]!.id),
        )
      ).status,
    ).toBe("rejected");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("consumes one confirmation once even when the user repeats yes", async () => {
    const f = fixture();
    await f.session.propose(action("request_contact"));
    const pending = f.session.pending()!;
    expect((await f.session.handleInput("Sim, pode confirmar."))?.status).toBe(
      "completed",
    );
    expect((await f.session.confirm(pending.id)).status).toBe("rejected");
    expect((await f.session.handleInput("sim"))?.status).toBe("rejected");
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]?.[1]).toBe(pending.id);
  });
  it("cancels explicit negatives and never accepts ambiguous compound answers", async () => {
    const f = fixture();
    for (const text of ["Não", "não quero", "pode cancelar", "agora não"]) {
      await f.session.propose(action("request_contact"));
      expect((await f.session.handleInput(text))?.status).toBe("cancelled");
      expect(f.session.pending()).toBeNull();
    }
    for (const text of [
      "sim mas não",
      "sim, mas quero outra consulta",
      "talvez",
      "sim, se estiver tudo bem",
    ]) {
      await f.session.propose(action("request_contact"));
      expect(await f.session.handleInput(text)).toBeNull();
      expect(f.session.pending()).toBeNull();
    }
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("clears an old confirmation when a different topic or newer proposal arrives", async () => {
    const f = fixture();
    await f.session.propose(action("request_contact"));
    expect(await f.session.handleInput("Quando é minha consulta?")).toBeNull();
    expect(f.session.pending()).toBeNull();
    await f.session.propose(action("request_contact"));
    const old = f.session.pending()!;
    await f.session.propose(action("record_wellbeing", null, "Bem"));
    const replacement = f.session.pending()!;
    expect((await f.session.confirm(old.id)).status).toBe("rejected");
    expect(f.session.pending()?.id).toBe(replacement.id);
    expect((await f.session.confirm(replacement.id)).status).toBe("completed");
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("rejects confirmations from an expired or changed session", async () => {
    const f = fixture();
    await f.session.propose(action("request_contact"));
    const expired = f.session.pending()!;
    f.advance(120_000);
    expect((await f.session.confirm(expired.id)).status).toBe("rejected");
    await f.session.propose(action("request_contact"));
    const stale = f.session.pending()!;
    f.replace({
      ...f.snapshot(),
      context: { ...f.snapshot().context, epoch: 2 },
    });
    expect((await f.session.confirm(stale.id)).status).toBe("rejected");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rechecks the resource before confirming rather than trusting the prior snapshot", async () => {
    const f = fixture();
    await f.session.propose(
      action("request_reschedule", f.snapshot().appointments[0]!.id),
    );
    const pending = f.session.pending()!;
    f.replace({ ...f.snapshot(), appointments: [] });
    expect((await f.session.confirm(pending.id)).status).toBe("rejected");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not execute after cancellation, clear or aborted input", async () => {
    const f = fixture();
    const abort = new AbortController();
    abort.abort();
    expect(
      (await f.session.propose(action("navigate", "agenda"), abort.signal))
        .status,
    ).toBe("rejected");
    await f.session.propose(action("request_contact"));
    const pending = f.session.pending()!;
    expect((await f.session.confirm(pending.id, abort.signal)).status).toBe(
      "rejected",
    );
    expect(f.session.pending()).toBeNull();
    await f.session.propose(action("request_contact"));
    const cleared = f.session.pending()!;
    f.session.clear();
    expect((await f.session.confirm(cleared.id)).status).toBe("rejected");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("consumes a failed execution and does not silently retry it", async () => {
    const f = fixture();
    f.execute.mockImplementation(() => {
      throw new Error("bridge failed");
    });
    await f.session.propose(action("request_contact"));
    const pending = f.session.pending()!;
    expect((await f.session.confirm(pending.id)).status).toBe("rejected");
    expect((await f.session.confirm(pending.id)).status).toBe("rejected");
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
  it("does not leak mutable pending state to callers", async () => {
    const f = fixture();
    await f.session.propose(action("request_contact"));
    const pending = f.session.pending()!;
    pending.action.type = "navigate";
    pending.context.epoch = 99;
    expect((await f.session.confirm(pending.id)).status).toBe("completed");
    expect(f.execute.mock.calls[0]?.[0]).toEqual(action("request_contact"));
  });
});

describe("current app context for Lia", () => {
  it("contains the actual current page, preferences, resource IDs and complete fixture document text", async () => {
    const f = fixture();
    const first = JSON.parse(buildLiaContext(f.snapshot()));
    expect(first.documents[0].id).toBe(f.snapshot().documents[0]!.id);
    expect(first.documents[0].body).toEqual(f.snapshot().documents[0]!.body);
    f.replace({
      ...f.snapshot(),
      page: "profile",
      savedMood: "Bem",
      prefs: { ...f.snapshot().prefs, speechRate: 0.8 },
    });
    const fresh = JSON.parse(buildLiaContext(f.snapshot()));
    expect(fresh.page).toBe("profile");
    expect(fresh.savedMood).toBe("Bem");
    expect(fresh.prefs.speechRate).toBe(0.8);
  });
  it("bounds large context as valid JSON, identifies omissions and excludes foreign resources", async () => {
    const f = fixture();
    const huge = {
      ...f.snapshot(),
      documents: [
        ...f
          .snapshot()
          .documents.map((d) => ({ ...d, body: ["x".repeat(50_000)] })),
        documents.find((d) => d.personaId !== "marina")!,
      ],
    };
    const serialized = buildLiaContext(huge);
    expect(serialized.length).toBeLessThanOrEqual(20_000);
    const context = JSON.parse(serialized);
    expect(context.truncated).toBe(true);
    expect(
      context.documents.every((d: { id: string }) =>
        f.snapshot().documents.some((own) => own.id === d.id),
      ),
    ).toBe(true);
  });
});
