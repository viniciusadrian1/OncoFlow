import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildVoiceEnvelope,
  createPlaybackSession,
  sampleVoiceEnvelope,
  type PlaybackEnvironment,
  type VoiceEnvelope,
} from "../../src/features/voice/playback";

function harness(decode?: PlaybackEnvironment["decode"]) {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const audio = {
    currentTime: 0,
    paused: true,
    ended: false,
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    play: vi.fn(async () => {
      audio.paused = false;
    }),
    pause: vi.fn(() => {
      audio.paused = true;
    }),
  };
  const environment: PlaybackEnvironment = {
    createAudio: vi.fn(() => audio),
    createObjectURL: vi.fn(() => "blob:voice-test"),
    revokeObjectURL: vi.fn(),
    decode:
      decode ??
      vi.fn(async () => ({
        levels: new Float32Array([0, 1, 0, 0.8]),
        frameSeconds: 0.1,
        durationSeconds: 0.4,
      })),
    requestFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
  };
  const tick = (atMs: number, audioTime: number) => {
    audio.currentTime = audioTime;
    const ready = [...frames.values()];
    frames.clear();
    ready.forEach((callback) => callback(atMs));
  };
  return { audio, environment, frames, tick };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

afterEach(() => vi.useRealTimers());

describe("voice amplitude envelope", () => {
  it("preserves quiet gaps and follows speech energy at the playback position", () => {
    const samples = new Float32Array(400);
    samples.fill(0.1, 100, 200);
    samples.fill(0.4, 300);
    const envelope = buildVoiceEnvelope([samples], 1000, 100);
    expect(sampleVoiceEnvelope(envelope, 0)).toBe(0);
    expect(sampleVoiceEnvelope(envelope, 0.1)).toBeGreaterThan(0.2);
    expect(sampleVoiceEnvelope(envelope, 0.2)).toBe(0);
    expect(sampleVoiceEnvelope(envelope, 0.3)).toBeGreaterThan(
      sampleVoiceEnvelope(envelope, 0.1),
    );
    expect(sampleVoiceEnvelope(envelope, 0.4)).toBe(0);
    expect(sampleVoiceEnvelope(envelope, Number.NaN)).toBe(0);
  });

  it("does not turn digital silence or tiny noise into a visual voice", () => {
    const quiet = buildVoiceEnvelope(
      [new Float32Array(200).fill(0.001)],
      1000,
      100,
    );
    expect([...quiet.levels]).toEqual([0, 0]);
    const stereo = buildVoiceEnvelope(
      [new Float32Array(100).fill(0.4), new Float32Array(100).fill(-0.4)],
      1000,
      100,
    );
    expect(stereo.levels[0]).toBeGreaterThan(0.8);
  });
});

describe("playback session", () => {
  it("animates from currentTime and resolves only after playback ends", async () => {
    vi.useFakeTimers();
    const h = harness(),
      levels: number[] = [],
      started = vi.fn();
    const session = createPlaybackSession(
      new Blob(["audio"]),
      {
        signal: new AbortController().signal,
        onStarted: started,
        onLevel: (value) => levels.push(value),
      },
      h.environment,
    );
    let completed = false;
    const playing = session.play().then(() => {
      completed = true;
    });
    await flush();
    expect(started).toHaveBeenCalledOnce();
    expect(completed).toBe(false);
    h.tick(10, 0);
    expect(levels.at(-1)).toBe(0);
    h.tick(60, 0.1);
    expect(levels.at(-1)).toBeGreaterThan(0.4);
    const voiced = levels.at(-1)!;
    h.tick(160, 0.2);
    expect(levels.at(-1)).toBeLessThan(voiced);
    h.audio.onended?.();
    expect(levels.at(-1)).toBe(0);
    expect(h.frames.size).toBe(0);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    await playing;
    expect(completed).toBe(true);
    expect(h.environment.revokeObjectURL).toHaveBeenCalledWith(
      "blob:voice-test",
    );
  });

  it("still plays when analysis is unavailable and never invents a waveform", async () => {
    vi.useFakeTimers();
    const h = harness(async () => undefined),
      levels: number[] = [];
    const session = createPlaybackSession(
      new Blob(),
      {
        signal: new AbortController().signal,
        onLevel: (value) => levels.push(value),
      },
      h.environment,
    );
    const playing = session.play();
    await flush();
    h.tick(100, 0.1);
    expect(h.audio.play).toHaveBeenCalledOnce();
    expect(levels.every((value) => value === 0)).toBe(true);
    h.audio.onended?.();
    await vi.advanceTimersByTimeAsync(150);
    await playing;
  });

  it("stops immediately on abort and ignores a late decoder and animation frame", async () => {
    let decoded!: (value: VoiceEnvelope) => void;
    const h = harness(
      () =>
        new Promise((resolve) => {
          decoded = resolve;
        }),
    );
    const abort = new AbortController(),
      levels: number[] = [];
    const session = createPlaybackSession(
      new Blob(),
      { signal: abort.signal, onLevel: (value) => levels.push(value) },
      h.environment,
    );
    const playing = session.play();
    const rejected = expect(playing).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    const oldFrame = [...h.frames.values()][0];
    abort.abort();
    await rejected;
    const length = levels.length;
    decoded({
      levels: new Float32Array([1]),
      frameSeconds: 1,
      durationSeconds: 1,
    });
    await flush();
    oldFrame(50);
    expect(levels.length).toBe(length);
    expect(levels.at(-1)).toBe(0);
    expect(h.audio.pause).toHaveBeenCalled();
    expect(h.frames.size).toBe(0);
    expect(h.environment.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it("handles play rejection and stop before play without leaving work pending", async () => {
    const h = harness();
    h.audio.play.mockRejectedValue(new Error("blocked"));
    const session = createPlaybackSession(
      new Blob(),
      { signal: new AbortController().signal },
      h.environment,
    );
    await expect(session.play()).rejects.toThrow("reproduzir");
    expect(h.environment.revokeObjectURL).toHaveBeenCalledOnce();
    expect(h.frames.size).toBe(0);
    const idle = harness();
    const stopped = createPlaybackSession(
      new Blob(),
      { signal: new AbortController().signal },
      idle.environment,
    );
    stopped.stop();
    await expect(stopped.play()).rejects.toMatchObject({ name: "AbortError" });
    expect(idle.environment.createAudio).not.toHaveBeenCalled();
  });

  it("stop settles once even when called repeatedly during the drain period", async () => {
    vi.useFakeTimers();
    const h = harness(),
      level = vi.fn();
    const session = createPlaybackSession(
      new Blob(),
      { signal: new AbortController().signal, onLevel: level },
      h.environment,
    );
    const playing = session.play();
    const rejected = expect(playing).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    h.audio.onended?.();
    session.stop();
    session.stop();
    await rejected;
    await vi.advanceTimersByTimeAsync(500);
    expect(h.environment.revokeObjectURL).toHaveBeenCalledOnce();
    expect(h.frames.size).toBe(0);
    expect(level).toHaveBeenLastCalledWith(0);
  });

  it("does not start audio or decoding when the first visual callback cancels", async () => {
    const h = harness(),
      abort = new AbortController();
    const session = createPlaybackSession(
      new Blob(),
      { signal: abort.signal, onLevel: () => abort.abort() },
      h.environment,
    );
    await expect(session.play()).rejects.toMatchObject({ name: "AbortError" });
    await flush();
    expect(h.audio.play).not.toHaveBeenCalled();
    expect(h.environment.decode).not.toHaveBeenCalled();
  });

  it("pauses again if a pending play attempt resolves after cancellation", async () => {
    const h = harness();
    let begin!: () => void;
    h.audio.play.mockImplementation(
      () =>
        new Promise((resolve) => {
          begin = () => {
            h.audio.paused = false;
            resolve();
          };
        }),
    );
    const session = createPlaybackSession(
      new Blob(),
      { signal: new AbortController().signal },
      h.environment,
    );
    const playing = session.play();
    const rejected = expect(playing).rejects.toMatchObject({
      name: "AbortError",
    });
    session.stop();
    await rejected;
    begin();
    await flush();
    expect(h.audio.paused).toBe(true);
    expect(h.frames.size).toBe(0);
  });
});
