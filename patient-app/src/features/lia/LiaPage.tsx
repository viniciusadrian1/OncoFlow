import { translate, useI18n } from "../../i18n";
import { useEffect, useRef, useState } from "react";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
  ArrowRight,
  CalendarDays,
  Check,
  FileText,
  Mic,
  Phone,
  Route,
  Send,
  Square,
  Volume2,
  X,
} from "lucide-react";
import type {
  Appointment,
  DemoContext,
  DemoDocument,
  JourneyEvent,
  Persona,
  Preferences,
} from "../../../shared/contracts";
import {
  chatWithLia,
  transcribeAudio,
  synthesizeSpeech,
  providerStatus,
  cancelProvider,
  type LiaIntent,
} from "../../adapters/liaProvider";
import {
  startCapture,
  stopCapture,
  cancelCapture,
  type CapturedAudio,
} from "../voice/capture";
import { SafetyDemo, type SafetyDemoHandle } from "../safety/SafetyDemo";
import {
  checkConnectedSymptoms,
  type ConnectedSymptomInput,
  type ConnectedSymptomOutcome,
} from "../safety/connectedSymptoms";
import { ConnectedSymptomStatus } from "../safety/ConnectedSymptomStatus";
import {
  createLiveConversationController,
  type LiveConversationController,
} from "../voice/liveConversationController";
import { connectRealtimeInput } from "../voice/realtimeTranscription";
import { createPlaybackSession } from "../voice/playback";
import { VoiceConversation } from "./VoiceConversation";
import { LiaActionConfirmation } from "./LiaActionConfirmation";
import { LiaCallDock } from "./LiaCallDock";
import { buildLiaContext, createLiaActionSession } from "./actions";
import type {
  LiaAppBridge,
  LiaExecution,
  PendingLiaAction,
} from "../../../shared/liaActions";
import "./lia.css";

type Destination = "agenda" | "journey" | "documents" | "checkin";
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  intent?: LiaIntent;
};
type Stage =
  | "idle"
  | "permission"
  | "listening"
  | "transcribing"
  | "processing"
  | "synthesizing"
  | "speaking"
  | "muted"
  | "error";
type Props = {
  active: boolean;
  context: DemoContext;
  persona: Persona;
  prefs: Preferences;
  appointments: Appointment[];
  journey: JourneyEvent[];
  documents: DemoDocument[];
  onNavigate(to: Destination): void;
  onContact(): void;
  appBridge: LiaAppBridge;
  startRequest: number;
  onShowApp?(): void;
  onCallActiveChange?(active: boolean): void;
};
const CONSENT_KEY = "oncoflow-lia-consent-v1";
function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY) === "accepted";
  } catch {
    return false;
  }
}
const labels: Record<Stage, string> = {
  idle: "Pronta para conversar",
  permission: "Aguardando permissão do microfone…",
  listening: "Ouvindo você · até 30 segundos",
  transcribing: "Transcrevendo sua fala…",
  processing: "Lia está preparando a resposta…",
  synthesizing: "Preparando a voz…",
  speaking: "Lia está falando",
  muted: "Microfone silenciado",
  error: "A conversa precisa reconectar",
};

