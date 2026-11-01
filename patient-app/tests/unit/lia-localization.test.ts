import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../src/i18n";
import {
  createLiaAdapter,
  type NativeLiaProvider,
} from "../../src/adapters/liaProvider";
import {
  buildLiaContext,
  createLiaActionSession,
} from "../../src/features/lia/actions";
import { evaluateScenario } from "../../src/features/safety/demoScenarioEngine";
import type { LiaAppBridge, LiaAppSnapshot } from "../../shared/liaActions";
import { personas } from "../../src/demo/fixtures";

afterEach(() => setLocale("pt-BR"));

function actionSession() {
  const snapshot: LiaAppSnapshot = {
    context: { sessionId: "english-session", epoch: 1, personaId: "marina" },
    persona: personas.find((person) => person.id === "marina")!,
    page: "home",
    prefs: { explanation: "short", speechRate: 1, textScale: 1 },
    appointments: [],
    documents: [],
    journey: [],
    requests: [],
    savedMood: "",
  };
  const execute = vi.fn<LiaAppBridge["execute"]>(() => ({
    status: "completed",
    text: "Recorded.",
  }));
  return {
    session: createLiaActionSession({ getSnapshot: () => snapshot, execute }),
    execute,
    snapshot,
  };
}

function nativeProvider(): NativeLiaProvider {
  return {
    chat: vi.fn(async () => ({
      text: "Original model answer",
      intent: "other",
    })),
    transcribe: vi.fn(async () => ({ text: "My original words" })),
    createTranscriptionSession: vi.fn(async () => ({
      clientSecret: "ek_fixture",
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })),
    synthesize: vi.fn(async () => ({ base64: "SUQz", mimeType: "audio/mpeg" })),
    status: vi.fn(async () => ({ configured: true })),
    cancel: vi.fn(async () => {}),
  };
}
const chat = {
  text: "Open my schedule",
  personaId: "marina",
  explanation: "short" as const,
  history: [],
  context: "fictional",
};

describe("Lia's English administrative conversation", () => {
  it.each(["yes", "confirm", "Yes, confirm!", "yes please", "go ahead"])(
    "requires a local confirmation and preserves the canonical action for %s",
    async (answer) => {
      setLocale("en-US");
      const { session, execute } = actionSession();
      const action = {
        type: "record_wellbeing" as const,
        target: null,
        value: "Cansado(a)",
      };
      const proposed = await session.propose(action);
      expect(proposed.status).toBe("needs_confirmation");
      expect(proposed.text).toContain("May I record “Tired”");
      expect(proposed.text).toContain("Say “yes”");
      expect(execute).not.toHaveBeenCalled();
      expect((await session.handleInput(answer))?.status).toBe("completed");
      expect(execute).toHaveBeenCalledWith(
        action,
        expect.any(String),
        expect.objectContaining({ personaId: "marina" }),
      );
      expect((await session.handleInput(answer))?.status).toBe("rejected");
      expect(execute).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["no", "cancel", "No, cancel", "not now", "don't confirm"])(
    "cancels locally for %s",
    async (answer) => {
      setLocale("en-US");
      const { session, execute } = actionSession();
      await session.propose({
        type: "request_contact",
        target: null,
        value: null,
      });
      expect((await session.handleInput(answer))?.text).toBe(
        "Okay, I canceled that action. Nothing was changed.",
      );
      expect(session.pending()).toBeNull();
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("doesn't infer consent from an ambiguous English reply", async () => {
    setLocale("en-US");
    const { session, execute } = actionSession();
    await session.propose({
      type: "request_contact",
      target: null,
      value: null,
    });
    expect(await session.handleInput("yes, but tell me more first")).toBeNull();
    expect(session.pending()).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("revokes a pending confirmation when the language changes", async () => {
    const { session, execute } = actionSession();
    await session.propose({
      type: "request_contact",
      target: null,
      value: null,
    });
    const pending = session.pending()!;
    setLocale("en-US");
    expect((await session.confirm(pending.id)).text).toBe(
      "That confirmation expired. Please request the action again.",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("includes the selected locale in the bounded provider context", async () => {
    setLocale("en-US");
    expect(JSON.parse(buildLiaContext(actionSession().snapshot))).toMatchObject(
      { locale: "en-US", simulated: true },
    );
  });

  it("uses only an explicit English scenario phrase, preserving unclassified free-form reports", async () => {
    setLocale("en-US");
    expect(
      evaluateScenario("S08", "I'm very short of breath right now"),
    ).toMatchObject({
      matched: true,
      disposition: "urgent_care",
      text: expect.stringContaining("seek urgent care immediately"),
    });
    expect(
      evaluateScenario("S08", "I'm not short of breath right now"),
    ).toMatchObject({ matched: false, disposition: "unclassified" });
  });
});

describe("locale at the native provider boundary", () => {
  it("passes English to chat, manual transcription, realtime transcription and the same voice service", async () => {
    setLocale("en-US");
    const native = nativeProvider();
    const adapter = createLiaAdapter(native);
    expect((await adapter.chatWithLia(chat)).text).toBe(
      "Original model answer",
    );
    expect(
      await adapter.transcribeAudio({
        base64: "fixture",
        mimeType: "audio/webm",
        durationMs: 1000,
      }),
    ).toEqual({ text: "My original words" });
    await adapter.createTranscriptionSession();
    await adapter.synthesizeSpeech("Hello, Marina.", 1);
    expect(native.chat).toHaveBeenCalledWith({ ...chat, locale: "en-US" });
    expect(native.transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en-US" }),
    );
    expect(native.createTranscriptionSession).toHaveBeenCalledWith({
      locale: "en-US",
    });
    expect(native.synthesize).toHaveBeenCalledWith({
      text: "Hello, Marina.",
      speed: 1,
      locale: "en-US",
    });
  });

  it("rejects a late provider response after a language change", async () => {
    let finish!: (result: { text: string; intent: string }) => void;
    const native = nativeProvider();
    native.chat = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const request = createLiaAdapter(native).chatWithLia(chat);
    setLocale("en-US");
    finish({ text: "Old Portuguese answer", intent: "other" });
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("honors an explicit English percentage over a model's single-step interpretation", async () => {
    setLocale("en-US");
    const native = nativeProvider();
    native.chat = async () => ({
      text: "I'll adjust that.",
      intent: "other",
      action: { type: "set_text_scale", target: null, value: "1.25" },
    });
    const result = await createLiaAdapter(native).chatWithLia({
      ...chat,
      text: "Set the text to 150 percent",
    });
    expect(result.action).toEqual({
      type: "set_text_scale",
      target: null,
      value: "1.5",
    });
  });
});
