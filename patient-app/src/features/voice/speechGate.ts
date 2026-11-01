import { translate } from "../../i18n";
import type { RealTimeVADOptions } from "@ricky0123/vad-web";

export type SpeechGateEngine = {
  start(): Promise<void>;
  pause(): Promise<void>;
  destroy(): Promise<void>;
  processFrame(frame: Float32Array): Promise<void>;
};
export type SpeechGateEnvironment = {
  createContext(): AudioContext;
  assetBaseURL(): string;
  createEngine(options: Partial<RealTimeVADOptions>): Promise<SpeechGateEngine>;
};
export type SpeechGateCallbacks = {
  onLevel(level: number): void;
  onSpeechState?(probability: number, speaking: boolean): void;
  onError(error: Error): void;
};
export type SpeechGate = {
  stream: MediaStream;
  setMuted(value: boolean): void;
  close(): void;
};

export const SPEECH_GATE_SETTINGS = {
  positiveSpeechThreshold: 0.75,
  negativeSpeechThreshold: 0.45,
  minSpeechMs: 250,
  redemptionMs: 500,
  preSpeechPadMs: 300,
  delayMs: 850,
  tailMs: 100,
} as const;

const browserEnvironment: SpeechGateEnvironment = {
  createContext: () => new AudioContext({ latencyHint: "interactive" }),
  assetBaseURL: () => new URL("./vad/", document.baseURI).href,
  createEngine: async (options) => {
    const { MicVAD } = await import("@ricky0123/vad-web");
    return MicVAD.new(options);
  },
};
const aborted = () =>
  new DOMException(translate("Conversa encerrada"), "AbortError");

async function releaseEngine(engine: SpeechGateEngine) {
  try {
    await engine.destroy();
  } catch {
    // vad-web 0.0.31 destroy() assumes audio initialization completed. If model
    // loading finished after cancellation, release its already-created model too.
    const uninitialized = engine as SpeechGateEngine & {
      model?: { release(): Promise<void> };
    };
    await uninitialized.model?.release().catch(() => {});
  }
}