export function LiaPage({
  active,
  context,
  persona,
  prefs,
  appointments,
  journey,
  documents,
  onNavigate,
  onContact,
  appBridge,
  startRequest,
  onShowApp,
  onCallActiveChange,
}: Props) {
  const { locale } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [draftSource, setDraftSource] = useState<"text" | "provider">("text");
  const [consent, setConsent] = useState(hasConsent);
  const [configured, setConfigured] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [voiceWarning, setVoiceWarning] = useState("");
  const [voice, setVoice] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [callActive, setCallActive] = useState(false);
  const [callMuted, setCallMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingLiaAction | null>(
    null,
  );
  const [waitingToStart, setWaitingToStart] = useState(false);
  const [symptomNotice, setSymptomNotice] = useState<{
    input: ConnectedSymptomInput;
    outcome: Exclude<ConnectedSymptomOutcome, { kind: "not_applicable" }>;
  } | null>(null);
  const [retryingReport, setRetryingReport] = useState(false);
  const requestedStart = useRef(false);
  const seenStartRequest = useRef(startRequest);
  const latest = useRef({
    appBridge,
    prefs,
    persona,
    onShowApp,
    onCallActiveChange,
  });
  latest.current = { appBridge, prefs, persona, onShowApp, onCallActiveChange };
  const actions = useRef<ReturnType<typeof createLiaActionSession> | null>(
    null,
  );
  if (!actions.current)
    actions.current = createLiaActionSession({
      getSnapshot: () => latest.current.appBridge.getSnapshot(),
      execute: (action, operationId, expectedContext, signal) =>
        latest.current.appBridge.execute(
          action,
          operationId,
          expectedContext,
          signal,
        ),
    });
  const conversation = useRef<LiveConversationController | null>(null);
  const stoppingConversation = useRef<Promise<void>>(Promise.resolve());
  const startingCall = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const job = useRef(0),
    sequence = useRef(0),
    busy = useRef(false),
    live = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const playback = useRef<ReturnType<typeof createPlaybackSession> | null>(
    null,
  );
  const outputLevel = useRef(0);
  const inputLevel = useRef(0);
  const playbackStarted = useRef(false);
  const draftField = useRef<HTMLTextAreaElement | null>(null);
  const safety = useRef<SafetyDemoHandle>(null);

  function stopPlayback() {
    const previous = playback.current;
    playback.current = null;
    playbackStarted.current = false;
    outputLevel.current = 0;
    previous?.stop();
  }
  function interrupt(update = true) {
    actions.current?.clear();
    requestedStart.current = false;
    const previousCall = conversation.current;
    conversation.current = null;
    if (previousCall) stoppingConversation.current = previousCall.stop();
    ++job.current;
    abort.current?.abort();
    abort.current = null;
    stopPlayback();
    void cancelCapture().catch(() => {});
    void cancelProvider().catch(() => {});
    busy.current = false;
    if (update && live.current) {
      setPendingAction(null);
      setWaitingToStart(false);
      setMinimized(false);
      setCallActive(false);
      setCallMuted(false);
      setLiveTranscript("");
      inputLevel.current = 0;
      setStage("idle");
      setSeconds(0);
    }
  }

  async function speakDuringCall(text: string, signal: AbortSignal) {
    try {
      setStage("synthesizing");
      const blob = await synthesizeSpeech(
        text,
        latest.current.appBridge.getSnapshot().prefs.speechRate,
        signal,
      );
      if (signal.aborted)
        throw new DOMException(translate("Conversa encerrada"), "AbortError");
      const session = createPlaybackSession(blob, {
        signal,
        onStarted: () => {
          if (playback.current === session && !signal.aborted && live.current) {
            playbackStarted.current = true;
            setStage("speaking");
          }
        },
        onLevel: (level) => {
          if (playback.current === session) outputLevel.current = level;
        },
      });
      playback.current = session;
      try {
        await session.play();
      } finally {
        if (playback.current === session) {
          playback.current = null;
          playbackStarted.current = false;
          outputLevel.current = 0;
        }
      }
      setVoiceWarning("");
    } catch (error) {
      if (signal.aborted || !live.current) throw error;
      // Losing TTS must not stop microphone transcription or the safety route.
      setVoiceWarning(
        locale === "en-US"
          ? "Voice playback is unavailable. You can keep speaking; Lia will show her replies in writing."
          : "A reprodução da voz está indisponível. Você pode continuar falando; a Lia mostrará as respostas por escrito.",
      );
      setMinimized(false);
    }
  }

  function applyExecution(result: LiaExecution) {
    setPendingAction(actions.current?.pending() ?? null);
    if (result.showApp && conversation.current?.isActive()) setMinimized(true);
    return { text: result.text, intent: "other" as LiaIntent };
  }
  async function reviewConnectedSymptoms(
    input: ConnectedSymptomInput,
    signal: AbortSignal,
  ) {
    const bridge = latest.current.appBridge;
    const before = bridge.getSnapshot();
    if (!before.connected || !bridge.reportSymptoms) return null;
    const result = await checkConnectedSymptoms({
      report: bridge.reportSymptoms,
      input,
      signal,
    });
    const now = latest.current.appBridge.getSnapshot().context;
    if (
      signal.aborted ||
      !live.current ||
      before.context.sessionId !== now.sessionId ||
      before.context.epoch !== now.epoch ||
      before.context.personaId !== now.personaId
    )
      throw new DOMException(translate("Conversa encerrada"), "AbortError");
    if (result.kind === "not_applicable") return null;
    actions.current?.clear();
    setPendingAction(null);
    setSymptomNotice({ input, outcome: result });
    return { text: result.text, intent: "safety" as LiaIntent };
  }
  async function retrySymptomReport() {
    const previous = symptomNotice;
    if (
      !previous ||
      previous.outcome.kind !== "unconfirmed" ||
      retryingReport ||
      (busy.current && !callActive)
    )
      return;
    setRetryingReport(true);
    const run = async (signal: AbortSignal) => {
      try {
        const result = await reviewConnectedSymptoms(previous.input, signal);
        if (result) return result;
        setSymptomNotice(null);
        return {
          text:
            locale === "en-US"
              ? "The service did not register an attention signal for this message. If you need assessment, contact your care team."
              : "O serviço não registrou um sinal de atenção para esta mensagem. Se você precisa de avaliação, entre em contato com sua equipe.",
          intent: "safety" as LiaIntent,
        };
      } finally {
        if (live.current) setRetryingReport(false);
      }
    };
    const call = conversation.current;
    if (call?.isActive()) {
      call.submitAction(
        locale === "en-US"
          ? "Retry sending report"
          : "Tentar enviar relato novamente",
        run,
      );
      return;
    }
    const id = ++job.current;
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    busy.current = true;
    setStage("processing");
    try {
      const result = await run(controller.signal);
      if (!isCurrent(id)) return;
      setMessages((m) => [
        ...m,
        {
          id: ++sequence.current,
          role: "assistant",
          text: result.text,
          intent: result.intent,
        },
      ]);
      busy.current = false;
      setStage("idle");
      if (voice) await speak(result.text, id);
    } catch (error) {
      failure(error, id);
    }
  }
  async function respondWithActions(
    text: string,
    history: { role: "user" | "assistant"; text: string }[],
    signal: AbortSignal,
    source: "text" | "provider",
    operationId: string,
  ): Promise<{ text: string; intent: LiaIntent }> {
    if (signal.aborted || !live.current)
      throw new DOMException(translate("Conversa encerrada"), "AbortError");
    const connectedResult = await reviewConnectedSymptoms(
      {
        text,
        source: source === "provider" ? "voice" : "text",
        locale,
        operationId,
      },
      signal,
    );
    if (connectedResult) return connectedResult;
    const decision =
      !latest.current.appBridge.getSnapshot().connected &&
      safety.current?.submitLiveReport(text, source, operationId);
    if (decision) {
      actions.current?.clear();
      setPendingAction(null);
      return { text: decision.text, intent: "safety" };
    }
    const local = await actions.current!.handleInput(text, signal);
    if (signal.aborted || !live.current)
      throw new DOMException(translate("Conversa encerrada"), "AbortError");
    setPendingAction(actions.current!.pending());
    if (local) return applyExecution(local);
    const snapshot = latest.current.appBridge.getSnapshot();
    const result = await chatWithLia(
      {
        text,
        personaId: snapshot.context.personaId,
        explanation: snapshot.prefs.explanation,
        history,
        context: buildLiaContext(snapshot),
        locale,
        connected: !!snapshot.connected,
      },
      signal,
    );
    if (signal.aborted || !live.current)
      throw new DOMException(translate("Conversa encerrada"), "AbortError");
    if (result.action) {
      const execution = await actions.current!.propose(result.action, signal);
      if (signal.aborted || !live.current)
        throw new DOMException(translate("Conversa encerrada"), "AbortError");
      return applyExecution(execution);
    }
    return result;
  }
  function acceptConsent() {
    try {
      localStorage.setItem(CONSENT_KEY, "accepted");
    } catch {
      /* The current session still works without persistence. */
    }
    setConsent(true);
  }
  function preferText() {
    requestedStart.current = false;
    setWaitingToStart(false);
    draftField.current?.focus();
  }
  function showApp() {
    latest.current.onShowApp?.();
    setMinimized(true);
  }
  async function resolveAction(id: string, confirm: boolean) {
    const label = confirm
      ? translate("Sim, confirmar")
      : translate("Não, cancelar");
    const call = conversation.current;
    if (call?.isActive()) {
      call.submitAction(label, async (signal) =>
        applyExecution(
          confirm
            ? await actions.current!.confirm(id, signal)
            : actions.current!.cancel(id),
        ),
      );
      return;
    }
    if (busy.current || !live.current || !activeRef.current) return;
    stopPlayback();
    abort.current?.abort();
    const operation = ++job.current;
    const controller = new AbortController();
    abort.current = controller;
    busy.current = true;
    setStage("processing");
    const execution = await (confirm
      ? actions.current!.confirm(id, controller.signal)
      : actions.current!.cancel(id));
    if (!isCurrent(operation) || controller.signal.aborted) return;
    const result = applyExecution(execution);
    busy.current = false;
    setStage("idle");
    setMessages((current) => [
      ...current,
      { id: ++sequence.current, role: "user", text: label },
      {
        id: ++sequence.current,
        role: "assistant",
        text: result.text,
        intent: "other",
      },
    ]);
    if (voice) void speak(result.text, operation);
  }

  async function startConversation() {
    if (
      !consent ||
      !configured ||
      startingCall.current ||
      conversation.current?.isActive()
    )
      return;
    startingCall.current = true;
    interrupt();
    const startId = job.current;
    setError("");
    setVoiceWarning("");
    setReviewing(false);
    setDraft("");
    // Show microphone controls only after the controller can honor them.
    busy.current = true;
    setCallMuted(false);
    setVoice(true);
    setStage("permission");
    try {
      await stoppingConversation.current;
      await Promise.all([cancelCapture(), cancelProvider()]);
      if (!live.current || !activeRef.current || startId !== job.current)
        return;
      const history = messages.map((m) => ({ role: m.role, text: m.text }));
      let pendingText = "";
      let responseIntent: LiaIntent = "other";
      const controller = createLiveConversationController({
        connect: connectRealtimeInput,
        cancelRequests: cancelProvider,
        greeting: translate(
          "Oi, {name}. Sou a Lia. Posso abrir sua agenda, ler documentos ou registrar como você está. O que vamos fazer?",
          { name: latest.current.persona.firstName },
        ),
        onPartial: (text) => {
          if (conversation.current === controller && live.current)
            setLiveTranscript(text);
        },
        onLevel: (level) => {
          if (conversation.current === controller) inputLevel.current = level;
        },
        respond: async (text, signal) => {
          const result = await respondWithActions(
            text,
            history.slice(-8),
            signal,
            "provider",
            `conversation-${startId}-${++sequence.current}`,
          );
          responseIntent = result.intent;
          return result;
        },
        speak: speakDuringCall,
        stopSpeaking: stopPlayback,
        onUserText: (text) => {
          if (conversation.current !== controller || !live.current) return;
          pendingText = text;
          setMessages((m) => [
            ...m,
            { id: ++sequence.current, role: "user", text },
          ]);
        },
        onAssistantText: (text) => {
          if (conversation.current !== controller || !live.current) return;
          if (pendingText) history.push({ role: "user", text: pendingText });
          history.push({ role: "assistant", text });
          pendingText = "";
          setMessages((m) => [
            ...m,
            {
              id: ++sequence.current,
              role: "assistant",
              text,
              intent: responseIntent,
            },
          ]);
        },
        onState: (state) => {
          if (conversation.current !== controller || !live.current) return;
          const running = controller.isActive();
          setCallActive(running);
          setCallMuted(controller.isMuted());
          busy.current = running;
          setStage(
            state === "thinking"
              ? "processing"
              : state === "speaking"
                ? playbackStarted.current
                  ? "speaking"
                  : "synthesizing"
                : state === "idle" && running
                  ? "permission"
                  : state,
          );
        },
        onError: (err) => {
          if (conversation.current === controller && live.current) {
            actions.current?.clear();
            setPendingAction(null);
            setError(translate(err.message));
          }
        },
      });
      conversation.current = controller;
      setCallActive(true);
      await controller.start();
    } catch (err) {
      if (isCurrent(startId)) {
        setCallActive(false);
        failure(err, startId);
      }
    } finally {
      startingCall.current = false;
    }
  }

  function toggleCallMute() {
    if (stage === "error") return;
    const controller = conversation.current;
    if (!controller?.isActive()) return;
    const next = !controller.isMuted();
    setCallMuted(next);
    void controller.setMuted(next).catch(() => {
      if (conversation.current === controller)
        setError(
          translate(
            "Não foi possível alterar o microfone. Encerre e inicie a conversa novamente.",
          ),
        );
    });
  }
  function isCurrent(id: number) {
    return live.current && id === job.current;
  }
  function failure(err: unknown, id: number) {
    if (!isCurrent(id)) return;
    busy.current = false;
    setStage("idle");
    if (err instanceof Error && err.name === "AbortError") return;
    setError(
      err instanceof Error
        ? translate(err.message)
        : translate(
            "Não foi possível concluir. Verifique a internet e tente novamente.",
          ),
    );
  }
  useEffect(() => {
    live.current = true;
    let disposed = false;
    void providerStatus()
      .then((r) => {
        if (!disposed) setConfigured(r.configured);
      })
      .catch(() => {
        if (!disposed) setConfigured(false);
      });
    const listener = Capacitor.isNativePlatform()
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) interrupt();
        })
      : null;
    const visibility = () => {
      if (document.hidden) interrupt();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      live.current = false;
      interrupt(false);
      document.removeEventListener("visibilitychange", visibility);
      void listener?.then((l) => l.remove());
    };
  }, []);
  useEffect(() => {
    if (!active) interrupt();
  }, [active]);
  useEffect(() => {
    // Locale changes revoke pending confirmations and invalidate every in-flight turn.
    // A response in the previous language must never act or start speaking afterward.
    interrupt();
    setError("");
    setReviewing(false);
    // Keep an uncertain report and its original locale/payload for idempotent
    // retry. Changing display language must not create a second report.
    setRetryingReport(false);
  }, [locale]);
  useEffect(() => {
    latest.current.onCallActiveChange?.(callActive);
  }, [callActive]);
  useEffect(() => () => latest.current.onCallActiveChange?.(false), []);
  useEffect(() => {
    if (startRequest !== seenStartRequest.current) {
      seenStartRequest.current = startRequest;
      if (conversation.current?.isActive()) {
        requestedStart.current = false;
        setWaitingToStart(false);
        setMinimized(false);
        return;
      }
      requestedStart.current = true;
      setWaitingToStart(true);
    }
    if (
      requestedStart.current &&
      active &&
      consent &&
      configured &&
      !callActive &&
      !startingCall.current
    ) {
      requestedStart.current = false;
      setWaitingToStart(false);
      void startConversation();
    }
  }, [startRequest, active, consent, configured, callActive]);
  useEffect(() => {
    if (stage !== "listening") return;
    setSeconds(0);
    const timer = window.setInterval(
      () => setSeconds((s) => Math.min(s + 1, 30)),
      1000,
    );
    return () => clearInterval(timer);
  }, [stage]);

  async function speak(text: string, id: number) {
    if (!consent || !configured || !isCurrent(id)) return;
    stopPlayback();
    setStage("synthesizing");
    busy.current = true;
    const signal = abort.current?.signal ?? new AbortController().signal;
    try {
      const blob = await synthesizeSpeech(
        text,
        latest.current.appBridge.getSnapshot().prefs.speechRate,
        signal,
      );
      if (!isCurrent(id)) return;
      const session = createPlaybackSession(blob, {
        signal,
        onStarted: () => {
          if (isCurrent(id)) {
            playbackStarted.current = true;
            busy.current = false;
            setStage("speaking");
          }
        },
        onLevel: (level) => {
          if (playback.current === session) outputLevel.current = level;
        },
      });
      playback.current = session;
      await session.play();
      if (isCurrent(id)) {
        playback.current = null;
        playbackStarted.current = false;
        outputLevel.current = 0;
        setStage("idle");
        busy.current = false;
      }
    } catch (err) {
      if (isCurrent(id)) {
        stopPlayback();
        failure(err, id);
      }
    }
  }

  async function send() {
    const text = draft.trim();
    if (
      !text ||
      text.length > 1500 ||
      busy.current ||
      !consent ||
      (!configured && !latest.current.appBridge.getSnapshot().connected)
    )
      return;
    stopPlayback();
    setError("");
    setReviewing(false);
    busy.current = true;
    const id = ++job.current;
    const controller = new AbortController();
    abort.current = controller;
    setMessages((m) => [...m, { id: ++sequence.current, role: "user", text }]);
    setDraft("");
    setStage("processing");
    const source = draftSource;
    setDraftSource("text");
    try {
      const result = await respondWithActions(
        text,
        messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
        controller.signal,
        source,
        `chat-${id}`,
      );
      if (!isCurrent(id)) return;
      setMessages((m) => [
        ...m,
        {
          id: ++sequence.current,
          role: "assistant",
          text: result.text,
          intent: result.intent,
        },
      ]);
      busy.current = false;
      setStage("idle");
      if (voice) await speak(result.text, id);
    } catch (err) {
      failure(err, id);
      if (isCurrent(id)) setDraft(text);
    }
  }

  async function transcribe(captured: CapturedAudio, id: number) {
    if (!isCurrent(id)) return;
    setStage("transcribing");
    busy.current = true;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const result = await transcribeAudio(captured, controller.signal);
      if (!isCurrent(id)) return;
      setDraft(result.text);
      setDraftSource("provider");
      setReviewing(true);
      setStage("idle");
      busy.current = false;
      if (latest.current.appBridge.getSnapshot().connected) {
        busy.current = true;
        setStage("processing");
        const assessment = await reviewConnectedSymptoms(
          {
            text: result.text,
            source: "voice",
            locale,
            operationId: `voice-${id}`,
          },
          controller.signal,
        );
        if (!isCurrent(id)) return;
        busy.current = false;
        setStage("idle");
        if (assessment) {
          setDraft("");
          setReviewing(false);
          setMessages((m) => [
            ...m,
            { id: ++sequence.current, role: "user", text: result.text },
            {
              id: ++sequence.current,
              role: "assistant",
              text: assessment.text,
              intent: "safety",
            },
          ]);
          if (voice) void speak(assessment.text, id);
          return;
        }
      }
      const preview = latest.current.appBridge.getSnapshot().connected
        ? undefined
        : safety.current?.previewLiveReport(result.text);
      if (preview?.disposition === "urgent_care") {
        const decision = safety.current?.submitLiveReport(
          result.text,
          "provider",
          `voice-${id}`,
        );
        if (decision) {
          setMessages((m) => [
            ...m,
            {
              id: ++sequence.current,
              role: "user",
              text: translate("Transcrição para revisão: {text}", {
                text: result.text,
              }),
            },
            {
              id: ++sequence.current,
              role: "assistant",
              text: decision.text,
              intent: "safety",
            },
          ]);
          if (voice) void speak(decision.text, id);
        }
      }
      draftField.current?.focus();
    } catch (err) {
      failure(err, id);
    }
  }
  async function record() {
    if (busy.current || !consent || !configured) return;
    stopPlayback();
    setError("");
    setReviewing(false);
    busy.current = true;
    setStage("permission");
    const id = ++job.current;
    try {
      await startCapture(
        (captured) => {
          if (isCurrent(id)) void transcribe(captured, id);
        },
        (err) => failure(err, id),
      );
      if (!isCurrent(id)) {
        await cancelCapture();
        return;
      }
      setStage("listening");
    } catch (err) {
      failure(err, id);
    }
  }
  async function finishRecording() {
    if (stage !== "listening") return;
    const id = job.current;
    setStage("transcribing");
    try {
      await transcribe(await stopCapture(), id);
    } catch (err) {
      failure(err, id);
    }
  }
  function repeat(text: string) {
    if (busy.current || !consent || !configured) return;
    stopPlayback();
    setError("");
    const id = ++job.current;
    abort.current = new AbortController();
    void speak(text, id);
  }
  function showAppointment() {
    const next = appointments.find((a) => a.status === "confirmed");
    const date = next
      ? new Intl.DateTimeFormat(locale, {
          day: "2-digit",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        }).format(new Date(next.startsAt))
      : "";
    const text = next
      ? translate(
          "Sua próxima consulta é {date}: {title}. Local: {location}. Estes dados são fictícios.",
          { date, title: next.title, location: next.locationLabel },
        )
      : translate("Não há consulta neste cenário.");
    setMessages((m) => [
      ...m,
      { id: ++sequence.current, role: "assistant", text, intent: "agenda" },
    ]);
    if (voice && !busy.current) repeat(text);
  }
  function action(intent?: LiaIntent) {
    if (intent === "contact")
      return (
        <button
          className="text-button lia-action"
          onClick={() => {
            interrupt();
            onContact();
          }}
        >
          {translate("Revisar pedido de contato")}
          <ArrowRight size={18} />
        </button>
      );
    const to: Destination | undefined =
      intent === "agenda" || intent === "reschedule"
        ? "agenda"
        : intent === "journey"
          ? "journey"
          : intent === "documents"
            ? "documents"
            : intent === "checkin"
              ? "checkin"
              : undefined;
    return (
      to && (
        <button
          className="text-button lia-action"
          onClick={() => onNavigate(to)}
        >
          {translate("Abrir")}{" "}
          {to === "agenda"
            ? translate("minha agenda")
            : to === "journey"
              ? translate("minha jornada")
              : to === "documents"
                ? translate("meus documentos")
                : translate("meu check-in")}{" "}
          <ArrowRight size={18} />
        </button>
      )
    );
  }

  const symptomFeedback = symptomNotice && (
    <ConnectedSymptomStatus
      outcome={symptomNotice.outcome}
      locale={locale}
      retrying={
        retryingReport ||
        stage === "processing" ||
        stage === "transcribing" ||
        stage === "permission"
      }
      onRetry={() => void retrySymptomReport()}
      onDismiss={() => setSymptomNotice(null)}
    />
  );

  return (
    <div className="lia-live">
      <header className="lia-chat-header">
        <img className="lia-header-orb" src="./visual/lia-orb.svg" alt="" />
        <div className="lia-header-copy">
          <h1 tabIndex={-1}>Lia</h1>
          <p>{translate("Assistente OncoFlow")}</p>
        </div>
      </header>
      <div className="lia-status-line">
        <span className="lia-status-dot" aria-hidden="true" />
        <p className="lia-state" role="status" aria-live="polite">
          {callActive && stage === "permission"
            ? translate("Preparando o microfone…")
            : callActive && stage === "listening"
              ? translate("Conversa ao vivo")
              : translate(labels[stage])}
          {stage === "listening" && !callActive ? ` · ${seconds}s` : ""}
        </p>
      </div>
      {!consent && (
        <section className="lia-consent">
          <h2>{translate("Antes de conversar")}</h2>
          <p>
            {translate(
              "Seu texto e áudio serão processados pela OpenAI e ElevenLabs para gerar as respostas. Nesta apresentação, use somente relatos fictícios.",
            )}
          </p>
          {latest.current.appBridge.getSnapshot().connected && (
            <p>
              {locale === "en-US"
                ? "Symptom reports spoken or typed to Lia are checked by the demo service and attention signals are automatically shared with the care team panel. There is no real emergency monitoring."
                : "Relatos de sintomas ditos ou digitados à Lia são verificados pelo serviço da demonstração e sinais de atenção são compartilhados automaticamente com o painel da equipe. Não há monitoramento de urgência real."}
            </p>
          )}
          <button className="primary full" onClick={acceptConsent}>
            <Check size={18} />
            {waitingToStart
              ? translate("Entendi, ativar e conversar")
              : translate("Entendi, ativar a Lia")}
          </button>
          {waitingToStart && (
            <button className="secondary full" onClick={preferText}>
              {translate("Prefiro digitar")}
            </button>
          )}
        </section>
      )}
      <section className="lia-call-panel">
        <div className="lia-call-heading">
          <h2>{translate("Converse com a Lia")}</h2>
          <p>
            {translate(
              "Peça para abrir sua agenda, ler um documento ou registrar como você está. Eu faço isso com você.",
            )}
          </p>
        </div>
        <button
          className="primary full"
          disabled={!consent || !configured || busy.current || callActive}
          onClick={() => void startConversation()}
        >
          <Phone size={20} />
          {translate("Iniciar conversa")}
        </button>
      </section>
      {callActive && !minimized && (
        <VoiceConversation
          stage={
            stage === "listening"
              ? "listening"
              : stage === "transcribing"
                ? "transcribing"
                : stage === "error"
                  ? "error"
                  : stage === "speaking"
                    ? "speaking"
                    : stage === "muted"
                      ? "muted"
                      : stage === "permission" || stage === "idle"
                        ? "connecting"
                        : "thinking"
          }
          muted={callMuted}
          onToggleMute={toggleCallMute}
          onEnd={() => interrupt()}
          onFinishTurn={() => conversation.current?.finishTurn()}
          onRetry={() => {
            interrupt();
            void startConversation();
          }}
          levelRef={outputLevel}
          inputLevelRef={inputLevel}
          liveTranscript={liveTranscript}
          hint={
            stage === "speaking"
              ? translate("Pode me interromper falando.")
              : undefined
          }
          caption={messages.filter((m) => m.role === "assistant").at(-1)?.text}
          error={error}
          voiceWarning={voiceWarning}
          textScale={prefs.textScale}
          onMinimize={showApp}
          confirmation={
            pendingAction ? (
              <LiaActionConfirmation
                pending={pendingAction}
                disabled={
                  stage === "processing" ||
                  stage === "permission" ||
                  stage === "transcribing" ||
                  stage === "error"
                }
                onConfirm={(id) => resolveAction(id, true)}
                onCancel={(id) => resolveAction(id, false)}
              />
            ) : (
              symptomFeedback
            )
          }
        />
      )}
      {callActive && minimized && (
        <LiaCallDock
          status={
            stage === "listening"
              ? translate("Estou ouvindo. Pode pedir o próximo passo.")
              : translate(labels[stage])
          }
          muted={callMuted}
          textScale={prefs.textScale}
          error={error}
          onExpand={() => setMinimized(false)}
          onToggleMute={toggleCallMute}
          onEnd={() => interrupt()}
          onRetry={() => {
            interrupt();
            void startConversation();
          }}
          confirmation={
            pendingAction ? (
              <LiaActionConfirmation
                pending={pendingAction}
                disabled={
                  stage === "processing" ||
                  stage === "permission" ||
                  stage === "transcribing" ||
                  stage === "error"
                }
                onConfirm={(id) => resolveAction(id, true)}
                onCancel={(id) => resolveAction(id, false)}
              />
            ) : (
              symptomFeedback
            )
          }
        />
      )}
      {error && (
        <p className="lia-error" role="alert">
          {error}
        </p>
      )}
      {!callActive && symptomFeedback}
      {messages.length === 0 && (
        <section className="lia-welcome">
          <img className="lia-avatar" src="./visual/lia-orb.svg" alt="" />
          <div className="lia-bubble">
            <strong>
              {prefs.explanation === "step_by_step"
                ? translate("Vamos por partes, no seu ritmo.")
                : translate("Vamos dar um passo de cada vez.")}
            </strong>
            <p>
              {translate(
                "Você pode me pedir: “abra minha agenda”, “leia meus documentos” ou “aumente as letras”. Também posso registrar como você está e preparar pedidos fictícios, com a sua confirmação.",
              )}
            </p>
          </div>
        </section>
      )}
      {!configured && (
        <p className="lia-footnote">
          {latest.current.appBridge.getSnapshot().connected
            ? locale === "en-US"
              ? "You can report symptoms by text to the connected care team panel. Live AI and voice need the configured Android providers."
              : "Você pode relatar sintomas por texto ao painel conectado. A IA ao vivo e a voz precisam dos provedores configurados no Android."
            : translate(
                "A IA ao vivo está disponível no APK Android. Você pode explorar a agenda e os cenários neste navegador.",
              )}
        </p>
      )}
      <div
        className="lia-messages"
        aria-label={translate("Conversa com Lia")}
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((m) => (
          <article
            key={m.id}
            className={`lia-message ${m.role}`}
            data-testid={
              m.role === "assistant" ? "lia-answer" : "lia-user-message"
            }
          >
            {m.role === "assistant" && (
              <img className="lia-avatar" src="./visual/lia-orb.svg" alt="" />
            )}
            <div className="lia-bubble">
              <strong className="lia-message-author">
                {m.role === "assistant" ? "Lia" : translate("Você")}
              </strong>
              <p>{m.text}</p>
            </div>
            {m.role === "assistant" && (
              <div className="lia-message-actions">
                {action(m.intent)}
                <button
                  className="text-button lia-action"
                  disabled={
                    !consent || !configured || busy.current || callActive
                  }
                  aria-label={translate("Ouvir resposta da Lia")}
                  onClick={() => repeat(m.text)}
                >
                  <Volume2 size={18} />
                  {translate("Ouvir")}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="lia-options" aria-label={translate("Atalhos da Lia")}>
        <button onClick={showAppointment} disabled={callActive}>
          <CalendarDays size={20} />
          <span>{translate("Minha próxima consulta")}</span>
          <ArrowRight size={17} />
        </button>
        <button onClick={() => onNavigate("journey")}>
          <Route size={20} />
          <span>{translate("Entender minha jornada")}</span>
          <ArrowRight size={17} />
        </button>
        <button onClick={() => onNavigate("documents")}>
          <FileText size={20} />
          <span>{translate("Encontrar meus documentos")}</span>
          <ArrowRight size={17} />
        </button>
      </div>
      {!callActive && pendingAction && (
        <LiaActionConfirmation
          pending={pendingAction}
          disabled={
            stage === "processing" ||
            stage === "permission" ||
            stage === "transcribing"
          }
          onConfirm={(id) => resolveAction(id, true)}
          onCancel={(id) => resolveAction(id, false)}
        />
      )}
      <section className="lia-composer" hidden={callActive}>
        {reviewing && (
          <p className="lia-review" role="status">
            {translate(
              "Confira a transcrição. Você pode corrigir antes de enviar.",
            )}
          </p>
        )}
        <label htmlFor="lia-message">
          {reviewing
            ? translate("Revisar transcrição")
            : translate("Mensagem para a Lia")}
        </label>
        <div className="lia-input-row">
          <textarea
            id="lia-message"
            ref={draftField}
            aria-label={translate("Mensagem para a Lia")}
            rows={2}
            maxLength={1500}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={translate("Digite sua mensagem…")}
            disabled={
              stage === "listening" ||
              stage === "permission" ||
              stage === "transcribing" ||
              stage === "processing"
            }
          />
          <button
            className="lia-send"
            aria-label={translate("Enviar mensagem")}
            disabled={
              !draft.trim() ||
              !consent ||
              (!configured &&
                !latest.current.appBridge.getSnapshot().connected) ||
              busy.current
            }
            onClick={() => void send()}
          >
            <Send size={24} aria-hidden="true" />
            <span className="lia-sr-only">{translate("Enviar")}</span>
          </button>
        </div>
        <div className="lia-composer-actions">
          {stage === "listening" ? (
            <button
              className="secondary lia-record"
              onClick={() => void finishRecording()}
            >
              <Square size={20} />
              {translate("Concluir gravação")}
            </button>
          ) : (
            <button
              className="secondary lia-record"
              disabled={!consent || !configured || busy.current || callActive}
              onClick={() => void record()}
            >
              <Mic size={20} />
              {translate("Gravar mensagem")}
            </button>
          )}
        </div>
        {stage !== "idle" && (
          <button className="text-button" onClick={() => interrupt()}>
            <X size={18} />
            {stage === "speaking"
              ? translate("Parar voz")
              : translate("Cancelar operação")}
          </button>
        )}
        <label className="lia-toggle">
          <input
            type="checkbox"
            checked={voice}
            onChange={(e) => {
              setVoice(e.target.checked);
              if (
                !e.target.checked &&
                (stage === "speaking" || stage === "synthesizing")
              )
                interrupt();
            }}
          />
          {translate("Ouvir as respostas da Lia")}
        </label>
        <p className="lia-footnote">
          {prefs.explanation === "short"
            ? translate("Explicações curtas")
            : translate("Explicações passo a passo")}{" "}
          {translate(
            "· Ajuste a voz e a leitura em Perfil. Conversa mantida apenas nesta sessão.",
          )}
        </p>
      </section>
      <div className="lia-demo-panel">
        <SafetyDemo
          ref={safety}
          sessionId={context.sessionId}
          explanation={prefs.explanation}
          onDecision={(decision) => {
            interrupt();
            setMessages((m) => [
              ...m,
              {
                id: ++sequence.current,
                role: "assistant",
                text: decision.text,
                intent: "safety",
              },
            ]);
          }}
        />
      </div>
      <p className="lia-footnote lia-care-note">
        {translate(
          latest.current.appBridge.getSnapshot().connected
            ? "Relatos de sintomas na Lia são verificados pelo serviço e sinais de atenção são enviados automaticamente ao painel conectado para revisão profissional. O registro não significa que alguém já leu. Não há monitoramento de urgência real: procure atendimento sem esperar pelo aplicativo. Os cenários de demonstração abaixo continuam locais."
            : "Este app não é acompanhado por uma equipe real. Em uma situação real de urgência, procure atendimento imediatamente, sem aguardar resposta pelo aplicativo.",
        )}
      </p>
    </div>
  );
}
