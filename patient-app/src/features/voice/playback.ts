import { translate } from "../../i18n";
/** Audio-derived visual envelope; playback still uses HTMLAudioElement directly. */
export type VoiceEnvelope = {
  levels: Float32Array;
  frameSeconds: number;
  durationSeconds: number;
};

export function buildVoiceEnvelope(
  channels: readonly Float32Array[],
  sampleRate: number,
  frameMs = 32,
): VoiceEnvelope {
  const length = channels.reduce(
    (max, channel) => Math.max(max, channel.length),
    0,
  );
  if (
    !length ||
    !channels.length ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0
  )
    return {
      levels: new Float32Array(),
      frameSeconds: 0.032,
      durationSeconds: 0,
    };
  const frameSamples = Math.max(
    1,
    Math.round((sampleRate * Math.max(16, Math.min(100, frameMs))) / 1000),
  );
  const levels = new Float32Array(Math.ceil(length / frameSamples));
  let peak = 0.06;
  for (let frame = 0; frame < levels.length; frame++) {
    const start = frame * frameSamples,
      end = Math.min(length, start + frameSamples);
    let squared = 0;
    for (const channel of channels) {
      for (let sample = start; sample < end; sample++) {
        const value = channel[sample] ?? 0;
        if (Number.isFinite(value)) squared += value * value;
      }
    }
    const rms = Math.sqrt(squared / ((end - start) * channels.length));
    levels[frame] = rms;
    peak = Math.max(peak, rms);
  }
  // Do not amplify digital silence/background hiss into a fictional waveform.
  const floor = 0.003;
  for (let frame = 0; frame < levels.length; frame++) {
    levels[frame] = Math.min(
      1,
      Math.pow(Math.max(0, levels[frame] - floor) / (peak - floor), 0.65),
    );
  }
  return {
    levels,
    frameSeconds: frameSamples / sampleRate,
    durationSeconds: length / sampleRate,
  };
}

export function sampleVoiceEnvelope(
  envelope: VoiceEnvelope | undefined,
  timeSeconds: number,
): number {
  if (
    !envelope ||
    !envelope.levels.length ||
    !Number.isFinite(timeSeconds) ||
    timeSeconds < 0 ||
    timeSeconds >= envelope.durationSeconds
  )
    return 0;
  const position = timeSeconds / envelope.frameSeconds;
  const index = Math.floor(position);
  const current = envelope.levels[index] ?? 0;
  const next =
    envelope.levels[Math.min(index + 1, envelope.levels.length - 1)] ?? 0;
  return current + (next - current) * (position - index);
}

type PlaybackAudio = {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  onended: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  play(): Promise<void> | void;
  pause(): void;
};

/** The third argument is injectable for deterministic playback tests. */
export type PlaybackEnvironment = {
  createAudio(url: string): PlaybackAudio;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  decode(blob: Blob, signal: AbortSignal): Promise<VoiceEnvelope | undefined>;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
};

