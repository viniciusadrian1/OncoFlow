import { translate } from "../../i18n";
import type { LiveInput, LiveInputHandlers } from "./realtimeTranscription";
import type { ConversationState } from "./conversationController";

type Dependencies = {
  connect(handlers: LiveInputHandlers, signal: AbortSignal): Promise<LiveInput>;
  respond(text: string, signal: AbortSignal): Promise<{ text: string }>;
  speak(text: string, signal: AbortSignal): Promise<void>;
  stopSpeaking(): void;
  cancelRequests(): Promise<void>;
  onState(state: ConversationState): void;
  onUserText(text: string): void;
  onAssistantText(text: string): void;
  onPartial(text: string): void;
  onLevel(level: number): void;
  onError(error: Error): void;
  greeting?: string;
};
export type LiveConversationController = {
  start(): Promise<void>;
  stop(): Promise<void>;
  interrupt(): Promise<void>;
  setMuted(value: boolean): Promise<void>;
  finishTurn(): void;
  submitAction(
    label: string,
    respond: (signal: AbortSignal) => Promise<{ text: string }>,
  ): void;
  isActive(): boolean;
  isMuted(): boolean;
};

/** Keep input alive during output. A new speech-start cancels the answer immediately. */
export function createLiveConversationController(
  deps: Dependencies,
): LiveConversationController {
  let active = false,
    muted = false,
    generation = 0,
    revision = 0;
  let state: ConversationState = "idle";
  let awaitingMutedTranscript = false;
  let input: LiveInput | undefined,
    lifetime: AbortController | undefined,
    response: AbortController | undefined;
  let cleanup = Promise.resolve();
  let speechTimer: ReturnType<typeof setTimeout> | undefined;
  let transcriptionTimer: ReturnType<typeof setTimeout> | undefined;
  let stageTimer: ReturnType<typeof setTimeout> | undefined;
  let connectionTimer: ReturnType<typeof setTimeout> | undefined;
  const current = (session: number, turn?: number) =>
    active &&
    session === generation &&
    (turn === undefined || turn === revision);
  const emit = (value: ConversationState) => {
    state = value;
    deps.onState(value);
  };
  const asError = (error: unknown) =>
    error instanceof Error
      ? error
      : new Error(
          translate("Não foi possível continuar a conversa. Tente novamente."),
        );
  function clearWorkTimers() {
    awaitingMutedTranscript = false;
    clearTimeout(speechTimer);
    clearTimeout(transcriptionTimer);
    clearTimeout(stageTimer);
    speechTimer = undefined;
    transcriptionTimer = undefined;
    stageTimer = undefined;
  }
  function cancelResponse() {
    ++revision;
    clearWorkTimers();
    response?.abort();
    response = undefined;
    deps.stopSpeaking();
    // Native cancellation normally resolves immediately. A broken bridge must not
    // leave every subsequent turn waiting forever behind its cancellation promise.
    cleanup = cleanup.then(
      () =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 3000);
          const finish = () => {
            clearTimeout(timer);
            resolve();
          };
          Promise.resolve()
            .then(() => deps.cancelRequests())
            .then(finish, finish);
        }),
    );
    return cleanup;
  }
  function closeInput() {
    clearTimeout(connectionTimer);
    connectionTimer = undefined;
    lifetime?.abort();
    lifetime = undefined;
    input?.close();
    input = undefined;
    deps.onLevel(0);
    deps.onPartial("");
  }
  function fail(error: Error, session: number, turn?: number) {
    if (!current(session, turn)) return;
    ++generation; // Reject every callback from this transport, even if close is late.
    void cancelResponse();
    muted = true;
    closeInput();
    // Active describes the open call UI. Keep it visible so its Retry can call start().
    emit("error");
    deps.onError(error);
  }
  function guardStage(
    session: number,
    turn: number,
    label: string,
    milliseconds = 25000,
  ) {
    clearTimeout(stageTimer);
    stageTimer = setTimeout(
      () =>
        fail(
          new Error(
            translate("{label} demorou demais. Toque em tentar novamente.", {
              label,
            }),
          ),
          session,
          turn,
        ),
      milliseconds,
    );
  }
  function waitForTranscript(session: number, turn: number) {
    clearTimeout(speechTimer);
    speechTimer = undefined;
    if (!current(session, turn) || muted || transcriptionTimer !== undefined)
      return;
    emit("transcribing");
    transcriptionTimer = setTimeout(
      () =>
        fail(
          new Error(
            translate(
              "Não consegui concluir a transcrição. Toque em tentar novamente.",
            ),
          ),
          session,
          turn,
        ),
      15000,
    );
  }
  async function answer(
    text: string,
    session: number,
    greeting = false,
    action?: (signal: AbortSignal) => Promise<{ text: string }>,
  ) {
    if (!current(session)) return;
    const pending = cancelResponse();
    const turn = revision;
    if (!greeting) deps.onUserText(text);
    if (!current(session, turn)) return;
    deps.onPartial("");
    emit("thinking");
    guardStage(session, turn, translate("A resposta da Lia"));
    try {
      await pending;
      if (!current(session, turn)) return;
      const abort = new AbortController();
      response = abort;
      const result = greeting
        ? { text }
        : await (action
            ? action(abort.signal)
            : deps.respond(text, abort.signal));
      if (!current(session, turn)) return;
      if (!result.text.trim())
        throw new Error(
          translate(
            "A Lia não concluiu a resposta. Toque em tentar novamente.",
          ),
        );
      deps.onAssistantText(result.text);
      if (!current(session, turn)) return;
      emit("speaking");
      guardStage(session, turn, translate("A voz da Lia"), 60000);
      await deps.speak(result.text, abort.signal);
      if (!current(session, turn)) return;
      clearWorkTimers();
      response = undefined;
      emit(muted ? "muted" : "listening");
    } catch (error) {
      if (current(session, turn)) fail(asError(error), session, turn);
    }
  }
  return {
    async start() {
      if (active && state !== "error") return;
      active = true;
      muted = false;
      const session = ++generation,
        openingRevision = revision;
      const opening = new AbortController();
      lifetime = opening;
      emit("idle");
      connectionTimer = setTimeout(
        () =>
          fail(
            new Error(
              translate(
                "A conexão de voz demorou demais. Toque em tentar novamente.",
              ),
            ),
            session,
          ),
        30000,
      );
      try {
        await cleanup;
        if (!current(session)) return;
        const connecting = deps
          .connect(
            {
              onSpeechStart() {
                if (!current(session) || muted) return;
                void cancelResponse();
                deps.onPartial("");
                emit("listening");
                const turn = revision;
                // Recover once if continuous noise prevents server VAD from
                // ending this utterance. Never periodically commit background noise.
                speechTimer = setTimeout(() => {
                  speechTimer = undefined;
                  if (!current(session, turn) || muted) return;
                  waitForTranscript(session, turn);
                  if (!current(session, turn) || muted) return;
                  try {
                    input?.finishTurn();
                  } catch (error) {
                    fail(asError(error), session, turn);
                  }
                }, 25000);
              },
              onSpeechEnd() {
                if (!current(session) || muted) return;
                waitForTranscript(session, revision);
              },
              onTranscript(text) {
                if (!current(session) || (muted && !awaitingMutedTranscript))
                  return;
                awaitingMutedTranscript = false;
                clearTimeout(speechTimer);
                speechTimer = undefined;
                clearTimeout(transcriptionTimer);
                transcriptionTimer = undefined;
                if (!text.trim()) {
                  emit(muted ? "muted" : "listening");
                  return;
                }
                void answer(text.trim(), session);
              },
              onPartial(text) {
                if (current(session) && !muted) deps.onPartial(text);
              },
              onLevel(level) {
                if (current(session)) deps.onLevel(muted ? 0 : level);
              },
              onError(error) {
                fail(error, session);
              },
            },
            opening.signal,
          )
          .then((connection) => {
            if (!current(session)) {
              connection.close();
              throw new DOMException(
                translate("Conversa encerrada"),
                "AbortError",
              );
            }
            return connection;
          });
        const connection = await new Promise<LiveInput>((resolve, reject) => {
          const aborted = () =>
            reject(
              new DOMException(translate("Conversa encerrada"), "AbortError"),
            );
          opening.signal.addEventListener("abort", aborted, { once: true });
          if (opening.signal.aborted) aborted();
          connecting
            .then(resolve, reject)
            .finally(() =>
              opening.signal.removeEventListener("abort", aborted),
            );
        });
        if (!current(session)) {
          connection.close();
          return;
        }
        clearTimeout(connectionTimer);
        connectionTimer = undefined;
        input = connection;
        input.setMuted(muted);
        if (!current(session)) return;
        if (state === "idle") emit(muted ? "muted" : "listening");
        if (deps.greeting && !muted && revision === openingRevision)
          void answer(deps.greeting, session, true);
      } catch (error) {
        if (current(session)) fail(asError(error), session);
      }
    },
    async stop() {
      active = false;
      muted = false;
      ++generation;
      closeInput();
      const pending = cancelResponse();
      emit("idle");
      await pending;
    },
    async interrupt() {
      if (!active || state === "error") return;
      const session = generation;
      muted = false;
      input?.setMuted(false);
      if (!current(session)) return;
      const pending = cancelResponse();
      deps.onPartial("");
      emit(input ? "listening" : "idle");
      await pending;
    },
    async setMuted(value) {
      if (!active || state === "error" || muted === value) return;
      const session = generation;
      // This turn has already been captured. Mute affects future microphone
      // input, not its pending transcript, model request or output playback.
      if (value && state === "transcribing") awaitingMutedTranscript = true;
      muted = value;
      input?.setMuted(value);
      if (!current(session)) return;
      if (value) {
        clearTimeout(speechTimer);
        speechTimer = undefined;
        if (!awaitingMutedTranscript) {
          clearTimeout(transcriptionTimer);
          transcriptionTimer = undefined;
        }
        deps.onLevel(0);
        deps.onPartial("");
      }
      if (
        state !== "speaking" &&
        state !== "thinking" &&
        !(state === "transcribing" && awaitingMutedTranscript)
      )
        emit(value ? "muted" : input ? "listening" : "idle");
    },
    finishTurn() {
      if (active && !muted && state !== "error") input?.finishTurn();
    },
    submitAction(label, respond) {
      if (!active || state === "error" || !label.trim()) return;
      void answer(label.trim(), generation, false, respond);
    },
    isActive: () => active,
    isMuted: () => muted,
  };
}
