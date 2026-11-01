import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTurnDetector } from "../../src/features/voice/turnDetector";

const mocked = vi.hoisted(() => ({
  native: true,
  listeners: new Map<string, (value: unknown) => void>(),
  plugin: {
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mocked.native },
  registerPlugin: () => mocked.plugin,
}));
const sample = { base64: "YWJj", mimeType: "audio/mp4", durationMs: 1500 };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocked.native = true;
  mocked.listeners.clear();
  mocked.plugin.start.mockResolvedValue({});
  mocked.plugin.stop.mockResolvedValue(sample);
  mocked.plugin.cancel.mockResolvedValue({});
  mocked.plugin.addListener.mockImplementation(async (name, callback) => {
    mocked.listeners.set(name, callback);
    return {
      remove: async () => {
        mocked.listeners.delete(name);
      },
    };
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("browser turn detector", () => {
  it.each([
    [80, 650, 80],
    [500, 1100, 500],
    [80, 1800, 800],
  ])("ends voice above background (%i → %i → %i)", (before, voice, after) => {
    const gate = createTurnDetector();
    for (let ms = 100; ms <= 2000; ms += 100) gate.sample(ms, before);
    expect(gate.hasSpeech()).toBe(false);
    for (let ms = 2100; ms <= 5000; ms += 100)
      expect(gate.sample(ms, voice)).toBe("listening");
    expect(gate.hasSpeech()).toBe(true);
    for (let ms = 5100; ms < 6400; ms += 100)
      expect(gate.sample(ms, after)).toBe("listening");
    expect(gate.sample(6400, after)).toBe("finished");
  });
  it("accepts an immediate soft voice without a mandatory calibration pause", () => {
    const gate = createTurnDetector();
    gate.sample(100, 650);
    gate.sample(200, 650);
    expect(gate.hasSpeech()).toBe(true);
    expect(gate.sample(1600, 80)).toBe("finished");
  });
  it("does not let a single loud click raise the speech release threshold", () => {
    const gate = createTurnDetector();
    gate.sample(100, 18000);
    for (let ms = 200; ms <= 3000; ms += 100)
      expect(gate.sample(ms, 650)).toBe("listening");
    expect(gate.hasSpeech()).toBe(true);
    expect(gate.sample(4400, 80)).toBe("finished");
  });
  it("does not upload silent time or an isolated click", () => {
    const gate = createTurnDetector();
    gate.sample(100, 18000);
    gate.sample(200, 0);
    gate.sample(500, 0);
    expect(gate.hasSpeech()).toBe(false);
    expect(gate.sample(11900, 0)).toBe("listening");
    expect(gate.sample(12000, 0)).toBe("no_speech");
  });
  it("waits for a complete pause after speech instead of cutting short gaps", () => {
    const gate = createTurnDetector();
    gate.sample(100, 1800);
    gate.sample(200, 1600);
    expect(gate.hasSpeech()).toBe(true);
    expect(gate.sample(1200, 0)).toBe("listening");
    gate.sample(1300, 2000);
    expect(gate.sample(2600, 0)).toBe("listening");
    expect(gate.sample(2700, 0)).toBe("finished");
    expect(gate.sample(2800, 4000)).toBe("finished");
  });
});

describe("capture lifecycle", () => {
  it("reports scoped native levels and resets them when capture is cancelled", async () => {
    const capture = await import("../../src/features/voice/capture");
    const onLevel = vi.fn();
    await capture.startCapture(vi.fn(), vi.fn(), { onLevel });
    const id = mocked.plugin.start.mock.calls[0][0].captureId;
    const queued = mocked.listeners.get("recordingLevel")!;
    queued({ captureId: "other", level: 0.8, speech: true });
    expect(onLevel).not.toHaveBeenCalled();
    queued({ captureId: id, level: 0.4, speech: true });
    expect(onLevel).toHaveBeenLastCalledWith(0.4, true);
    queued({ captureId: id, level: Number.NaN, speech: true });
    expect(onLevel).toHaveBeenCalledTimes(1);
    await capture.cancelCapture();
    expect(onLevel).toHaveBeenLastCalledWith(0, false);
    const count = onLevel.mock.calls.length;
    queued({ captureId: id, level: 0.9, speech: true });
    expect(onLevel).toHaveBeenCalledTimes(count);
  });

  it("uses a bounded watchdog when native automatic completion does not arrive", async () => {
    vi.useFakeTimers();
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn(),
      error = vi.fn();
    await capture.startCapture(auto, error, { autoStopOnSilence: true });
    const id = mocked.plugin.start.mock.calls[0][0].captureId;
    await vi.advanceTimersByTimeAsync(31_499);
    expect(auto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocked.plugin.stop).toHaveBeenCalledWith({ captureId: id });
    expect(auto).toHaveBeenCalledExactlyOnceWith(sample);
    expect(error).not.toHaveBeenCalled();
    expect(mocked.listeners.size).toBe(0);
  });

  it("ends visibly and cancels capture when even native stop never resolves", async () => {
    vi.useFakeTimers();
    let finishLate!: (audio: typeof sample) => void;
    mocked.plugin.stop.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLate = resolve;
        }),
    );
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn(),
      error = vi.fn();
    await capture.startCapture(auto, error);
    const id = mocked.plugin.start.mock.calls[0][0].captureId;
    await vi.advanceTimersByTimeAsync(34_500);
    expect(auto).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CAPTURE_TIMEOUT" }),
    );
    expect(mocked.plugin.cancel).toHaveBeenCalledWith({ captureId: id });
    expect(mocked.listeners.size).toBe(0);
    finishLate(sample);
    await vi.advanceTimersByTimeAsync(0);
    expect(auto).not.toHaveBeenCalled();
  });

  it("clears the native watchdog on mute/cancel without stopping a later capture", async () => {
    vi.useFakeTimers();
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn();
    await capture.startCapture(auto);
    await capture.cancelCapture();
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocked.plugin.stop).not.toHaveBeenCalled();
    expect(auto).not.toHaveBeenCalled();
  });
  it("passes silence detection only when explicitly enabled", async () => {
    const capture = await import("../../src/features/voice/capture");
    await capture.startCapture(vi.fn(), vi.fn(), { autoStopOnSilence: true });
    expect(mocked.plugin.start).toHaveBeenCalledWith(
      expect.objectContaining({ autoStopOnSilence: true }),
    );
    await capture.cancelCapture();
    await capture.startCapture(vi.fn());
    expect(mocked.plugin.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ autoStopOnSilence: false }),
    );
    await capture.cancelCapture();
  });

  it("reports silent turns with NO_SPEECH and never invents a transcript", async () => {
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn(),
      error = vi.fn();
    await capture.startCapture(auto, error, { autoStopOnSilence: true });
    mocked.listeners.get("recordingError")!({ code: "NO_SPEECH" });
    expect(auto).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NO_SPEECH" }),
    );
    expect(mocked.listeners.size).toBe(0);
  });

  it("returns manual capture only once and removes event listeners", async () => {
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn();
    await capture.startCapture(auto);
    expect(await capture.stopCapture()).toEqual(sample);
    expect(auto).not.toHaveBeenCalled();
    expect(mocked.listeners.size).toBe(0);
    await expect(capture.stopCapture()).rejects.toThrow();
  });

  it("delivers the 30-second completion once and discards late events", async () => {
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn();
    await capture.startCapture(auto);
    const listener = mocked.listeners.get("recordingStopped")!;
    listener(sample);
    listener(sample);
    await Promise.resolve();
    expect(auto).toHaveBeenCalledExactlyOnceWith(sample);
    expect(mocked.listeners.size).toBe(0);
  });

  it("reports background cancellation without inventing audio", async () => {
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn(),
      error = vi.fn();
    await capture.startCapture(auto, error);
    mocked.listeners.get("recordingError")!({ code: "CAPTURE_CANCELLED" });
    expect(auto).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    await expect(capture.stopCapture()).rejects.toThrow();
  });

  it("cleans listeners when microphone permission is rejected", async () => {
    const capture = await import("../../src/features/voice/capture");
    mocked.plugin.start.mockRejectedValue(
      new Error("Microfone não autorizado."),
    );
    await expect(capture.startCapture(vi.fn())).rejects.toThrow("Microfone");
    expect(mocked.listeners.size).toBe(0);
  });

  it("does not deliver a queued completion from the previous capture", async () => {
    const capture = await import("../../src/features/voice/capture");
    await capture.startCapture(vi.fn());
    const previousId = mocked.plugin.start.mock.calls[0][0].captureId;
    await capture.cancelCapture();
    const auto = vi.fn();
    await capture.startCapture(auto);
    const currentId = mocked.plugin.start.mock.calls[1][0].captureId;
    mocked.listeners.get("recordingStopped")!({
      ...sample,
      captureId: previousId,
    });
    expect(auto).not.toHaveBeenCalled();
    mocked.listeners.get("recordingStopped")!({
      ...sample,
      captureId: currentId,
    });
    expect(auto).toHaveBeenCalledOnce();
  });

  it("keeps cancellation scoped to the old capture when native start resolves late", async () => {
    const capture = await import("../../src/features/voice/capture");
    let started!: () => void;
    mocked.plugin.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          started = resolve;
        }),
    );
    const pending = capture.startCapture(vi.fn());
    await vi.waitFor(() => expect(mocked.plugin.start).toHaveBeenCalledOnce());
    const oldId = mocked.plugin.start.mock.calls[0][0].captureId;
    await capture.cancelCapture();
    await capture.startCapture(vi.fn());
    const rejection = expect(pending).rejects.toThrow("cancelada");
    started();
    await rejection;
    expect(
      mocked.plugin.cancel.mock.calls.every(
        ([options]) => options.captureId === oldId,
      ),
    ).toBe(true);
    await capture.cancelCapture();
  });

  it("keeps one result when automatic completion crosses a manual stop", async () => {
    const capture = await import("../../src/features/voice/capture");
    const auto = vi.fn();
    await capture.startCapture(auto);
    const id = mocked.plugin.start.mock.calls[0][0].captureId;
    const queued = mocked.listeners.get("recordingStopped")!;
    mocked.plugin.stop.mockImplementationOnce(async () => {
      queued({ ...sample, captureId: id });
      // Native stop consumes the completion buffered at its duration limit.
      return sample;
    });
    expect(await capture.stopCapture()).toEqual(sample);
    expect(auto).not.toHaveBeenCalled();
    await expect(capture.stopCapture()).rejects.toThrow();
  });

  it("releases the native automatic-result buffer after successful delivery", async () => {
    const capture = await import("../../src/features/voice/capture");
    await capture.startCapture(vi.fn());
    const id = mocked.plugin.start.mock.calls[0][0].captureId;
    mocked.listeners.get("recordingStopped")!({ ...sample, captureId: id });
    expect(mocked.plugin.cancel).toHaveBeenCalledWith({ captureId: id });
  });

  it("stops a late browser stream when cancellation precedes permission", async () => {
    mocked.native = false;
    let grant!: (value: MediaStream) => void;
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            grant = resolve;
          }),
      },
    });
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    const capture = await import("../../src/features/voice/capture");
    const starting = capture.startCapture(vi.fn());
    const rejected = expect(starting).rejects.toThrow();
    await capture.cancelCapture();
    grant(stream);
    await rejected;
    expect(stop).toHaveBeenCalledOnce();
  });

  it("mirrors microphone levels in a browser and releases analysis on cancellation", async () => {
    vi.useFakeTimers();
    mocked.native = false;
    const stopTrack = vi.fn(),
      disconnect = vi.fn(),
      close = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [{ stop: stopTrack }] }),
      },
    });
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported() {
          return true;
        }
        state = "inactive";
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
        }
      },
    );
    vi.stubGlobal(
      "AudioContext",
      class {
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect };
        }
        createAnalyser() {
          return {
            fftSize: 2048,
            getFloatTimeDomainData: (data: Float32Array) => data.fill(0.04),
          };
        }
        async resume() {}
        close = close;
      },
    );
    const capture = await import("../../src/features/voice/capture");
    const onLevel = vi.fn();
    await capture.startCapture(vi.fn(), vi.fn(), { onLevel });
    await vi.advanceTimersByTimeAsync(100);
    expect(onLevel.mock.calls.at(-1)?.[0]).toBeCloseTo(0.2);
    expect(onLevel.mock.calls.at(-1)?.[1]).toBe(false);
    await capture.cancelCapture();
    expect(onLevel).toHaveBeenLastCalledWith(0, false);
    const count = onLevel.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onLevel).toHaveBeenCalledTimes(count);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(stopTrack).toHaveBeenCalledOnce();
  });
});
