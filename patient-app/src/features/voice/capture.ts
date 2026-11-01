import { translate } from "../../i18n";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { createTurnDetector } from "./turnDetector";

export type CapturedAudio = {
  base64: string;
  mimeType: string;
  durationMs: number;
};
export type CaptureOptions = {
  autoStopOnSilence?: boolean;
  /** Normalized microphone energy; speech stays true once this turn has speech. */
  onLevel?(level: number, speech: boolean): void;
};
export type CaptureError = Error & { code?: string };
type NativeRecorder = {
  start(options: {
    captureId: string;
    autoStopOnSilence: boolean;
  }): Promise<void>;
  stop(options: { captureId: string }): Promise<CapturedAudio>;
  cancel(options: { captureId: string }): Promise<void>;
  addListener(
    name: string,
    callback: (
      value: CapturedAudio & {
        code?: string;
        captureId?: string;
        level?: number;
        speech?: boolean;
      },
    ) => void,
  ): Promise<PluginListenerHandle>;
};
const recorderPlugin = registerPlugin<NativeRecorder>("LiaRecorder");
const LIMIT_MS = 30_000;
const MAX_BYTES = 2_000_000;
type Capture = {
  id: string;
  native: boolean;
  cancelled: boolean;
  stopping: boolean;
  completed: boolean;
  ready: boolean;
  handles: PluginListenerHandle[];
  auto: (audio: CapturedAudio) => void;
  error?: (error: Error) => void;
  onLevel?: CaptureOptions["onLevel"];
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setTimeout>;
  silenceTimer?: ReturnType<typeof setInterval>;
  audioContext?: AudioContext;
  audioSource?: MediaStreamAudioSourceNode;
  visibility?: () => void;
  result?: Promise<CapturedAudio>;
  reject?: (error: Error) => void;
};
let current: Capture | undefined;
let captureNumber = 0;
const cancelledError = () =>
  new Error(
    translate("Gravação cancelada. Toque no microfone para tentar novamente."),
  );
const noSpeechError = (): CaptureError =>
  Object.assign(
    new Error(translate("Não ouvi uma fala. Você pode tentar novamente.")),
    {
      code: "NO_SPEECH",
    },
  );

function reportLevel(state: Capture, level: number, speech: boolean) {
  try {
    state.onLevel?.(Math.max(0, Math.min(1, level)), speech);
  } catch {
    // Visual feedback must never disrupt recording or delivery.
  }
}

function cleanup(state: Capture) {
  if (state.timer) clearTimeout(state.timer);
  if (state.silenceTimer) clearInterval(state.silenceTimer);
  state.audioSource?.disconnect();
  if (state.audioContext) void state.audioContext.close().catch(() => {});
  state.stream?.getTracks().forEach((track) => track.stop());
  if (state.visibility && typeof document !== "undefined")
    document.removeEventListener("visibilitychange", state.visibility);
  state.handles.splice(0).forEach((handle) => {
    void handle.remove().catch(() => {});
  });
  if (current === state) {
    current = undefined;
    reportLevel(state, 0, false);
  }
}

function fail(state: Capture, error: Error) {
  if (state.completed || state.cancelled) return;
  error.message = translate(error.message);
  state.completed = true;
  state.reject?.(error);
  cleanup(state);
  if (state.native)
    void recorderPlugin.cancel({ captureId: state.id }).catch(() => {});
  if (state.recorder && state.recorder.state !== "inactive") {
    try {
      state.recorder.stop();
    } catch {
      /* Tracks have already been released. */
    }
  }
  state.error?.(error);
}

function validAudio(audio: CapturedAudio): boolean {
  return (
    typeof audio?.base64 === "string" &&
    audio.base64.length > 0 &&
    audio.base64.length <= Math.ceil((MAX_BYTES * 4) / 3) + 4 &&
    typeof audio.mimeType === "string" &&
    audio.mimeType.startsWith("audio/") &&
    Number.isFinite(audio.durationMs) &&
    audio.durationMs > 0 &&
    audio.durationMs <= LIMIT_MS
  );
}

