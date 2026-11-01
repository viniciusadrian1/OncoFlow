import { translate } from "../../i18n";
import { createTranscriptionSession } from "../../adapters/liaProvider";
import { createSpeechGate, SPEECH_GATE_SETTINGS } from "./speechGate";

export type LiveInputHandlers = {
  onSpeechStart(): void;
  onSpeechEnd(): void;
  onPartial(text: string): void;
  onTranscript(text: string): void;
  onLevel(level: number): void;
  onError(error: Error): void;
};
export type LiveInput = {
  setMuted(value: boolean): void;
  finishTurn(): void;
  close(): void;
};
type RealtimeEvent = {
  type: string;
  item_id?: string;
  previous_item_id?: string | null;
  delta?: string;
  transcript?: string;
  error?: { code?: string };
};

/** Control events establish utterance order; late ASR completions never take over a newer turn. */
export function createTranscriptionEvents(handlers: LiveInputHandlers) {
  let muted = false,
    closed = false,
    manualCommitPending = false;
  let latest:
    | { id: string; ended: boolean; delivered: boolean; partial: string }
    | undefined;
  const known = new Set<string>();
  function remember(id: string) {
    known.add(id);
    if (known.size > 256) known.delete(known.values().next().value!);
  }
  function begin(id: string) {
    remember(id);
    latest = { id, ended: false, delivered: false, partial: "" };
    handlers.onPartial("");
    handlers.onSpeechStart();
  }
  return {
    hasPendingTranscript() {
      return !closed && !!latest?.ended && !latest.delivered;
    },
    expectManualCommit() {
      if (!closed && !muted) manualCommitPending = true;
    },
    setMuted(value: boolean) {
      muted = value;
      if (muted) {
        manualCommitPending = false;
        // Keep the one utterance already finished before mute. Any utterance
        // beginning during mute is still ignored by the item-ID routing below.
        if (!latest?.ended || latest.delivered) latest = undefined;
        handlers.onPartial("");
      }
    },
    close() {
      closed = true;
      known.clear();
      latest = undefined;
    },
    receive(event: RealtimeEvent) {
      if (closed) return;
      const id = typeof event.item_id === "string" ? event.item_id : "";
      if (event.type === "error") {
        if (event.error?.code !== "input_audio_buffer_commit_empty")
          handlers.onError(
            new Error(
              translate(
                "A conexão de voz encontrou um problema. Toque em tentar novamente.",
              ),
            ),
          );
        return;
      }
      if (!id) return;
      if (event.type === "input_audio_buffer.speech_started") {
        if (known.has(id)) return;
        if (muted) {
          remember(id);
          return;
        }
        begin(id);
        return;
      }
      if (event.type === "input_audio_buffer.committed" && !known.has(id)) {
        // Manual commit can produce an item without VAD speech_started. A commit
        // linked to an older predecessor must not replace a newer active utterance.
        if (
          muted ||
          (!manualCommitPending &&
            latest &&
            event.previous_item_id !== latest.id)
        ) {
          remember(id);
          return;
        }
        begin(id);
      }
      if (event.type === "input_audio_buffer.committed")
        manualCommitPending = false;
      if (latest?.id !== id || latest.delivered || (muted && !latest.ended))
        return;
      if (
        event.type === "input_audio_buffer.speech_stopped" ||
        event.type === "input_audio_buffer.committed"
      ) {
        if (!latest.ended) {
          latest.ended = true;
          handlers.onSpeechEnd();
        }
        return;
      }
      if (
        event.type === "conversation.item.input_audio_transcription.delta" &&
        !muted &&
        typeof event.delta === "string"
      ) {
        latest.partial = (latest.partial + event.delta).slice(0, 4000);
        handlers.onPartial(latest.partial);
      } else if (
        event.type === "conversation.item.input_audio_transcription.completed"
      ) {
        latest.delivered = true;
        latest.partial = "";
        if (typeof event.transcript !== "string") {
          handlers.onError(
            new Error(
              translate(
                "Recebi uma transcrição inválida. Toque em tentar novamente.",
              ),
            ),
          );
        } else handlers.onTranscript(event.transcript.trim());
      } else if (
        event.type === "conversation.item.input_audio_transcription.failed"
      ) {
        latest.delivered = true;
        latest.partial = "";
        handlers.onError(
          new Error(
            translate(
              "Não consegui entender esse trecho. Toque em tentar novamente.",
            ),
          ),
        );
      }
    },
  };
}

