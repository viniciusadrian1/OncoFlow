import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechGate,
  type SpeechGateEnvironment,
  type SpeechGateEngine,
} from "../../src/features/voice/speechGate";
import type { RealTimeVADOptions } from "@ricky0123/vad-web";

const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
function harness() {
  let options!: Partial<RealTimeVADOptions>;
  const delays: any[] = [];
  const rawStop = vi.fn(),
    outputStop = vi.fn();
  const raw = {
    getTracks: () => [{ stop: rawStop }],
  } as unknown as MediaStream;
  const output = {
    getTracks: () => [{ stop: outputStop }],
  } as unknown as MediaStream;
  const gain = {
    gain: { value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    currentTime: 0,
    state: "running",
    audioWorklet: {},
    createMediaStreamSource: vi.fn(() => source),
    createMediaStreamDestination: vi.fn(() => ({
      stream: output,
      disconnect: vi.fn(),
    })),
    createGain: vi.fn(() => gain),
    createDelay: vi.fn(() => {
      const delay = {
        delayTime: { value: 0 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      delays.push(delay);
      return delay;
    }),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const engine: SpeechGateEngine = {
    start: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    processFrame: vi.fn(async () => {}),
  };
  const environment: SpeechGateEnvironment = {
    createContext: () => context as unknown as AudioContext,
    assetBaseURL: () => "https://localhost/vad/",
    createEngine: vi.fn(async (given) => {
      options = given;
      return engine;
    }),
  };
  const onLevel = vi.fn(),
    onSpeechState = vi.fn(),
    onError = vi.fn();
  const callbacks = { onLevel, onSpeechState, onError };
  const abort = new AbortController();
  return {
    raw,
    output,
    rawStop,
    outputStop,
    source,
    gain,
    context,
    delays,
    engine,
    environment,
    callbacks,
    abort,
    options: () => options,
  };
}
afterEach(() => vi.useRealTimers());

describe("local neural speech gate", () => {
  it("loads local v5 assets with one WASM thread and preserves ownership of raw tracks", async () => {
    const h = harness();
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    expect(gate.stream).toBe(h.output);
    expect(h.options()).toMatchObject({
      model: "v5",
      baseAssetPath: "https://localhost/vad/",
      onnxWASMBasePath: "https://localhost/vad/",
      startOnLoad: false,
      processorType: "AudioWorklet",
      submitUserSpeechOnPause: false,
    });
    const ort: any = { env: { wasm: {}, logLevel: "warning" } };
    h.options().ortConfig?.(ort);
    expect(ort.env.wasm).toMatchObject({ numThreads: 1, proxy: false });
    expect(h.delays[0].delayTime.value).toBe(0.85);
    gate.close();
    await flush();
    expect(h.rawStop).not.toHaveBeenCalled();
    expect(h.outputStop).toHaveBeenCalledOnce();
    expect(h.engine.destroy).toHaveBeenCalledOnce();
  });

  it("keeps continuous fan energy and unconfirmed clicks silent", async () => {
    const h = harness();
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    h.options().onFrameProcessed?.(
      { isSpeech: 0.08, notSpeech: 0.92 },
      new Float32Array(512).fill(0.9),
    );
    h.options().onSpeechStart?.();
    h.options().onVADMisfire?.();
    expect(
      h.gain.gain.setValueAtTime.mock.calls.some(([value]) => value > 0),
    ).toBe(false);
    expect(h.callbacks.onLevel).toHaveBeenLastCalledWith(0);
    gate.close();
  });

  it("opens only confirmed speech and delays closing to preserve buffered word endings", async () => {
    vi.useFakeTimers();
    const h = harness();
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    h.context.currentTime = 0.25;
    h.options().onSpeechRealStart?.();
    expect(h.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 0.25);
    h.options().onFrameProcessed?.(
      { isSpeech: 0.9, notSpeech: 0.1 },
      new Float32Array(512).fill(0.1),
    );
    expect(h.callbacks.onLevel.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    h.options().onSpeechEnd?.(new Float32Array());
    await vi.advanceTimersByTimeAsync(449);
    expect(h.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, 0.25);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0.25);
    expect(h.callbacks.onLevel).toHaveBeenLastCalledWith(0);
    gate.close();
  });

  it("mute flushes the delay and suppresses late speech callbacks before resuming", async () => {
    const h = harness();
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    h.options().onSpeechRealStart?.();
    gate.setMuted(true);
    h.options().onSpeechRealStart?.();
    expect(h.gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
    expect(h.delays[0].disconnect).toHaveBeenCalled();
    await flush();
    expect(h.engine.pause).toHaveBeenCalled();
    gate.setMuted(false);
    await flush();
    expect(h.delays.length).toBe(2);
    expect(h.engine.start).toHaveBeenCalledTimes(2);
    expect(h.rawStop).not.toHaveBeenCalled();
    gate.close();
  });

  it("rapid mute toggles restore only the final requested state", async () => {
    const h = harness();
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    gate.setMuted(true);
    gate.setMuted(false);
    gate.setMuted(true);
    gate.setMuted(false);
    await flush();
    expect(h.engine.start).toHaveBeenCalledTimes(2);
    expect(h.delays.length).toBe(2);
    gate.close();
  });

  it("fails closed with a Portuguese error when the local model cannot load", async () => {
    const h = harness();
    h.environment.createEngine = vi.fn(async () => {
      throw new Error("wasm fetch failed");
    });
    await expect(
      createSpeechGate(h.raw, h.callbacks, h.abort.signal, h.environment),
    ).rejects.toThrow("detector de fala");
    expect(h.callbacks.onError).toHaveBeenCalledOnce();
    expect(h.rawStop).not.toHaveBeenCalled();
    expect(h.outputStop).toHaveBeenCalledOnce();
    expect(h.context.close).toHaveBeenCalledOnce();
  });

  it("aborts initialization and releases a model that finishes loading late", async () => {
    const h = harness();
    let loaded!: (engine: SpeechGateEngine) => void;
    h.environment.createEngine = vi.fn(
      () =>
        new Promise<SpeechGateEngine>((resolve) => {
          loaded = resolve;
        }),
    );
    const starting = createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    const rejected = expect(starting).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    h.abort.abort();
    await rejected;
    loaded(h.engine);
    await flush();
    expect(h.engine.start).not.toHaveBeenCalled();
    expect(h.engine.destroy).toHaveBeenCalledOnce();
    expect(h.callbacks.onError).not.toHaveBeenCalled();
  });

  it("drops a frame in flight across mute/unmute and resets before the next frame", async () => {
    const h = harness();
    let complete!: () => void;
    h.engine.processFrame = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = () => {
            h.options().onSpeechRealStart?.();
            resolve();
          };
        }),
    );
    const gate = await createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    const frame = h.engine.processFrame(new Float32Array(512));
    await flush();
    gate.setMuted(true);
    gate.setMuted(false);
    complete();
    await frame;
    await flush();
    expect(
      h.gain.gain.setValueAtTime.mock.calls.some(([value]) => value > 0),
    ).toBe(false);
    expect(h.engine.pause).toHaveBeenCalled();
    gate.close();
  });

  it("aborts a pending worklet startup without waiting for it to finish", async () => {
    const h = harness();
    let start!: () => void;
    h.engine.start = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          start = resolve;
        }),
    );
    const pending = createSpeechGate(
      h.raw,
      h.callbacks,
      h.abort.signal,
      h.environment,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    h.abort.abort();
    await rejected;
    expect(h.outputStop).toHaveBeenCalledOnce();
    start();
    await flush();
    expect(h.engine.destroy).toHaveBeenCalledOnce();
  });
});
