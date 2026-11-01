import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConversationController,
  type ConversationDependencies,
} from "../../src/features/voice/conversationController";
import type { CapturedAudio } from "../../src/features/voice/capture";

const audio: CapturedAudio = {
  base64: "YXVkaW8=",
  mimeType: "audio/mp4",
  durationMs: 1800,
};
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<ConversationDependencies> = {}) {
  const captures: {
    audio: (value: CapturedAudio) => void;
    error: (value: Error) => void;
  }[] = [];
  const deps: ConversationDependencies = {
    listen: vi.fn(async (onAudio, onError) => {
      captures.push({ audio: onAudio, error: onError });
    }),
    cancelListen: vi.fn(async () => {}),
    transcribe: vi.fn(async () => "Qual é minha próxima consulta?"),
    respond: vi.fn(async () => ({ text: "Sua consulta fictícia é amanhã." })),
    speak: vi.fn(async () => {}),
    stopSpeaking: vi.fn(),
    onState: vi.fn(),
    onUserText: vi.fn(),
    onAssistantText: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  return { deps, captures, controller: createConversationController(deps) };
}

describe("continuous Lia conversation", () => {
  afterEach(() => vi.useRealTimers());
  it("automatically sends two spoken turns and only listens again after playback ends", async () => {
    const playback = deferred<void>();
    const { deps, captures, controller } = setup({
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    expect(deps.onUserText).toHaveBeenCalledWith(
      "Qual é minha próxima consulta?",
    );
    expect(deps.onAssistantText).toHaveBeenCalledWith(
      "Sua consulta fictícia é amanhã.",
    );
    expect(captures).toHaveLength(1);
    expect(deps.onState).toHaveBeenLastCalledWith("speaking");
    playback.resolve();
    await flush();
    expect(captures).toHaveLength(2);
    captures[1].audio(audio);
    await flush();
    expect(deps.transcribe).toHaveBeenCalledTimes(2);
    expect(deps.respond).toHaveBeenCalledTimes(2);
    expect(captures).toHaveLength(3);
    await controller.stop();
  });

  it("does not duplicate a captured turn when finalization fires twice", async () => {
    const { deps, captures, controller } = setup();
    await controller.start();
    captures[0].audio(audio);
    captures[0].audio(audio);
    await flush();
    expect(deps.respond).toHaveBeenCalledTimes(1);
    expect(captures).toHaveLength(2);
    await controller.stop();
  });

  it("stops during transcription and drops late provider results and microphone callbacks", async () => {
    const pending = deferred<string>();
    const { deps, captures, controller } = setup({
      transcribe: vi.fn(() => pending.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    const signal = vi.mocked(deps.transcribe).mock.calls[0][1];
    await controller.stop();
    expect(signal.aborted).toBe(true);
    pending.resolve("Resposta de uma sessão antiga");
    captures[0].audio(audio);
    await flush();
    expect(deps.respond).not.toHaveBeenCalled();
    expect(deps.onUserText).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
    expect(deps.onState).toHaveBeenLastCalledWith("idle");
  });

  it("interrupts playback, reopens the microphone and ignores the old playback completion", async () => {
    const oldPlayback = deferred<void>();
    const { deps, captures, controller } = setup({
      speak: vi.fn(() => oldPlayback.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    const signal = vi.mocked(deps.speak).mock.calls[0][1];
    await controller.interrupt();
    expect(signal.aborted).toBe(true);
    expect(deps.stopSpeaking).toHaveBeenCalled();
    expect(captures).toHaveLength(2);
    oldPlayback.resolve();
    await flush();
    expect(captures).toHaveLength(2);
    expect(controller.isActive()).toBe(true);
    await controller.stop();
  });

  it("does not announce listening while permission is pending or restart after stop", async () => {
    const permission = deferred<void>();
    const { deps, controller } = setup({
      listen: vi.fn(() => permission.promise),
    });
    const start = controller.start();
    await flush();
    expect(deps.onState).not.toHaveBeenCalledWith("listening");
    await controller.stop();
    permission.resolve();
    await start;
    expect(deps.onState).not.toHaveBeenCalledWith("listening");
    expect(controller.isActive()).toBe(false);
  });

  it("keeps a silent conversation active without sending audio and cancels the retry on stop", async () => {
    vi.useFakeTimers();
    const { deps, captures, controller } = setup();
    const silence = Object.assign(new Error("Sem fala"), { code: "NO_SPEECH" });
    await controller.start();
    for (let n = 0; n < 4; n++) {
      captures[n].error(silence);
      await flush();
      expect(captures).toHaveLength(n + 1);
      await vi.advanceTimersByTimeAsync(200);
      expect(captures).toHaveLength(n + 2);
    }
    expect(controller.isActive()).toBe(true);
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.onError).not.toHaveBeenCalled();
    captures[4].error(silence);
    await flush();
    await controller.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(captures).toHaveLength(5);
  });

  it("treats empty transcription as no speech and never invents or submits a user turn", async () => {
    vi.useFakeTimers();
    const { deps, captures, controller } = setup({
      transcribe: vi.fn(async () => "   "),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    expect(captures).toHaveLength(2);
    expect(deps.respond).not.toHaveBeenCalled();
    expect(deps.onUserText).not.toHaveBeenCalled();
    await controller.stop();
  });

  it("ends on a denied microphone permission and preserves the actionable error", async () => {
    const denied = new Error(
      "Microfone não autorizado. Você pode escrever sua mensagem.",
    );
    const { deps, controller } = setup({
      listen: vi.fn(async () => {
        throw denied;
      }),
    });
    await controller.start();
    expect(controller.isActive()).toBe(false);
    expect(deps.onError).toHaveBeenCalledWith(denied);
    expect(deps.onState).toHaveBeenLastCalledWith("error", denied.message);
  });

  it("serializes a stop and immediate restart behind microphone cancellation", async () => {
    const cleanup = deferred<void>();
    const { deps, captures, controller } = setup();
    await controller.start();
    vi.mocked(deps.cancelListen).mockImplementationOnce(() => cleanup.promise);
    const stopping = controller.stop();
    const restarting = controller.start();
    await flush();
    expect(captures).toHaveLength(1);
    cleanup.resolve();
    await stopping;
    await restarting;
    expect(captures).toHaveLength(2);
    expect(controller.isActive()).toBe(true);
    await controller.stop();
  });

  it("does not reopen the microphone if interruption cleanup fails", async () => {
    const { deps, captures, controller } = setup();
    await controller.start();
    vi.mocked(deps.cancelListen).mockRejectedValueOnce(
      new Error("Não foi possível liberar o microfone."),
    );
    await controller.interrupt();
    expect(captures).toHaveLength(1);
    expect(controller.isActive()).toBe(false);
    expect(deps.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Não foi possível liberar o microfone.",
      }),
    );
  });
  it("muting discards the current microphone turn and ignores late audio", async () => {
    const { deps, captures, controller } = setup();
    await controller.start();
    await controller.setMuted(true);
    expect(controller.isMuted()).toBe(true);
    expect(controller.isActive()).toBe(true);
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    captures[0].audio(audio);
    await flush();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(captures).toHaveLength(1);
    await controller.setMuted(false);
    expect(captures).toHaveLength(2);
    await controller.stop();
  });

  it("muting during permission acquisition does not reopen the old microphone", async () => {
    const permission = deferred<void>();
    const { deps, controller } = setup({
      listen: vi.fn(() => permission.promise),
    });
    const starting = controller.start();
    await flush();
    await controller.setMuted(true);
    permission.resolve();
    await starting;
    expect(deps.onState).not.toHaveBeenCalledWith("listening");
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    await controller.stop();
  });

  it("muting during playback preserves Lia audio and holds the next microphone turn", async () => {
    const playback = deferred<void>();
    const { deps, captures, controller } = setup({
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    const signal = vi.mocked(deps.speak).mock.calls[0][1];
    const stopsBefore = vi.mocked(deps.stopSpeaking).mock.calls.length;
    const cancelsBefore = vi.mocked(deps.cancelListen).mock.calls.length;
    await controller.setMuted(true);
    expect(signal.aborted).toBe(false);
    expect(deps.stopSpeaking).toHaveBeenCalledTimes(stopsBefore);
    expect(deps.cancelListen).toHaveBeenCalledTimes(cancelsBefore);
    playback.resolve();
    await flush();
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    expect(captures).toHaveLength(1);
    await controller.setMuted(false);
    expect(captures).toHaveLength(2);
    await controller.stop();
  });

  it("unmuting while a response is playing waits for its completion", async () => {
    const playback = deferred<void>();
    const { captures, controller } = setup({
      speak: vi.fn(() => playback.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    await controller.setMuted(true);
    await controller.setMuted(false);
    expect(captures).toHaveLength(1);
    playback.resolve();
    await flush();
    expect(captures).toHaveLength(2);
    await controller.stop();
  });

  it("muting during STT allows that accepted turn to complete but does not reopen the mic", async () => {
    const transcript = deferred<string>();
    const { deps, captures, controller } = setup({
      transcribe: vi.fn(() => transcript.promise),
    });
    await controller.start();
    captures[0].audio(audio);
    await flush();
    await controller.setMuted(true);
    transcript.resolve("Pergunta já capturada");
    await flush();
    expect(deps.respond).toHaveBeenCalledWith(
      "Pergunta já capturada",
      expect.any(AbortSignal),
    );
    expect(deps.onState).toHaveBeenLastCalledWith("muted");
    expect(captures).toHaveLength(1);
    await controller.stop();
  });

  it("serializes rapid mute toggles behind cleanup and opens only the final requested microphone", async () => {
    const pending = deferred<void>();
    const { deps, captures, controller } = setup();
    await controller.start();
    vi.mocked(deps.cancelListen).mockImplementationOnce(() => pending.promise);
    const muting = controller.setMuted(true);
    const unmuting = controller.setMuted(false);
    const mutingAgain = controller.setMuted(true);
    const finalUnmute = controller.setMuted(false);
    await flush();
    expect(captures).toHaveLength(1);
    pending.resolve();
    await Promise.all([muting, unmuting, mutingAgain, finalUnmute]);
    expect(captures).toHaveLength(2);
    expect(controller.isMuted()).toBe(false);
    await controller.stop();
  });

  it("stopping while muted prevents any later unmute or silence callback from reopening", async () => {
    vi.useFakeTimers();
    const { captures, controller } = setup();
    await controller.start();
    captures[0].error(
      Object.assign(new Error("Sem fala"), { code: "NO_SPEECH" }),
    );
    await flush();
    await controller.setMuted(true);
    await controller.stop();
    await controller.setMuted(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(captures).toHaveLength(1);
    expect(controller.isActive()).toBe(false);
  });

  it("explicit interruption unmutes and returns the listening turn", async () => {
    const { captures, controller } = setup();
    await controller.start();
    await controller.setMuted(true);
    await controller.interrupt();
    expect(controller.isMuted()).toBe(false);
    expect(captures).toHaveLength(2);
    await controller.stop();
  });
  it("awaits native request cancellation before a stopped conversation can restart", async () => {
    const requests = deferred<void>();
    const { deps, captures, controller } = setup({
      cancelRequests: vi.fn(() => requests.promise),
    });
    await controller.start();
    await controller.setMuted(true);
    expect(deps.cancelRequests).not.toHaveBeenCalled();
    const stopping = controller.stop();
    const starting = controller.start();
    await flush();
    expect(deps.cancelRequests).toHaveBeenCalledTimes(1);
    expect(captures).toHaveLength(1);
    requests.resolve();
    await stopping;
    await starting;
    expect(captures).toHaveLength(2);
    await controller.stop();
  });
});
