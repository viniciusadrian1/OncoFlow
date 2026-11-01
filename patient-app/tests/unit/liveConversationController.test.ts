import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveConversationController } from "../../src/features/voice/liveConversationController";
import type {
  LiveInput,
  LiveInputHandlers,
} from "../../src/features/voice/realtimeTranscription";

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
type Dependencies = Parameters<typeof createLiveConversationController>[0];
function setup(overrides: Partial<Dependencies> = {}) {
  const sessions: {
    handlers: LiveInputHandlers;
    signal: AbortSignal;
    input: LiveInput;
  }[] = [];
  const deps: Dependencies = {
    connect: vi.fn(async (handlers, signal) => {
      const input = { setMuted: vi.fn(), finishTurn: vi.fn(), close: vi.fn() };
      sessions.push({ handlers, signal, input });
      return input;
    }),
    respond: vi.fn(async () => ({
      text: "Sua agenda fictícia está disponível.",
    })),
    speak: vi.fn(async () => {}),
    stopSpeaking: vi.fn(),
    cancelRequests: vi.fn(async () => {}),
    onState: vi.fn(),
    onUserText: vi.fn(),
    onAssistantText: vi.fn(),
    onPartial: vi.fn(),
    onLevel: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { deps, sessions, controller: createLiveConversationController(deps) };
}

describe("live duplex conversation", () => {
  afterEach(() => vi.useRealTimers());
  it("muting after captured speech preserves the turn before the remote speech-end event", async () => {
    const answer = deferred<{ text: string }>();
    const playback = deferred<void>();
    const { controller, deps, sessions } = setup({
      respond: vi.fn(() => answer.promise),
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    const { handlers, input } = sessions[0];
    handlers.onSpeechStart();
    handlers.onPartial("Estou com náusea, febre e vômito");
    await flush();
    const stops = vi.mocked(deps.stopSpeaking).mock.calls.length;
    const cancellations = vi.mocked(deps.cancelRequests).mock.calls.length;

    await controller.setMuted(true);
    expect(input.setMuted).toHaveBeenLastCalledWith(true);
    expect(deps.onState).toHaveBeenLastCalledWith("transcribing");
    expect(deps.stopSpeaking).toHaveBeenCalledTimes(stops);
    expect(deps.cancelRequests).toHaveBeenCalledTimes(cancellations);
    handlers.onSpeechEnd();
    handlers.onTranscript("Estou com náusea, febre e vômito");
    await flush();
    expect(deps.onUserText).toHaveBeenCalledExactlyOnceWith(
      "Estou com náusea, febre e vômito",
    );
    const signal = vi.mocked(deps.respond).mock.calls[0][1];
    handlers.onSpeechStart();
    handlers.onTranscript("Nova fala silenciada");
    expect(signal.aborted).toBe(false);
    answer.resolve({ text: "Entre em contato com seu serviço de oncologia." });
    await flush();
    expect(deps.speak).toHaveBeenCalledExactlyOnceWith(
      "Entre em contato com seu serviço de oncologia.",
      signal,
    );
    playback.resolve();
    await flush();
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.connect).toHaveBeenCalledTimes(1);
    await controller.stop();
  });
  it("bounds the pending transcript when mute precedes the remote speech-end event", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    sessions[0].handlers.onSpeechStart();
    await controller.setMuted(true);
    await vi.advanceTimersByTimeAsync(14999);
    expect(deps.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("transcrição") }),
    );
    sessions[0].handlers.onSpeechEnd();
    sessions[0].handlers.onTranscript("Uma conclusão atrasada");
    await flush();
    expect(deps.respond).not.toHaveBeenCalled();
    expect(sessions[0].input.finishTurn).not.toHaveBeenCalled();
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("publishes the muted flag together with the pending-transcription state", async () => {
    const observed: { state: string; muted: boolean }[] = [];
    let controller!: ReturnType<typeof createLiveConversationController>;
    const result = setup({
      onState: (state) => observed.push({ state, muted: controller.isMuted() }),
    });
    controller = result.controller;
    await controller.start();
    result.sessions[0].handlers.onSpeechStart();
    await controller.setMuted(true);
    expect(observed.at(-1)).toEqual({ state: "transcribing", muted: true });
    await controller.stop();
  });
  it("preserves locally captured speech when mute precedes every remote speech event", async () => {
    let handlers!: LiveInputHandlers;
    const input = {
      setMuted: vi.fn(),
      hasPendingSpeech: () => true,
      finishTurn: vi.fn(),
      close: vi.fn(),
    };
    const { controller, deps } = setup({
      connect: vi.fn(async (callbacks) => {
        handlers = callbacks;
        return input;
      }),
    });
    await controller.start();
    await controller.setMuted(true);
    expect(deps.onState).toHaveBeenLastCalledWith("transcribing");
    handlers.onSpeechStart();
    handlers.onSpeechEnd();
    handlers.onTranscript("Minha fala já estava capturada antes do mute");
    await flush();
    expect(deps.respond).toHaveBeenCalledExactlyOnceWith(
      "Minha fala já estava capturada antes do mute",
      expect.any(AbortSignal),
    );
    handlers.onTranscript("Uma nova fala enquanto silenciado");
    await flush();
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    await controller.stop();
  });
  it.each(["thinking", "speaking"] as const)(
    "finishing existing %s does not discard a second pre-mute captured utterance",
    async (stage) => {
      const firstAnswer = deferred<{ text: string }>();
      const firstPlayback = deferred<void>();
      let handlers!: LiveInputHandlers;
      let localSpeechPending = false;
      const input = {
        setMuted: vi.fn(),
        hasPendingSpeech: () => localSpeechPending,
        finishTurn: vi.fn(),
        close: vi.fn(),
      };
      const { controller, deps } = setup({
        connect: vi.fn(async (callbacks) => {
          handlers = callbacks;
          return input;
        }),
        respond: vi
          .fn(async () => ({ text: "Segunda resposta" }))
          .mockImplementationOnce(() => firstAnswer.promise),
        speak: vi.fn(() => firstPlayback.promise),
      });
      await controller.start();
      handlers.onTranscript("Primeira pergunta");
      await flush();
      if (stage === "speaking") {
        firstAnswer.resolve({ text: "Primeira resposta" });
        await flush();
      }
      const signal = vi.mocked(deps.respond).mock.calls[0][1];
      localSpeechPending = true;
      await controller.setMuted(true);
      expect(signal.aborted).toBe(false);
      expect(deps.onState).toHaveBeenLastCalledWith(stage);
      if (stage === "thinking") {
        firstAnswer.resolve({ text: "Primeira resposta" });
        await flush();
      }
      firstPlayback.resolve();
      await flush();
      expect(deps.onState).toHaveBeenLastCalledWith("transcribing");
      localSpeechPending = false;
      handlers.onSpeechStart();
      handlers.onSpeechEnd();
      handlers.onTranscript("Segunda pergunta já capturada");
      await flush();
      expect(deps.respond).toHaveBeenCalledTimes(2);
      expect(deps.onAssistantText).toHaveBeenLastCalledWith("Segunda resposta");
      expect(deps.onState).toHaveBeenLastCalledWith("muted");
      await controller.stop();
    },
  );
  it("a pending input timeout after mute does not abort an existing accepted response", async () => {
    vi.useFakeTimers();
    const answer = deferred<{ text: string }>();
    let handlers!: LiveInputHandlers;
    let localSpeechPending = false;
    const input = {
      setMuted: vi.fn(),
      hasPendingSpeech: () => localSpeechPending,
      finishTurn: vi.fn(),
      close: vi.fn(),
    };
    const { controller, deps } = setup({
      connect: vi.fn(async (callbacks) => {
        handlers = callbacks;
        return input;
      }),
      respond: vi.fn(() => answer.promise),
    });
    await controller.start();
    handlers.onTranscript("Pergunta já aceita");
    await flush();
    const signal = vi.mocked(deps.respond).mock.calls[0][1];
    localSpeechPending = true;
    await controller.setMuted(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect(signal.aborted).toBe(false);
    expect(input.close).toHaveBeenCalledTimes(1);
    expect(deps.onError).not.toHaveBeenCalled();
    answer.resolve({ text: "Resposta da pergunta já aceita" });
    await flush();
    expect(deps.speak).toHaveBeenCalledExactlyOnceWith(
      "Resposta da pergunta já aceita",
      signal,
    );
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("transcrição") }),
    );
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["thinking", "speaking"] as const)(
    "an empty pending transcript keeps existing %s protected from input failure",
    async (stage) => {
      const answer = deferred<{ text: string }>();
      const playback = deferred<void>();
      const { controller, deps, sessions } = setup({
        respond: vi.fn(() => answer.promise),
        speak: vi.fn(() => playback.promise),
      });
      await controller.start();
      const { handlers, input } = sessions[0];
      handlers.onTranscript("Pergunta já aceita");
      await flush();
      const signal = vi.mocked(deps.respond).mock.calls[0][1];
      if (stage === "speaking") {
        answer.resolve({ text: "Resposta já aceita" });
        await flush();
      }
      input.hasPendingSpeech = () => true;
      await controller.setMuted(true);
      const stops = vi.mocked(deps.stopSpeaking).mock.calls.length;
      handlers.onTranscript(" ");
      expect(deps.onState).toHaveBeenLastCalledWith(stage);
      handlers.onError(new Error("Falha somente na entrada"));
      expect(signal.aborted).toBe(false);
      expect(deps.stopSpeaking).toHaveBeenCalledTimes(stops);
      if (stage === "thinking") {
        answer.resolve({ text: "Resposta já aceita" });
        await flush();
      }
      expect(deps.speak).toHaveBeenCalledExactlyOnceWith(
        "Resposta já aceita",
        signal,
      );
      playback.resolve();
      await flush();
      expect(deps.onState).toHaveBeenLastCalledWith("error");
      expect(deps.onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: "Falha somente na entrada" }),
      );
      expect(deps.respond).toHaveBeenCalledTimes(1);
      await controller.stop();
    },
  );
  it("muting while a finished utterance is transcribing keeps its answer running", async () => {
    const answer = deferred<{ text: string }>();
    const playback = deferred<void>();
    const { controller, deps, sessions } = setup({
      respond: vi.fn(() => answer.promise),
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    const { handlers } = sessions[0];
    handlers.onSpeechStart();
    handlers.onSpeechEnd();
    await controller.setMuted(true);
    expect(deps.onState).toHaveBeenLastCalledWith("transcribing");
    handlers.onTranscript("Minha consulta?");
    await flush();
    expect(deps.respond).toHaveBeenCalledTimes(1);
    const signal = vi.mocked(deps.respond).mock.calls[0][1];
    await controller.setMuted(false);
    await controller.setMuted(true);
    expect(signal.aborted).toBe(false);
    answer.resolve({ text: "Consulta cadastrada." });
    await flush();
    expect(deps.onState).toHaveBeenLastCalledWith("speaking");
    expect(deps.speak).toHaveBeenCalledWith("Consulta cadastrada.", signal);
    playback.resolve();
    await flush();
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    expect(deps.connect).toHaveBeenCalledTimes(1);
    await controller.stop();
  });
  it("keeps a bounded transcription deadline while muted instead of hanging forever", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    sessions[0].handlers.onSpeechStart();
    sessions[0].handlers.onSpeechEnd();
    await controller.setMuted(true);
    await vi.advanceTimersByTimeAsync(15000);
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        message: expect.stringContaining("transcrição"),
      }),
    );
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("runs a confirmed UI action through the current call without unmuting or reconnecting", async () => {
    const { controller, deps } = setup();
    await controller.start();
    await controller.setMuted(true);
    const action = vi.fn(async () => ({ text: "Pedido fictício registrado." }));
    controller.submitAction("Sim, confirmar", action);
    await flush();
    expect(action).toHaveBeenCalledTimes(1);
    expect(deps.respond).not.toHaveBeenCalled();
    expect(deps.onUserText).toHaveBeenCalledWith("Sim, confirmar");
    expect(deps.speak).toHaveBeenCalledWith(
      "Pedido fictício registrado.",
      expect.any(AbortSignal),
    );
    expect(controller.isMuted()).toBe(true);
    expect(deps.connect).toHaveBeenCalledTimes(1);
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    await controller.stop();
  });
  it("never executes a button action cancelled before its turn begins", async () => {
    const { controller } = setup();
    await controller.start();
    const action = vi.fn(async () => ({ text: "Não deve executar." }));
    controller.submitAction("Sim, confirmar", action);
    await controller.stop();
    await flush();
    expect(action).not.toHaveBeenCalled();
  });
  it("cancels GPT immediately on new speech and ignores its late result", async () => {
    const old = deferred<{ text: string }>();
    const { controller, deps, sessions } = setup({
      respond: vi.fn(() => old.promise),
    });
    await controller.start();
    const { handlers, input } = sessions[0];
    handlers.onSpeechStart();
    handlers.onSpeechEnd();
    handlers.onTranscript("Primeira pergunta");
    await flush();
    const signal = vi.mocked(deps.respond).mock.calls[0][1];
    handlers.onSpeechStart();
    expect(signal.aborted).toBe(true);
    expect(deps.onState).toHaveBeenLastCalledWith("listening");
    expect(input.close).not.toHaveBeenCalled();
    old.resolve({ text: "Resposta obsoleta" });
    await flush();
    expect(deps.speak).not.toHaveBeenCalled();
    expect(deps.onAssistantText).not.toHaveBeenCalled();
    await controller.stop();
  });
  it("stops Sarah synchronously while preserving the same input connection", async () => {
    const playback = deferred<void>();
    const { controller, deps, sessions } = setup({
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    sessions[0].handlers.onTranscript("Minha agenda?");
    await flush();
    const stops = vi.mocked(deps.stopSpeaking).mock.calls.length;
    const signal = vi.mocked(deps.speak).mock.calls[0][1];
    sessions[0].handlers.onSpeechStart();
    expect(deps.stopSpeaking).toHaveBeenCalledTimes(stops + 1);
    expect(signal.aborted).toBe(true);
    expect(deps.connect).toHaveBeenCalledTimes(1);
    playback.resolve();
    await flush();
    expect(deps.onState).toHaveBeenLastCalledWith("listening");
    await controller.stop();
  });
  it("mute discards capture but allows an accepted answer to finish", async () => {
    const answer = deferred<{ text: string }>();
    const { controller, deps, sessions } = setup({
      respond: vi.fn(() => answer.promise),
    });
    await controller.start();
    sessions[0].handlers.onTranscript("Minha consulta?");
    await flush();
    const signal = vi.mocked(deps.respond).mock.calls[0][1];
    await controller.setMuted(true);
    sessions[0].handlers.onSpeechStart();
    sessions[0].handlers.onTranscript("Ignorar");
    expect(signal.aborted).toBe(false);
    answer.resolve({ text: "Consulta fictícia." });
    await flush();
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.speak).toHaveBeenCalledWith("Consulta fictícia.", signal);
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    await controller.setMuted(false);
    expect(sessions[0].input.setMuted).toHaveBeenLastCalledWith(false);
    expect(deps.onState).toHaveBeenLastCalledWith("listening");
    await controller.stop();
  });
  it("keeps the modal active on failure, closes transport, and permits retry", async () => {
    const { controller, deps, sessions } = setup();
    await controller.start();
    sessions[0].handlers.onError(new Error("Conexão perdida"));
    expect(controller.isActive()).toBe(true);
    expect(controller.isMuted()).toBe(true);
    expect(sessions[0].signal.aborted).toBe(true);
    expect(sessions[0].input.close).toHaveBeenCalledTimes(1);
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    sessions[0].handlers.onTranscript("Evento atrasado");
    await controller.start();
    expect(deps.connect).toHaveBeenCalledTimes(2);
    expect(deps.respond).not.toHaveBeenCalled();
    expect(deps.onState).toHaveBeenLastCalledWith("listening");
    await controller.stop();
  });
  it("closes a connection delivered after stop and suppresses late callbacks", async () => {
    const pending = deferred<LiveInput>();
    let callbacks!: LiveInputHandlers;
    const input = { setMuted: vi.fn(), finishTurn: vi.fn(), close: vi.fn() };
    const { controller, deps } = setup({
      connect: vi.fn((handlers) => {
        callbacks = handlers;
        return pending.promise;
      }),
    });
    const starting = controller.start();
    await flush();
    await controller.stop();
    pending.resolve(input);
    await starting;
    callbacks.onTranscript("Atrasado");
    callbacks.onError(new Error("Atrasado"));
    expect(input.close).toHaveBeenCalledTimes(1);
    expect(deps.respond).not.toHaveBeenCalled();
    expect(deps.onError).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });
  it("times out transcription and does not let late text revive the session", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    sessions[0].handlers.onSpeechStart();
    sessions[0].handlers.onSpeechEnd();
    await vi.advanceTimersByTimeAsync(15001);
    expect(deps.onError).toHaveBeenCalledTimes(1);
    sessions[0].handlers.onTranscript("Muito tarde");
    await flush();
    expect(deps.respond).not.toHaveBeenCalled();
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds GPT and TTS waits and clears their timers on stop", async () => {
    vi.useFakeTimers();
    const pending = deferred<{ text: string }>();
    const { controller, deps, sessions } = setup({
      respond: vi.fn(() => pending.promise),
    });
    await controller.start();
    sessions[0].handlers.onTranscript("Agenda");
    await flush();
    await vi.advanceTimersByTimeAsync(25001);
    expect(deps.onError).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.respond).mock.calls[0][1].aborted).toBe(true);
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
    const voice = setup({ speak: vi.fn(() => new Promise<void>(() => {})) });
    await voice.controller.start();
    voice.sessions[0].handlers.onTranscript("Agenda");
    await flush();
    await vi.advanceTimersByTimeAsync(60001);
    expect(voice.deps.onError).toHaveBeenCalledTimes(1);
    await voice.controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("connection setup times out even if a transport promise ignores abort", async () => {
    vi.useFakeTimers();
    const pending = deferred<LiveInput>();
    const { controller, deps } = setup({
      connect: vi.fn(() => pending.promise),
    });
    const starting = controller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(30001);
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    await starting;
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not greet over speech already received during connection setup", async () => {
    const input = { setMuted: vi.fn(), finishTurn: vi.fn(), close: vi.fn() };
    const { controller, deps } = setup({
      greeting: "Olá!",
      connect: vi.fn(async (handlers) => {
        handlers.onSpeechStart();
        return input;
      }),
    });
    await controller.start();
    await flush();
    expect(deps.speak).not.toHaveBeenCalled();
    await controller.stop();
  });
  it("does not overwrite a transport failure caused by a mute command", async () => {
    const { controller, deps, sessions } = setup();
    await controller.start();
    vi.mocked(sessions[0].input.setMuted).mockImplementation(() =>
      sessions[0].handlers.onError(new Error("Canal fechado")),
    );
    await controller.setMuted(true);
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    expect(deps.onError).toHaveBeenCalledTimes(1);
    await controller.stop();
  });
  it.each(["thinking", "speaking"] as const)(
    "a microphone failure while muting during %s preserves the accepted answer before offering retry",
    async (stage) => {
      const answer = deferred<{ text: string }>();
      const playback = deferred<void>();
      const { controller, deps, sessions } = setup({
        respond: vi.fn(() => answer.promise),
        speak: vi.fn(() => playback.promise),
      });
      await controller.start();
      const { handlers, input } = sessions[0];
      handlers.onTranscript("Minha consulta?");
      await flush();
      const signal = vi.mocked(deps.respond).mock.calls[0][1];
      if (stage === "speaking") {
        answer.resolve({ text: "Sua consulta está cadastrada." });
        await flush();
      }
      const stops = vi.mocked(deps.stopSpeaking).mock.calls.length;
      const cancellations = vi.mocked(deps.cancelRequests).mock.calls.length;
      vi.mocked(input.setMuted).mockImplementationOnce(() => {
        handlers.onError(new Error("Canal do microfone fechado"));
      });

      await controller.setMuted(true);
      expect(signal.aborted).toBe(false);
      expect(deps.stopSpeaking).toHaveBeenCalledTimes(stops);
      expect(deps.cancelRequests).toHaveBeenCalledTimes(cancellations);
      expect(input.close).toHaveBeenCalledTimes(1);
      expect(deps.onState).toHaveBeenLastCalledWith(stage);
      expect(deps.onError).not.toHaveBeenCalled();
      // Closing an unhealthy input must reject its late callbacks without
      // invalidating the separate accepted response's generation.
      handlers.onTranscript("Evento atrasado");
      handlers.onSpeechStart();
      handlers.onError(new Error("Erro atrasado"));
      if (stage === "thinking") {
        answer.resolve({ text: "Sua consulta está cadastrada." });
        await flush();
      }
      expect(deps.speak).toHaveBeenCalledExactlyOnceWith(
        "Sua consulta está cadastrada.",
        signal,
      );
      playback.resolve();
      await flush();
      expect(deps.onState).toHaveBeenLastCalledWith("error");
      expect(deps.onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: "Canal do microfone fechado" }),
      );
      expect(signal.aborted).toBe(false);
      await controller.start();
      expect(deps.connect).toHaveBeenCalledTimes(2);
      expect(deps.onState).toHaveBeenLastCalledWith("listening");
      expect(deps.respond).toHaveBeenCalledTimes(1);
      await controller.stop();
    },
  );
  it("a stalled cancellation cannot block every following answer", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup({
      cancelRequests: vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>(() => {}))
        .mockResolvedValue(undefined),
    });
    await controller.start();
    sessions[0].handlers.onTranscript("Consulta fictícia?");
    await flush();
    expect(deps.respond).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3001);
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(deps.onState).toHaveBeenLastCalledWith("listening");
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("commits one overlong speech turn after 25 seconds and then bounds transcription", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    const { handlers, input } = sessions[0];
    handlers.onSpeechStart();
    await vi.advanceTimersByTimeAsync(24999);
    expect(input.finishTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(input.finishTurn).toHaveBeenCalledTimes(1);
    expect(deps.onState).toHaveBeenLastCalledWith("transcribing");
    await vi.advanceTimersByTimeAsync(14999);
    expect(deps.onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.onState).toHaveBeenLastCalledWith("error");
    expect(deps.onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(input.finishTurn).toHaveBeenCalledTimes(1);
    await controller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("speech end and even an empty transcript remove the speech watchdog", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    const { handlers, input } = sessions[0];
    handlers.onSpeechStart();
    await vi.advanceTimersByTimeAsync(5000);
    handlers.onSpeechEnd();
    handlers.onTranscript("Agenda");
    await flush();
    await vi.advanceTimersByTimeAsync(26000);
    expect(input.finishTurn).not.toHaveBeenCalled();
    handlers.onSpeechStart();
    handlers.onTranscript(" ");
    await vi.advanceTimersByTimeAsync(26000);
    expect(input.finishTurn).not.toHaveBeenCalled();
    expect(deps.onError).not.toHaveBeenCalled();
    await controller.stop();
  });
  it.each(["stop", "error"] as const)(
    "%s clears an active speech watchdog",
    async (action) => {
      vi.useFakeTimers();
      const { controller, deps, sessions } = setup();
      await controller.start();
      sessions[0].handlers.onSpeechStart();
      await vi.advanceTimersByTimeAsync(24000);
      if (action === "stop") await controller.stop();
      if (action === "error")
        sessions[0].handlers.onError(new Error("Conexão caiu"));
      await vi.advanceTimersByTimeAsync(60000);
      expect(sessions[0].input.finishTurn).not.toHaveBeenCalled();
      expect(deps.onError).toHaveBeenCalledTimes(action === "error" ? 1 : 0);
      await controller.stop();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("new speech invalidates the previous watchdog and gets its own single deadline", async () => {
    vi.useFakeTimers();
    const { controller, deps, sessions } = setup();
    await controller.start();
    const { handlers, input } = sessions[0];
    handlers.onSpeechStart();
    await vi.advanceTimersByTimeAsync(24000);
    handlers.onSpeechStart();
    await vi.advanceTimersByTimeAsync(1000);
    expect(input.finishTurn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(24000);
    expect(input.finishTurn).toHaveBeenCalledTimes(1);
    handlers.onTranscript("Agora terminei");
    await flush();
    await vi.advanceTimersByTimeAsync(26000);
    expect(input.finishTurn).toHaveBeenCalledTimes(1);
    expect(deps.onError).not.toHaveBeenCalled();
    await controller.stop();
  });
});