/** Owns the filtered output/context only. The caller owns the raw microphone tracks. */
export async function createSpeechGate(
  rawStream: MediaStream,
  callbacks: SpeechGateCallbacks,
  signal: AbortSignal,
  environment: SpeechGateEnvironment = browserEnvironment,
): Promise<SpeechGate> {
  if (signal.aborted) throw aborted();
  let context: AudioContext;
  try {
    context = environment.createContext();
  } catch {
    const error = new Error(
      translate(
        "Não consegui abrir o detector de fala. Atualize o Android System WebView e tente novamente.",
      ),
    );
    callbacks.onError(error);
    throw error;
  }
  const source = context.createMediaStreamSource(rawStream);
  const destination = context.createMediaStreamDestination();
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  let delay: DelayNode | undefined;
  let engine: SpeechGateEngine | undefined;
  let closed = false,
    muted = false,
    accepting = false,
    speaking = false;
  let revision = 0,
    frameRevision: number | undefined;
  let operations = Promise.resolve();
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectStartup: (error: Error) => void = () => {};
  const startupCancelled = new Promise<never>((_, reject) => {
    rejectStartup = reject;
  });
  void startupCancelled.catch(() => {});
  const visual = (level: number, probability = 0) => {
    try {
      callbacks.onLevel(level);
      callbacks.onSpeechState?.(probability, speaking);
    } catch {
      /* A visual observer must not interrupt microphone cleanup. */
    }
  };
  const validCallback = () =>
    !closed &&
    !muted &&
    accepting &&
    (frameRevision === undefined || frameRevision === revision);
  function setGain(value: number) {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(value, context.currentTime);
  }
  function shutGate() {
    clearTimeout(closeTimer);
    closeTimer = undefined;
    speaking = false;
    setGain(0);
    visual(0);
  }
  function discardDelay() {
    if (!delay) return;
    source.disconnect(delay);
    delay.disconnect();
    delay = undefined;
  }
  function freshDelay() {
    discardDelay();
    delay = context.createDelay(1);
    delay.delayTime.value = SPEECH_GATE_SETTINGS.delayMs / 1000;
    source.connect(delay);
    delay.connect(gain);
  }
  function close() {
    if (closed) return;
    closed = true;
    accepting = false;
    ++revision;
    clearTimeout(startupTimer);
    signal.removeEventListener("abort", onAbort);
    shutGate();
    discardDelay();
    source.disconnect();
    gain.disconnect();
    destination.disconnect();
    destination.stream.getTracks().forEach((track) => track.stop());
    rejectStartup(aborted());
    // Close the audio path immediately; release inference after any active frame.
    void context.close().catch(() => {});
    if (engine) {
      const previous = engine;
      engine = undefined;
      void operations.then(() => releaseEngine(previous)).catch(() => {});
    }
  }
  const onAbort = () => close();
  function fail(error: Error) {
    if (closed) return;
    close();
    try {
      callbacks.onError(error);
    } catch {
      /* Already closed. */
    }
  }
  signal.addEventListener("abort", onAbort, { once: true });
  freshDelay();
  const options: Partial<RealTimeVADOptions> = {
    model: "v5",
    audioContext: context,
    baseAssetPath: environment.assetBaseURL(),
    onnxWASMBasePath: environment.assetBaseURL(),
    processorType: "AudioWorklet",
    startOnLoad: false,
    ...SPEECH_GATE_SETTINGS,
    submitUserSpeechOnPause: false,
    getStream: async () => rawStream,
    pauseStream: async () => {},
    resumeStream: async () => rawStream,
    ortConfig: (ort) => {
      ort.env.logLevel = "error";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
    },
    onSpeechStart: () => {}, // One positive frame is not enough to open the gate.
    onSpeechRealStart: () => {
      if (!validCallback()) return;
      clearTimeout(closeTimer);
      closeTimer = undefined;
      speaking = true;
      // The delay also covers uncertain onset frames before neural confirmation.
      setGain(1);
    },
    onFrameProcessed: (probabilities, frame) => {
      if (!validCallback()) return;
      const probability = Math.max(0, Math.min(1, probabilities.isSpeech));
      const rms = Math.sqrt(
        frame.reduce((sum, sample) => sum + sample * sample, 0) /
          Math.max(1, frame.length),
      );
      visual(speaking ? Math.min(1, Math.sqrt(rms * 7)) : 0, probability);
    },
    onSpeechEnd: () => {
      if (!validCallback()) return;
      const ending = revision;
      clearTimeout(closeTimer);
      // The detector reports end before the delayed word ending reaches output.
      closeTimer = setTimeout(
        () => {
          if (validCallback() && ending === revision) shutGate();
        },
        SPEECH_GATE_SETTINGS.delayMs -
          SPEECH_GATE_SETTINGS.redemptionMs +
          SPEECH_GATE_SETTINGS.tailMs,
      );
    },
    onVADMisfire: () => {
      if (validCallback()) shutGate();
    },
  };
  try {
    startupTimer = setTimeout(() => {
      const error = new Error(
        translate(
          "O detector de fala demorou para iniciar. Toque em tentar novamente.",
        ),
      );
      rejectStartup(error);
      fail(error);
    }, 15000);
    await Promise.race([context.resume(), startupCancelled]);
    const loading = environment.createEngine(options).then((loaded) => {
      if (closed) {
        void releaseEngine(loaded);
        throw aborted();
      }
      engine = loaded;
      return loaded;
    });
    const loaded = await Promise.race([loading, startupCancelled]);
    // Serialize recurrent model state and lifecycle. A slow device must not run
    // two frames against the same Silero state, or resume before mute has reset it.
    const process = loaded.processFrame.bind(loaded);
    let queuedFrames = 0;
    loaded.processFrame = (frame) => {
      if (!validCallback()) return Promise.resolve();
      const capturedRevision = revision;
      if (++queuedFrames > 8) {
        --queuedFrames;
        fail(
          new Error(
            translate(
              "O detector de fala não acompanhou o microfone. Toque em tentar novamente.",
            ),
          ),
        );
        return Promise.resolve();
      }
      const operation = operations.then(async () => {
        try {
          if (closed || muted || !accepting || capturedRevision !== revision)
            return;
          frameRevision = capturedRevision;
          await process(frame);
        } finally {
          frameRevision = undefined;
          --queuedFrames;
        }
      });
      operations = operation.catch(() =>
        fail(
          new Error(
            translate("O detector de fala parou. Toque em tentar novamente."),
          ),
        ),
      );
      return operations;
    };
    const starting = loaded.start();
    operations = starting.catch(() => {});
    await Promise.race([starting, startupCancelled]);
    if (closed || signal.aborted) throw aborted();
    accepting = true;
    clearTimeout(startupTimer);
    visual(0);
    return {
      stream: destination.stream,
      setMuted(value) {
        if (closed || muted === value) return;
        muted = value;
        accepting = false;
        const change = ++revision;
        shutGate();
        discardDelay();
        operations = operations
          .then(async () => {
            if (closed) return;
            await loaded.pause();
            if (closed || muted || change !== revision) return;
            freshDelay();
            await loaded.start();
            if (!closed && !muted && change === revision) accepting = true;
          })
          .catch(() =>
            fail(
              new Error(
                translate(
                  "Não consegui reativar o detector de fala. Toque em tentar novamente.",
                ),
              ),
            ),
          );
      },
      close,
    };
  } catch (error) {
    if (closed || signal.aborted)
      throw error instanceof Error ? error : aborted();
    const message = new Error(
      translate(
        "Não consegui iniciar o detector de fala. Toque em tentar novamente.",
      ),
    );
    fail(message);
    throw message;
  }
}