async function asBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** Starts only after permission. Automatic completion is delivered separately from manual stop. */
export async function startCapture(
  onAutoStop: (audio: CapturedAudio) => void,
  onError?: (error: Error) => void,
  options: CaptureOptions = {},
): Promise<void> {
  if (current)
    throw new Error(translate("Já existe uma gravação em andamento."));
  const state: Capture = {
    id: `${Date.now()}-${++captureNumber}`,
    native: Capacitor.isNativePlatform(),
    cancelled: false,
    stopping: false,
    completed: false,
    ready: false,
    handles: [],
    auto: onAutoStop,
    error: onError,
    onLevel: options.onLevel,
  };
  current = state;
  try {
    if (state.native) {
      const stopped = await recorderPlugin.addListener(
        "recordingStopped",
        (audio) => {
          if (
            current !== state ||
            state.cancelled ||
            state.stopping ||
            state.completed
          )
            return;
          if (audio.captureId && audio.captureId !== state.id) return;
          if (!validAudio(audio)) {
            fail(
              state,
              new Error(
                translate("O áudio não pôde ser capturado. Tente novamente."),
              ),
            );
            return;
          }
          state.completed = true;
          cleanup(state);
          // Acknowledge automatic delivery so the native race buffer can be discarded.
          void recorderPlugin.cancel({ captureId: state.id }).catch(() => {});
          state.auto(audio);
        },
      );
      state.handles.push(stopped);
      if (state.cancelled) throw cancelledError();
      const failed = await recorderPlugin.addListener(
        "recordingError",
        (event) => {
          if (event.captureId && event.captureId !== state.id) return;
          fail(
            state,
            event.code === "NO_SPEECH"
              ? noSpeechError()
              : event.code === "CAPTURE_CANCELLED"
                ? cancelledError()
                : new Error(
                    translate("A gravação foi interrompida. Tente novamente."),
                  ),
          );
        },
      );
      state.handles.push(failed);
      if (state.cancelled) throw cancelledError();
      const levels = await recorderPlugin.addListener(
        "recordingLevel",
        (event) => {
          if (
            current !== state ||
            state.cancelled ||
            state.completed ||
            event.captureId !== state.id ||
            typeof event.level !== "number" ||
            !Number.isFinite(event.level)
          )
            return;
          reportLevel(state, event.level, event.speech === true);
        },
      );
      state.handles.push(levels);
      if (state.cancelled) throw cancelledError();
      await recorderPlugin.start({
        captureId: state.id,
        autoStopOnSilence: options.autoStopOnSilence === true,
      });
      if (state.cancelled) {
        await recorderPlugin.cancel({ captureId: state.id });
        throw cancelledError();
      }
      if (state.completed)
        throw new Error(translate("A gravação foi interrompida."));
      state.ready = true;
      // Native callbacks normally end capture first. Recover a missed endpoint or
      // timer without leaving the interface listening indefinitely.
      state.timer = setTimeout(() => {
        if (
          current !== state ||
          state.cancelled ||
          state.completed ||
          state.stopping
        )
          return;
        state.timer = setTimeout(() => {
          if (state.cancelled || state.completed) return;
          fail(
            state,
            Object.assign(
              new Error(
                translate(
                  "O microfone não concluiu a gravação. Inicie a conversa novamente.",
                ),
              ),
              { code: "CAPTURE_TIMEOUT" },
            ),
          );
          // A bridge result may still arrive later; it must not become a turn.
          state.cancelled = true;
        }, 3000);
        void stopCapture()
          .then((audio) => {
            if (!state.cancelled) state.auto(audio);
          })
          .catch((error: unknown) => {
            fail(
              state,
              error instanceof Error
                ? error
                : new Error(translate("Não foi possível concluir a gravação.")),
            );
          });
      }, LIMIT_MS + 1500);
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw new Error(
        translate(
          "Este navegador não oferece gravação. Use o APK ou escreva sua mensagem.",
        ),
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.stream = stream;
    if (state.cancelled || current !== state) {
      stream.getTracks().forEach((track) => track.stop());
      state.stream = undefined;
      throw cancelledError();
    }
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType)
      throw new Error(
        translate(
          "O formato de gravação deste navegador não é compatível. Use o APK ou texto.",
        ),
      );
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 64_000,
    });
    state.recorder = recorder;
    const chunks: Blob[] = [];
    let total = 0;
    const startedAt = performance.now();
    const detector = options.autoStopOnSilence ? createTurnDetector() : null;
    state.result = new Promise<CapturedAudio>((resolve, reject) => {
      state.reject = reject;
      recorder.ondataavailable = (event) => {
        if (state.cancelled || state.completed || !event.data.size) return;
        total += event.data.size;
        if (total > MAX_BYTES) {
          fail(
            state,
            new Error(
              translate(
                "O áudio ultrapassou o limite. Grave um trecho mais curto.",
              ),
            ),
          );
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        chunks.push(event.data);
      };
      recorder.onerror = () =>
        fail(
          state,
          new Error(
            translate(
              "Não foi possível gravar. Confira a permissão do microfone.",
            ),
          ),
        );
      recorder.onstop = () => {
        const durationMs = Math.min(
          LIMIT_MS,
          Math.round(performance.now() - startedAt),
        );
        if (state.timer) clearTimeout(state.timer);
        state.stream?.getTracks().forEach((track) => track.stop());
        state.stream = undefined;
        if (state.cancelled || state.completed) {
          chunks.length = 0;
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        chunks.length = 0;
        void asBase64(blob)
          .then((base64) => {
            if (state.cancelled || state.completed) return;
            const audio = { base64, mimeType, durationMs };
            if (!validAudio(audio)) {
              fail(
                state,
                new Error(
                  translate(
                    "Nenhum áudio foi capturado. Tente falar por mais tempo.",
                  ),
                ),
              );
              return;
            }
            state.completed = true;
            cleanup(state);
            resolve(audio);
            if (!state.stopping) state.auto(audio);
          })
          .catch(() =>
            fail(
              state,
              new Error(translate("Não foi possível preparar o áudio.")),
            ),
          );
      };
    });
    // The result can reject before stopCapture is called (e.g. hardware error).
    void state.result.catch(() => {});
    recorder.start(250);
    state.ready = true;
    state.timer = setTimeout(() => {
      if (
        !state.cancelled &&
        !state.completed &&
        recorder.state !== "inactive"
      ) {
        if (detector && !detector.hasSpeech()) fail(state, noSpeechError());
        else recorder.stop();
      }
    }, LIMIT_MS);
    if (detector || options.onLevel) {
      const context = new AudioContext();
      state.audioContext = context;
      const source = context.createMediaStreamSource(stream);
      state.audioSource = source;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      await context.resume();
      if (state.cancelled || state.completed || current !== state)
        throw cancelledError();
      const samples = new Float32Array(analyser.fftSize);
      state.silenceTimer = setInterval(() => {
        if (state.cancelled || state.completed || recorder.state === "inactive")
          return;
        analyser.getFloatTimeDomainData(samples);
        let peak = 0;
        for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        const decision = detector?.sample(
          performance.now() - startedAt,
          peak * 32767,
        );
        reportLevel(state, Math.sqrt(peak), detector?.hasSpeech() ?? false);
        if (decision === "no_speech") fail(state, noSpeechError());
        else if (decision === "finished") recorder.stop();
      }, 100);
    }
    if (typeof document !== "undefined") {
      state.visibility = () => {
        if (document.visibilityState === "hidden" && current === state) {
          void cancelCapture();
          onError?.(cancelledError());
        }
      };
      document.addEventListener("visibilitychange", state.visibility);
    }
  } catch (error) {
    const reason =
      error instanceof Error
        ? Object.assign(error, { message: translate(error.message) })
        : new Error(translate("Não foi possível abrir o microfone."));
    state.cancelled = true;
    state.reject?.(reason);
    cleanup(state);
    if (state.recorder && state.recorder.state !== "inactive") {
      try {
        state.recorder.stop();
      } catch {
        /* The stream has already been released. */
      }
    }
    throw reason;
  }
}

export async function stopCapture(): Promise<CapturedAudio> {
  const state = current;
  if (
    !state ||
    !state.ready ||
    state.cancelled ||
    state.completed ||
    state.stopping
  )
    throw new Error(translate("Não há gravação ativa."));
  state.stopping = true;
  if (!state.native) {
    if (!state.recorder || !state.result)
      throw new Error(translate("A gravação ainda não está pronta."));
    // The timer may already have stopped the recorder while final data is still arriving.
    if (state.recorder.state !== "inactive") state.recorder.stop();
    return state.result;
  }
  try {
    const audio = await recorderPlugin.stop({ captureId: state.id });
    if (state.cancelled) throw cancelledError();
    if (!validAudio(audio))
      throw new Error(
        translate("Nenhum áudio foi capturado. Tente novamente."),
      );
    state.completed = true;
    return audio;
  } catch (error) {
    if (error instanceof Error) error.message = translate(error.message);
    throw error;
  } finally {
    cleanup(state);
  }
}

export async function cancelCapture(): Promise<void> {
  const state = current;
  if (!state) return;
  state.cancelled = true;
  state.reject?.(cancelledError());
  cleanup(state);
  if (state.native) {
    await recorderPlugin.cancel({ captureId: state.id }).catch(() => {});
    return;
  }
  if (
    state.recorder?.state !== undefined &&
    state.recorder.state !== "inactive"
  )
    state.recorder.stop();
}