async function decodeEnvelope(
  blob: Blob,
  signal: AbortSignal,
): Promise<VoiceEnvelope | undefined> {
  let context: AudioContext | undefined;
  let closed = false;
  const close = () => {
    if (context && !closed) {
      closed = true;
      void context.close().catch(() => {});
    }
  };
  try {
    const Constructor =
      globalThis.AudioContext ??
      (
        globalThis as typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!Constructor || signal.aborted) return;
    const bytes = await blob.arrayBuffer();
    if (signal.aborted) return;
    context = new Constructor();
    signal.addEventListener("abort", close, { once: true });
    const buffer = await context.decodeAudioData(bytes);
    if (signal.aborted) return;
    return buildVoiceEnvelope(
      Array.from({ length: buffer.numberOfChannels }, (_, index) =>
        buffer.getChannelData(index),
      ),
      buffer.sampleRate,
    );
  } catch {
    // Analysis is optional. Its failure must never block or silence the reply.
    return;
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}

const browserEnvironment: PlaybackEnvironment = {
  createAudio: (url) => new Audio(url),
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  decode: decodeEnvelope,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
};

export type PlaybackOptions = {
  signal: AbortSignal;
  onStarted?(): void;
  onLevel?(level: number): void;
};
export type PlaybackSession = { play(): Promise<void>; stop(): void };
const abortError = () =>
  new DOMException(translate("Reprodução encerrada"), "AbortError");

/** One playback only. Resolves after ended + a short speaker drain, never at start. */
export function createPlaybackSession(
  blob: Blob,
  options: PlaybackOptions,
  environment: PlaybackEnvironment = browserEnvironment,
): PlaybackSession {
  let stopped = false;
  let playing: Promise<void> | undefined;
  let settle: ((error?: Error) => void) | undefined;
  const emit = (level: number) => {
    try {
      options.onLevel?.(level);
    } catch {
      /* A visual callback must not break voice playback. */
    }
  };
  return {
    play() {
      if (playing) return playing;
      if (stopped || options.signal.aborted) {
        emit(0);
        return Promise.reject(abortError());
      }
      playing = new Promise<void>((resolve, reject) => {
        let url: string | undefined, player: PlaybackAudio | undefined;
        let complete = false,
          ending = false;
        let frame: number | undefined, previousFrame: number | undefined;
        let drainTimer: ReturnType<typeof setTimeout> | undefined;
        let envelope: VoiceEnvelope | undefined,
          level = 0;
        const analysis = new AbortController();
        const finish = (error?: Error) => {
          if (complete) return;
          complete = true;
          clearTimeout(drainTimer);
          if (frame !== undefined) environment.cancelFrame(frame);
          options.signal.removeEventListener("abort", aborted);
          analysis.abort();
          envelope = undefined;
          if (player) {
            player.onended = null;
            player.onerror = null;
            player.pause();
          }
          if (url !== undefined) environment.revokeObjectURL(url);
          emit(0);
          error ? reject(error) : resolve();
        };
        settle = finish;
        const aborted = () => finish(abortError());
        const tick: FrameRequestCallback = (now) => {
          if (complete || ending || !player) return;
          const elapsed =
            previousFrame === undefined
              ? 16
              : Math.min(100, Math.max(0, now - previousFrame));
          previousFrame = now;
          const target =
            player.paused || player.ended
              ? 0
              : sampleVoiceEnvelope(envelope, player.currentTime);
          const alpha = 1 - Math.exp(-elapsed / (target > level ? 45 : 85));
          level += (target - level) * alpha;
          if (level < 0.003) level = 0;
          emit(Math.max(0, Math.min(1, level)));
          if (!complete && !ending) frame = environment.requestFrame(tick);
        };
        try {
          url = environment.createObjectURL(blob);
          player = environment.createAudio(url);
          player.onended = () => {
            if (complete || ending) return;
            ending = true;
            if (frame !== undefined) environment.cancelFrame(frame);
            emit(0);
            drainTimer = setTimeout(() => finish(), 150);
          };
          player.onerror = () =>
            finish(
              new Error(
                translate(
                  "Não foi possível reproduzir a voz. A resposta continua no texto.",
                ),
              ),
            );
          options.signal.addEventListener("abort", aborted, { once: true });
          if (options.signal.aborted) {
            aborted();
            return;
          }
          emit(0);
          if (complete) return;
          // Decode independently: no MediaElementAudioSource node, no routing changes.
          void Promise.resolve()
            .then(() =>
              analysis.signal.aborted
                ? undefined
                : environment.decode(blob, analysis.signal),
            )
            .then((result) => {
              if (!complete && !analysis.signal.aborted) envelope = result;
            })
            .catch(() => {});
          void Promise.resolve(player.play()).then(
            () => {
              if (complete || ending) {
                player?.pause();
                return;
              }
              try {
                options.onStarted?.();
              } catch {
                /* Preserve playback despite a UI callback failure. */
              }
              if (!complete) frame = environment.requestFrame(tick);
            },
            () =>
              finish(
                new Error(
                  translate(
                    "Não foi possível reproduzir a voz. Toque para tentar novamente.",
                  ),
                ),
              ),
          );
        } catch {
          finish(
            new Error(
              translate(
                "Não foi possível reproduzir a voz. A resposta continua no texto.",
              ),
            ),
          );
        }
      });
      return playing;
    },
    stop() {
      stopped = true;
      settle?.(abortError());
    },
  };
}
