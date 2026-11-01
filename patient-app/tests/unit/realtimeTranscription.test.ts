import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectRealtimeInput,
  createTranscriptionEvents,
  type LiveInputHandlers,
} from "../../src/features/voice/realtimeTranscription";
import { createTranscriptionSession } from "../../src/adapters/liaProvider";
import {
  createSpeechGate,
  SPEECH_GATE_SETTINGS,
} from "../../src/features/voice/speechGate";
vi.mock("../../src/features/voice/speechGate", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/features/voice/speechGate")
  >()),
  createSpeechGate: vi.fn(),
}));
vi.mock("../../src/adapters/liaProvider", () => ({
  createTranscriptionSession: vi.fn(),
}));
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const handlers = (): LiveInputHandlers => ({
  onSpeechStart: vi.fn(),
  onSpeechEnd: vi.fn(),
  onPartial: vi.fn(),
  onTranscript: vi.fn(),
  onLevel: vi.fn(),
  onError: vi.fn(),
});
const event = (type: string, item_id: string, extra = {}) => ({
  type,
  item_id,
  ...extra,
});
const started = (id: string) => event("input_audio_buffer.speech_started", id);
const completed = (id: string, transcript = id) =>
  event("conversation.item.input_audio_transcription.completed", id, {
    transcript,
  });

describe("transcription item routing", () => {
  it("keeps a finished pre-mute utterance and rejects all new muted speech", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(started("accepted"));
    router.receive(event("input_audio_buffer.speech_stopped", "accepted"));
    router.setMuted(true);
    router.receive(started("muted-noise"));
    router.receive(completed("muted-noise", "Ignorar"));
    router.receive(completed("accepted", "Quando é minha consulta?"));
    router.receive(completed("accepted", "Quando é minha consulta?"));
    expect(h.onTranscript).toHaveBeenCalledExactlyOnceWith(
      "Quando é minha consulta?",
    );
    router.setMuted(false);
    router.receive(completed("accepted"));
    expect(h.onTranscript).toHaveBeenCalledTimes(1);
  });
  it("accepts a new committed item ID when explicitly ending a provisional speech item", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(started("provisional"));
    router.expectManualCommit();
    router.receive(
      event("input_audio_buffer.committed", "committed", {
        previous_item_id: null,
      }),
    );
    router.receive(completed("committed", "Fala concluída"));
    router.receive(completed("provisional", "Callback antigo"));
    expect(h.onTranscript).toHaveBeenCalledExactlyOnceWith("Fala concluída");
  });
  it("a newer speech start retires previous transcripts, partials, stops and errors", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(started("old"));
    router.receive(started("new"));
    router.receive(
      event("conversation.item.input_audio_transcription.delta", "old", {
        delta: "old partial",
      }),
    );
    router.receive(event("input_audio_buffer.speech_stopped", "old"));
    router.receive(completed("new", "Nova pergunta"));
    router.receive(completed("old", "Pergunta atrasada"));
    router.receive(
      event("conversation.item.input_audio_transcription.failed", "old"),
    );
    expect(h.onTranscript).toHaveBeenCalledExactlyOnceWith("Nova pergunta");
    expect(h.onPartial).not.toHaveBeenCalledWith("old partial");
    expect(h.onSpeechEnd).not.toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });
  it("deduplicates speech events and completed transcripts", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(started("one"));
    router.receive(started("one"));
    router.receive(event("input_audio_buffer.speech_stopped", "one"));
    router.receive(event("input_audio_buffer.speech_stopped", "one"));
    router.receive(completed("one"));
    router.receive(completed("one"));
    expect(h.onSpeechStart).toHaveBeenCalledTimes(1);
    expect(h.onSpeechEnd).toHaveBeenCalledTimes(1);
    expect(h.onTranscript).toHaveBeenCalledTimes(1);
  });
  it("does not replay a muted utterance after unmuting or accept unknown completed IDs", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(started("muted"));
    router.setMuted(true);
    router.setMuted(false);
    router.receive(completed("muted"));
    router.receive(completed("unknown"));
    expect(h.onTranscript).not.toHaveBeenCalled();
    router.receive(started("fresh"));
    router.receive(completed("fresh"));
    expect(h.onTranscript).toHaveBeenCalledExactlyOnceWith("fresh");
    router.close();
    router.receive(started("closed"));
    router.receive(completed("closed"));
    expect(h.onTranscript).toHaveBeenCalledTimes(1);
  });
  it("accepts a manually committed turn without a VAD start", () => {
    const h = handlers(),
      router = createTranscriptionEvents(h);
    router.receive(
      event("input_audio_buffer.committed", "manual", {
        previous_item_id: null,
      }),
    );
    router.receive(completed("manual", "Fala baixa"));
    expect(h.onTranscript).toHaveBeenCalledExactlyOnceWith("Fala baixa");
  });
});

