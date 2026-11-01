import { describe, expect, it, vi } from "vitest";
import {
  createLiaAdapter,
  type NativeLiaProvider,
} from "../../src/adapters/liaProvider";

function provider(
  overrides: Partial<NativeLiaProvider> = {},
): NativeLiaProvider {
  return {
    chat: vi.fn(async () => ({
      text: "Sua agenda é fictícia.",
      intent: "agenda",
    })),
    transcribe: vi.fn(async () => ({ text: "Olá, Lia" })),
    createTranscriptionSession: vi.fn(async () => ({
      clientSecret: "ek_test_fixture_only",
      expiresAt: Math.floor(Date.now() / 1000) + 60,
    })),
    synthesize: vi.fn(async () => ({ base64: "SUQz", mimeType: "audio/mpeg" })),
    status: vi.fn(async () => ({ configured: true })),
    cancel: vi.fn(async () => {}),
    ...overrides,
  };
}
const input = {
  text: "Minha consulta?",
  personaId: "marina",
  explanation: "short" as const,
  history: [],
  context: "Agenda fictícia",
};

describe("native Lia provider boundary", () => {
  it.each([
    "Leah, open my schedule, please.",
    "Show my schedule",
    "Lia, abra minha agenda, por favor.",
  ])(
    "opens the requested screen when the provider proposes reading the same screen: %s",
    async (text) => {
      const native = provider({
        chat: async () => ({
          text: "Your schedule.",
          intent: "agenda",
          action: { type: "read", target: "agenda", value: null },
        }),
      });
      expect(
        (await createLiaAdapter(native).chatWithLia({ ...input, text })).action,
      ).toEqual({ type: "navigate", target: "agenda", value: null });
    },
  );
  it.each([
    "Don't open my schedule",
    "How do I open my schedule?",
    "Read my schedule, please",
    "Open my schedule and call the team",
  ])("does not infer an imperative screen opening from: %s", async (text) => {
    const action = { type: "read", target: "agenda", value: null };
    const native = provider({
      chat: async () => ({ text: "Your schedule.", intent: "agenda", action }),
    });
    expect(
      (await createLiaAdapter(native).chatWithLia({ ...input, text })).action,
    ).toEqual(action);
  });
  it.each(["Aumente as letras para 150%", "Quero as letras em 150 por cento"])(
    "honors an explicit supported text size when the model proposes only one step: %s",
    async (text) => {
      const native = provider({
        chat: async () => ({
          text: "Vou ajustar.",
          intent: "other",
          action: { type: "set_text_scale", target: null, value: "1.25" },
        }),
      });
      expect(
        (await createLiaAdapter(native).chatWithLia({ ...input, text })).action,
      ).toEqual({ type: "set_text_scale", target: null, value: "1.5" });
    },
  );
  it("returns a structured response from the native provider", async () => {
    const native = provider();
    expect(await createLiaAdapter(native).chatWithLia(input)).toEqual({
      text: "Sua agenda é fictícia.",
      intent: "agenda",
    });
    expect(native.chat).toHaveBeenCalledWith({ ...input, locale: "pt-BR" });
  });
  it("rejects already cancelled work before calling a provider", async () => {
    const native = provider();
    const abort = new AbortController();
    abort.abort();
    await expect(
      createLiaAdapter(native).chatWithLia(input, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(native.chat).not.toHaveBeenCalled();
  });
  it("cancels native work and never delivers a late response", async () => {
    let finish!: (value: { text: string; intent: string }) => void;
    const native = provider({
      chat: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const abort = new AbortController();
    const request = createLiaAdapter(native).chatWithLia(input, abort.signal);
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    finish({ text: "Resposta antiga", intent: "other" });
    await rejected;
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed provider responses instead of presenting them", async () => {
    const native = provider({
      chat: async () => ({ text: "", intent: "diagnosis" }),
    });
    await expect(createLiaAdapter(native).chatWithLia(input)).rejects.toThrow(
      "resposta válida",
    );
  });
  it("preserves an explicit action proposal without treating it as completed", async () => {
    const action = { type: "navigate", target: "agenda", value: null };
    const result = await createLiaAdapter(
      provider({
        chat: async () => ({
          text: "Vou abrir sua agenda.",
          intent: "agenda",
          action,
        }),
      }),
    ).chatWithLia(input);
    expect(result).toEqual({
      text: "Vou abrir sua agenda.",
      intent: "agenda",
      action,
    });
  });
  it("preserves a null action for a conversational answer", async () => {
    const result = await createLiaAdapter(
      provider({
        chat: async () => ({
          text: "Podemos ir por partes.",
          intent: "other",
          action: null,
        }),
      }),
    ).chatWithLia(input);
    expect(result).toEqual({
      text: "Podemos ir por partes.",
      intent: "other",
      action: null,
    });
  });
  it("rejects unknown, malformed or over-specified native action proposals", async () => {
    for (const action of [
      { type: "delete_records", target: null, value: null },
      { type: "navigate", target: "https://example.com", value: null },
      { type: "navigate", target: "agenda", value: null, confirmed: true },
      { type: "set_text_scale", target: null, value: "4" },
      { type: "record_wellbeing", target: "Com dor", value: null },
      { type: "open_document", target: "", value: null },
      "navigate:agenda",
      [{ type: "navigate", target: "agenda", value: null }],
    ]) {
      await expect(
        createLiaAdapter(
          provider({
            chat: async () => ({
              text: "Vou ajudar.",
              intent: "other",
              action,
            }),
          }),
        ).chatWithLia(input),
      ).rejects.toThrow("resposta válida");
    }
  });
  it("never exposes an action alongside safety or clarification", async () => {
    for (const intent of ["safety", "clarify"]) {
      const result = await createLiaAdapter(
        provider({
          chat: async () => ({
            text: "Vamos esclarecer antes de continuar.",
            intent,
            action: { type: "request_contact", target: null, value: null },
          }),
        }),
      ).chatWithLia(input);
      expect(result.action).toBeNull();
      expect(result.intent).toBe(intent);
    }
  });
  it("does not deliver a late action after the turn is cancelled", async () => {
    let finish!: (value: {
      text: string;
      intent: string;
      action: unknown;
    }) => void;
    const native = provider({
      chat: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const abort = new AbortController();
    const response = createLiaAdapter(native).chatWithLia(input, abort.signal);
    const rejected = expect(response).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    finish({
      text: "Vou pedir contato.",
      intent: "contact",
      action: { type: "request_contact", target: null, value: null },
    });
    await rejected;
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });
  it("decodes synthesized audio without saving it", async () => {
    const blob = await createLiaAdapter(provider()).synthesizeSpeech(
      "Olá, Lia",
      1,
    );
    expect(blob.type).toBe("audio/mpeg");
    expect(blob.size).toBe(3);
  });
  it("returns only a short-lived connection credential", async () => {
    const native = provider();
    const result = await createLiaAdapter(native).createTranscriptionSession();
    expect(result.clientSecret).toBe("ek_test_fixture_only");
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(native.createTranscriptionSession).toHaveBeenCalledWith({
      locale: "pt-BR",
    });
  });
  it("rejects permanent, expired or malformed connection credentials", async () => {
    for (const session of [
      { clientSecret: "not_an_ephemeral_credential", expiresAt: 4_000_000_000 },
      { clientSecret: "ek_test_fixture_only", expiresAt: 1 },
      { clientSecret: "ek_test_fixture_only", expiresAt: Number.NaN },
      { clientSecret: "ek_", expiresAt: 4_000_000_000 },
      { clientSecret: "ek_invalid whitespace", expiresAt: 4_000_000_000 },
    ]) {
      const native = provider({
        createTranscriptionSession: async () => session,
      });
      await expect(
        createLiaAdapter(native).createTranscriptionSession(),
      ).rejects.toThrow("conexão de voz");
    }
  });
  it("never creates a transcription session after pre-cancellation", async () => {
    const native = provider();
    const abort = new AbortController();
    abort.abort();
    await expect(
      createLiaAdapter(native).createTranscriptionSession(abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(native.createTranscriptionSession).not.toHaveBeenCalled();
  });
  it("discards a late transcription credential after cancellation", async () => {
    let finish!: (value: { clientSecret: string; expiresAt: number }) => void;
    const native = provider({
      createTranscriptionSession: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const abort = new AbortController();
    const request = createLiaAdapter(native).createTranscriptionSession(
      abort.signal,
    );
    const rejected = expect(request).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    finish({ clientSecret: "ek_test_fixture_only", expiresAt: 4_000_000_000 });
    await rejected;
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });
});
