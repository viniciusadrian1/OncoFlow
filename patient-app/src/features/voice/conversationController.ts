import { translate } from "../../i18n";
import type { CapturedAudio } from "./capture";

export type ConversationState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export type ConversationDependencies = {
  listen(
    onAudio: (audio: CapturedAudio) => void,
    onError: (error: Error) => void,
  ): Promise<void>;
  /** Releases only microphone capture; it must not cancel an answer already playing. */
  cancelListen(): Promise<void>;
  /** Optional awaited native network cancellation, used only on stop/interrupt/failure. */
  cancelRequests?(): Promise<void>;
  transcribe(audio: CapturedAudio, signal: AbortSignal): Promise<string>;
  respond(text: string, signal: AbortSignal): Promise<{ text: string }>;
  /** Resolves after playback ends, not when synthesis or playback starts. */
  speak(text: string, signal: AbortSignal): Promise<void>;
  stopSpeaking(): void;
  onState(state: ConversationState, detail?: string): void;
  onUserText(text: string): void;
  onAssistantText(text: string): void;
  onError(error: Error): void;
};
export type ConversationController = {
  start(): Promise<void>;
  stop(): Promise<void>;
  interrupt(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  isMuted(): boolean;
  isActive(): boolean;
};

type Phase = "idle" | "opening" | "listening" | "working" | "retry" | "muted";

/** Foreground, one bounded microphone turn at a time; mute never stops Lia's answer. */
export function createConversationController(
  deps: ConversationDependencies,
): ConversationController {
  let active = false;
  let muted = false;
  let generation = 0;
  let turn = 0;
  let listenRevision = 0;
  let muteRevision = 0;
  let phase: Phase = "idle";
  let abort: AbortController | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let cleanup: Promise<void> = Promise.resolve();

  const isCurrent = (session: number, currentTurn?: number) =>
    active &&
    session === generation &&
    (currentTurn === undefined || currentTurn === turn);
  const asError = (error: unknown) =>
    error instanceof Error
      ? error
      : new Error(
          translate("Não foi possível continuar a conversa. Tente novamente."),
        );
  function clearRetry() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  function cancelListening(includeRequests = false): Promise<void> {
    const operation = cleanup.then(async () => {
      await deps.cancelListen();
      if (includeRequests) await deps.cancelRequests?.();
    });
    cleanup = operation.catch(() => {});
    return operation;
  }
  function stopWork() {
    clearRetry();
    abort?.abort();
    abort = undefined;
    deps.stopSpeaking();
  }
  async function fail(error: Error, session: number, currentTurn: number) {
    if (!isCurrent(session, currentTurn)) return;
    active = false;
    phase = "idle";
    const stopped = ++generation;
    ++listenRevision;
    stopWork();
    await cancelListening(true).catch(() => {});
    if (generation !== stopped || active) return;
    deps.onState("error", error.message);
    deps.onError(error);
  }
  function showMuted() {
    phase = "muted";
    deps.onState("muted");
  }
  async function silence(session: number, currentTurn: number) {
    if (!isCurrent(session, currentTurn)) return;
    phase = "retry";
    try {
      await cancelListening();
      if (!isCurrent(session, currentTurn)) return;
      if (muted) {
        showMuted();
        return;
      }
      clearRetry();
      // Silence never becomes a provider call. The small backoff also avoids a
      // busy loop if a device reports NO_SPEECH before the normal capture limit.
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!isCurrent(session, currentTurn) || muted) return;
        phase = "idle";
        void listen(session);
      }, 200);
    } catch (error) {
      await fail(asError(error), session, currentTurn);
    }
  }
  async function problem(error: Error, session: number, currentTurn: number) {
    if (!isCurrent(session, currentTurn)) return;
    if ((error as Error & { code?: string }).code === "NO_SPEECH")
      await silence(session, currentTurn);
    else await fail(error, session, currentTurn);
  }
  async function processAudio(
    audio: CapturedAudio,
    session: number,
    currentTurn: number,
  ) {
    if (!isCurrent(session, currentTurn)) return;
    try {
      await cancelListening();
      if (!isCurrent(session, currentTurn)) return;
      const controller = new AbortController();
      abort = controller;
      deps.onState("transcribing");
      const text = (await deps.transcribe(audio, controller.signal)).trim();
      if (!isCurrent(session, currentTurn)) return;
      if (!text) {
        abort = undefined;
        await silence(session, currentTurn);
        return;
      }
      deps.onUserText(text);
      if (!isCurrent(session, currentTurn)) return;
      deps.onState("thinking");
      const response = await deps.respond(text, controller.signal);
      if (!isCurrent(session, currentTurn)) return;
      const answer = response.text.trim();
      if (!answer)
        throw new Error(
          translate(
            "A Lia não concluiu a resposta. Inicie a conversa novamente.",
          ),
        );
      deps.onAssistantText(answer);
      if (!isCurrent(session, currentTurn)) return;
      deps.onState("speaking");
      await deps.speak(answer, controller.signal);
      if (!isCurrent(session, currentTurn)) return;
      abort = undefined;
      phase = "idle";
      if (muted) showMuted();
      else await listen(session);
    } catch (error) {
      await problem(asError(error), session, currentTurn);
    }
  }
  async function listen(session: number): Promise<void> {
    if (
      !isCurrent(session) ||
      phase === "opening" ||
      phase === "listening" ||
      phase === "working"
    )
      return;
    const opening = ++listenRevision;
    phase = "opening";
    await cleanup;
    if (!isCurrent(session) || opening !== listenRevision) return;
    if (muted) {
      showMuted();
      return;
    }
    const currentTurn = ++turn;
    let delivered = false;
    deps.onState("idle", translate("Preparando o microfone…"));
    try {
      await deps.listen(
        (audio) => {
          if (
            delivered ||
            muted ||
            !isCurrent(session, currentTurn) ||
            opening !== listenRevision
          )
            return;
          delivered = true;
          // Once capture has completed, muting only applies to the next turn;
          // the already accepted transcript/answer is allowed to finish.
          phase = "working";
          void processAudio(audio, session, currentTurn);
        },
        (error) => {
          if (
            delivered ||
            muted ||
            !isCurrent(session, currentTurn) ||
            opening !== listenRevision
          )
            return;
          delivered = true;
          phase = "working";
          void problem(error, session, currentTurn);
        },
      );
      if (
        !delivered &&
        !muted &&
        isCurrent(session, currentTurn) &&
        opening === listenRevision
      ) {
        phase = "listening";
        deps.onState("listening");
      }
    } catch (error) {
      if (
        !delivered &&
        !muted &&
        isCurrent(session, currentTurn) &&
        opening === listenRevision
      ) {
        delivered = true;
        phase = "working";
        await problem(asError(error), session, currentTurn);
      }
    }
  }

  return {
    async start() {
      if (active) return;
      active = true;
      muted = false;
      phase = "idle";
      ++muteRevision;
      const session = ++generation;
      await listen(session);
    },
    async stop() {
      active = false;
      phase = "idle";
      muted = false;
      ++generation;
      ++listenRevision;
      ++muteRevision;
      stopWork();
      deps.onState("idle");
      await cancelListening(true).catch(() => {});
    },
    async interrupt() {
      if (!active) return;
      const session = ++generation;
      ++listenRevision;
      ++muteRevision;
      muted = false;
      phase = "idle";
      stopWork();
      try {
        await cancelListening(true);
        if (isCurrent(session)) await listen(session);
      } catch (error) {
        await fail(asError(error), session, turn);
      }
    },
    async setMuted(value: boolean) {
      if (!active) return;
      if (muted === value) {
        await cleanup;
        return;
      }
      muted = value;
      const change = ++muteRevision;
      const session = generation;
      // Never interrupt an answer that is already being generated or spoken.
      // Its completion consults the latest mute setting before listening again.
      if (phase === "working") return;
      clearRetry();
      if (value) {
        ++turn;
        ++listenRevision;
        phase = "muted";
        try {
          await cancelListening();
          if (isCurrent(session) && muted && change === muteRevision)
            showMuted();
        } catch (error) {
          await fail(asError(error), session, turn);
        }
      } else {
        await cleanup;
        if (isCurrent(session) && !muted && change === muteRevision) {
          phase = "idle";
          await listen(session);
        }
      }
    },
    isMuted: () => muted,
    isActive: () => active,
  };
}