const aborted = () =>
  new DOMException(translate("Conversa encerrada"), "AbortError");

/** Continuous microphone transport, with echo cancellation and provider-side VAD. */
export async function connectRealtimeInput(
  handlers: LiveInputHandlers,
  signal: AbortSignal,
): Promise<LiveInput> {
  let stream: MediaStream | undefined, peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let gate: Awaited<ReturnType<typeof createSpeechGate>> | undefined;
  let closed = false,
    muted = false,
    ready = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectReady: (error: Error) => void = () => {};
  const trackListeners = new Map<MediaStreamTrack, () => void>();
  const router = createTranscriptionEvents({
    ...handlers,
    onSpeechEnd: () => {
      clearFinishTimer();
      handlers.onSpeechEnd();
    },
    onTranscript: (text) => {
      clearFinishTimer();
      handlers.onTranscript(text);
    },
    onError: (error) => fail(error),
  });
  function clearFinishTimer() {
    clearTimeout(finishTimer);
    finishTimer = undefined;
  }
  const localAbort = new AbortController();
  const close = () => {
    if (closed) return;
    closed = true;
    localAbort.abort();
    router.close();
    clearTimeout(startupTimer);
    clearTimeout(disconnectTimer);
    clearFinishTimer();
    signal.removeEventListener("abort", onAbort);
    for (const [track, listener] of trackListeners)
      track.removeEventListener("ended", listener);
    trackListeners.clear();
    gate?.close();
    stream?.getTracks().forEach((track) => track.stop());
    if (channel) {
      channel.onmessage = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.close();
    }
    if (peer) {
      peer.onconnectionstatechange = null;
      peer.close();
    }
    handlers.onLevel(0);
  };
  const onAbort = () => {
    rejectReady(aborted());
    close();
  };
  const fail = (error: Error) => {
    if (closed) return;
    if (!ready) rejectReady(error);
    else handlers.onError(error);
    close();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) {
    close();
    throw aborted();
  }
  const connected = new Promise<void>((resolve, reject) => {
    rejectReady = reject;
    startupTimer = setTimeout(
      () =>
        fail(
          new Error(
            translate(
              "A conexão de voz demorou demais. Confira a internet e tente novamente.",
            ),
          ),
        ),
      25000,
    );
    // Resolve only once the service has confirmed a session, not just microphone access.
    const initialize = async () => {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof RTCPeerConnection === "undefined"
      )
        throw new Error(
          translate(
            "Atualize o Android System WebView para usar a conversa ao vivo.",
          ),
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (closed || signal.aborted) {
        media.getTracks().forEach((track) => track.stop());
        throw aborted();
      }
      stream = media;
      // Send only model-confirmed voice. Silence at this boundary allows the
      // service to close the turn even when background noise continues locally.
      const filtered = await createSpeechGate(
        media,
        {
          onLevel: (level) => {
            if (!closed) handlers.onLevel(muted ? 0 : level);
          },
          onError: fail,
        },
        localAbort.signal,
      );
      if (closed) {
        filtered.close();
        throw aborted();
      }
      gate = filtered;
      peer = new RTCPeerConnection();
      for (const track of gate.stream.getAudioTracks())
        peer.addTrack(track, gate.stream);
      for (const track of media.getAudioTracks()) {
        const ended = () =>
          fail(
            new Error(
              translate(
                "O microfone foi desconectado. Toque em tentar novamente.",
              ),
            ),
          );
        trackListeners.set(track, ended);
        track.addEventListener("ended", ended);
      }
      peer.onconnectionstatechange = () => {
        if (closed) return;
        clearTimeout(disconnectTimer);
        if (
          peer?.connectionState === "failed" ||
          peer?.connectionState === "closed"
        )
          fail(
            new Error(
              translate("A conexão de voz caiu. Toque em tentar novamente."),
            ),
          );
        else if (peer?.connectionState === "disconnected")
          disconnectTimer = setTimeout(
            () =>
              fail(
                new Error(
                  translate(
                    "A conexão de voz foi perdida. Toque em tentar novamente.",
                  ),
                ),
              ),
            5000,
          );
      };
      channel = peer.createDataChannel("oai-events");
      channel.onmessage = ({ data }) => {
        if (closed || typeof data !== "string") return;
        try {
          const event = JSON.parse(data) as RealtimeEvent;
          if (
            event.type === "session.created" ||
            event.type === "transcription_session.created"
          ) {
            ready = true;
            clearTimeout(startupTimer);
            resolve();
          } else router.receive(event);
        } catch {
          fail(
            new Error(
              translate(
                "Recebi uma resposta de voz inválida. Tente novamente.",
              ),
            ),
          );
        }
      };
      channel.onclose = () => {
        if (!closed)
          fail(
            new Error(
              translate(
                "A conversa perdeu a conexão. Toque em tentar novamente.",
              ),
            ),
          );
      };
      channel.onerror = () =>
        fail(
          new Error(
            translate(
              "Não foi possível manter a conexão de voz. Tente novamente.",
            ),
          ),
        );
      const offer = await peer.createOffer();
      if (closed) throw aborted();
      await peer.setLocalDescription(offer);
      const token = await createTranscriptionSession(localAbort.signal);
      if (closed) throw aborted();
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        signal: localAbort.signal,
        headers: {
          Authorization: `Bearer ${token.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        body: peer.localDescription?.sdp || offer.sdp,
      });
      // The short-lived credential stays in memory and is never logged or persisted.
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? translate(
                "A chave precisa de acesso à conversa em tempo real. Revise as permissões e tente novamente.",
              )
            : translate(
                "Não foi possível conectar a conversa de voz. Confira a internet e tente novamente.",
              ),
        );
      const sdp = await response.text();
      if (closed) throw aborted();
      await peer.setRemoteDescription({ type: "answer", sdp });
    };
    void initialize().catch((error) => {
      const name = error instanceof Error ? error.name : "";
      const explanation =
        name === "NotAllowedError"
          ? translate(
              "Permita o acesso ao microfone nas configurações do OncoFlow e tente novamente.",
            )
          : name === "NotFoundError"
            ? translate(
                "Não encontrei um microfone disponível. Confira o dispositivo e tente novamente.",
              )
            : name === "NotReadableError"
              ? translate(
                  "Não consegui acessar o microfone. Feche outra chamada ou gravação e tente novamente.",
                )
              : name === "TypeError"
                ? translate(
                    "Não consegui conectar a voz. Confira sua internet e tente novamente.",
                  )
                : "";
      fail(
        explanation
          ? new Error(explanation)
          : error instanceof Error
            ? error
            : new Error(translate("Não foi possível conectar o microfone.")),
      );
    });
  });
  try {
    await connected;
  } catch (error) {
    close();
    throw error;
  }
  return {
    setMuted(value) {
      if (closed || muted === value) return;
      muted = value;
      router.setMuted(value);
      gate?.setMuted(value);
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = !value;
      });
      if (value) {
        clearFinishTimer();
        handlers.onLevel(0);
        if (channel?.readyState === "open" && !router.hasPendingTranscript()) {
          try {
            channel.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
          } catch {
            fail(
              new Error(
                translate(
                  "A conversa perdeu a conexão. Toque em tentar novamente.",
                ),
              ),
            );
          }
        }
      }
    },
    finishTurn() {
      if (
        closed ||
        muted ||
        channel?.readyState !== "open" ||
        finishTimer !== undefined
      )
        return;
      // A manual finish must include the word ending still in the local delay.
      // Natural VAD completion, mute or close cancels this pending fallback.
      finishTimer = setTimeout(() => {
        finishTimer = undefined;
        if (closed || muted || channel?.readyState !== "open") return;
        try {
          router.expectManualCommit();
          channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } catch {
          fail(
            new Error(
              translate(
                "A conversa perdeu a conexão. Toque em tentar novamente.",
              ),
            ),
          );
        }
      }, SPEECH_GATE_SETTINGS.delayMs + 100);
    },
    close,
  };
}