function transportSetup() {
  const h = handlers();
  const track = {
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  vi.mocked(createSpeechGate).mockResolvedValue({
    stream: stream as unknown as MediaStream,
    setMuted: vi.fn(),
    close: vi.fn(),
  });
  const channel = {
    readyState: "open",
    onmessage: null as null | ((message: { data: string }) => void),
    onclose: null as null | (() => void),
    onerror: null as null | (() => void),
    close: vi.fn(),
    send: vi.fn(),
  };
  const peer = {
    connectionState: "connected",
    onconnectionstatechange: null as null | (() => void),
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => channel),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "fixture-offer" })),
    localDescription: { sdp: "fixture-local" },
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {}),
    close: vi.fn(),
  };
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  });
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      constructor() {
        return peer;
      }
    },
  );
  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "fixture-answer" })),
  );
  vi.mocked(createTranscriptionSession).mockResolvedValue({
    clientSecret: "ek_fixture",
    expiresAt: 4_000_000_000,
  });
  const message = (value: object) =>
    channel.onmessage?.({ data: JSON.stringify(value) });
  return { h, track, stream, peer, channel, message };
}

describe("realtime input lifecycle", () => {
  it("drains the delayed audio before manual commit and coalesces repeated taps", async () => {
    vi.useFakeTimers();
    const t = transportSetup();
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    await flush();
    t.message({ type: "session.created" });
    const input = await connecting;
    input.finishTurn();
    input.finishTurn();
    expect(t.channel.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SPEECH_GATE_SETTINGS.delayMs + 99);
    expect(t.channel.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.channel.send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    );
    input.close();
  });
  it.each(["mute", "close", "natural-end"])(
    "cancels pending manual commit on %s",
    async (action) => {
      vi.useFakeTimers();
      const t = transportSetup();
      const connecting = connectRealtimeInput(
        t.h,
        new AbortController().signal,
      );
      await flush();
      t.message({ type: "session.created" });
      const input = await connecting;
      t.message(started("active"));
      input.finishTurn();
      if (action === "mute") input.setMuted(true);
      else if (action === "close") input.close();
      else t.message(event("input_audio_buffer.speech_stopped", "active"));
      await vi.advanceTimersByTimeAsync(SPEECH_GATE_SETTINGS.delayMs + 1000);
      expect(t.channel.send).not.toHaveBeenCalledWith(
        JSON.stringify({ type: "input_audio_buffer.commit" }),
      );
      input.close();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("sends the filtered stream rather than raw microphone audio", async () => {
    const t = transportSetup();
    const filteredTrack = { enabled: true } as MediaStreamTrack;
    const filtered = {
      getAudioTracks: () => [filteredTrack],
    } as unknown as MediaStream;
    const gate = { stream: filtered, setMuted: vi.fn(), close: vi.fn() };
    vi.mocked(createSpeechGate).mockResolvedValue(gate);
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    await flush();
    t.message({ type: "session.created" });
    const input = await connecting;
    expect(t.peer.addTrack).toHaveBeenCalledExactlyOnceWith(
      filteredTrack,
      filtered,
    );
    input.setMuted(true);
    expect(gate.setMuted).toHaveBeenCalledWith(true);
    input.close();
    expect(gate.close).toHaveBeenCalledOnce();
  });
  it("does not bypass the speech filter when the neural model fails to load", async () => {
    const t = transportSetup();
    vi.mocked(createSpeechGate).mockRejectedValue(
      new Error("Filtro de voz indisponível"),
    );
    await expect(
      connectRealtimeInput(t.h, new AbortController().signal),
    ).rejects.toThrow("Filtro de voz");
    expect(t.peer.addTrack).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalledOnce();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("silences capture without clearing an already finished utterance awaiting transcription", async () => {
    vi.useFakeTimers();
    const t = transportSetup();
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    await flush();
    t.message({ type: "session.created" });
    const input = await connecting;
    t.message(started("before-mute"));
    t.message(event("input_audio_buffer.speech_stopped", "before-mute"));
    t.channel.send.mockClear();
    input.setMuted(true);
    expect(t.track.enabled).toBe(false);
    expect(t.channel.send).not.toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.clear" }),
    );
    t.message(started("muted-noise"));
    t.message(completed("muted-noise"));
    t.message(completed("before-mute", "Minha agenda"));
    expect(t.h.onTranscript).toHaveBeenCalledExactlyOnceWith("Minha agenda");
    input.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("waits for session confirmation, keeps capture through turns, and closes everything", async () => {
    vi.useFakeTimers();
    const t = transportSetup(),
      abort = new AbortController();
    let resolved = false;
    const connecting = connectRealtimeInput(t.h, abort.signal).then((input) => {
      resolved = true;
      return input;
    });
    await flush();
    expect(resolved).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        body: "fixture-local",
        headers: {
          Authorization: "Bearer ek_fixture",
          "Content-Type": "application/sdp",
        },
      }),
    );
    t.message({ type: "session.created", session: { type: "transcription" } });
    const input = await connecting;
    t.message(started("one"));
    t.message(completed("one"));
    t.message(started("two"));
    t.message(completed("two"));
    expect(t.h.onTranscript).toHaveBeenCalledTimes(2);
    expect(t.track.stop).not.toHaveBeenCalled();
    input.setMuted(true);
    expect(t.track.enabled).toBe(false);
    expect(t.channel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.clear" }),
    );
    input.setMuted(false);
    expect(t.track.enabled).toBe(true);
    input.close();
    input.close();
    abort.abort();
    expect(t.track.stop).toHaveBeenCalledTimes(1);
    expect(t.peer.close).toHaveBeenCalledTimes(1);
    expect(t.channel.onmessage).toBeNull();
    expect(t.peer.onconnectionstatechange).toBeNull();
    expect(t.track.removeEventListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects a service error before session.created instead of hanging until timeout", async () => {
    vi.useFakeTimers();
    const t = transportSetup();
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    const failed = expect(connecting).rejects.toThrow("conexão de voz");
    await flush();
    t.message({ type: "error", error: { code: "invalid_session" } });
    await failed;
    expect(t.peer.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds startup and releases microphone permission granted after timeout", async () => {
    vi.useFakeTimers();
    const t = transportSetup();
    let grant!: (stream: unknown) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
      () =>
        new Promise((resolve) => {
          grant = resolve as typeof grant;
        }),
    );
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    const failed = expect(connecting).rejects.toThrow("demorou demais");
    await vi.advanceTimersByTimeAsync(25001);
    await failed;
    grant(t.stream);
    await flush();
    expect(t.track.stop).toHaveBeenCalledTimes(1);
    expect(createTranscriptionSession).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ignores temporary disconnect recovery, then reports one terminal failure", async () => {
    vi.useFakeTimers();
    const t = transportSetup();
    const connecting = connectRealtimeInput(t.h, new AbortController().signal);
    await flush();
    t.message({ type: "session.created" });
    const input = await connecting;
    t.peer.connectionState = "disconnected";
    t.peer.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(3000);
    t.peer.connectionState = "connected";
    t.peer.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(t.h.onError).not.toHaveBeenCalled();
    t.peer.connectionState = "disconnected";
    t.peer.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(5001);
    expect(t.h.onError).toHaveBeenCalledTimes(1);
    input.close();
    expect(t.peer.close).toHaveBeenCalledTimes(1);
  });
  it("aborts an in-flight handshake and never applies its late SDP", async () => {
    const t = transportSetup(),
      abort = new AbortController();
    let reply!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          reply = resolve as typeof reply;
        }),
    );
    const connecting = connectRealtimeInput(t.h, abort.signal);
    const failed = expect(connecting).rejects.toMatchObject({
      name: "AbortError",
    });
    await flush();
    abort.abort();
    await failed;
    reply({ ok: true, text: async () => "late-answer" });
    await flush();
    expect(t.peer.setRemoteDescription).not.toHaveBeenCalled();
    expect(t.track.stop).toHaveBeenCalledTimes(1);
  });
});
