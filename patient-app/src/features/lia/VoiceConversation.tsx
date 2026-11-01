import { translate, useI18n } from "../../i18n";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Captions, Mic, MicOff, X } from "lucide-react";
import "./voiceConversation.css";

export type VoiceStage =
  | "connecting"
  | "listening"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";
type Props = {
  stage: VoiceStage;
  muted: boolean;
  onToggleMute(): void;
  onEnd(): void;
  levelRef: RefObject<number>;
  inputLevelRef?: RefObject<number>;
  caption?: string;
  liveTranscript?: string;
  hint?: string;
  error?: string;
  voiceWarning?: string;
  onRetry?(): void;
  onFinishTurn?(): void;
  onMinimize?(): void;
  confirmation?: ReactNode;
  textScale?: number;
};

const stageLabels: Record<VoiceStage, string> = {
  connecting: "Conectando…",
  listening: "Estou ouvindo…",
  transcribing: "Entendendo sua fala…",
  thinking: "Preparando a resposta…",
  speaking: "Respondendo…",
  muted: "Microfone silenciado",
  error: "Vamos tentar novamente",
};

const waveBars = Array.from(
  { length: 35 },
  (_, index) =>
    (0.65 + 0.35 * Math.abs(Math.sin(index * 1.9))) *
    (0.6 + 0.4 * Math.sin((index / 34) * Math.PI)),
);

/** The visual and waveform respond to measured audio, never a simulated speech cycle. */
function VoiceOrb({
  stage,
  muted,
  levelRef,
  inputLevelRef,
}: Pick<Props, "stage" | "muted" | "levelRef" | "inputLevelRef">) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputBarsRef = useRef<HTMLSpanElement>(null);
  const current = useRef({ stage, muted, levelRef, inputLevelRef });
  current.current = { stage, muted, levelRef, inputLevelRef };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      disposed = false,
      size = 320,
      energy = 0,
      lastPaint = 0;
    const orb = new Image();
    orb.src = new URL("./visual/lia-orb.svg", document.baseURI).href;
    const resize = () => {
      size = Math.max(1, canvas.getBoundingClientRect().width);
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(size * ratio);
      canvas.height = Math.round(size * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const paint = (now: number) => {
      if (disposed || document.hidden) return;
      frame = requestAnimationFrame(paint);
      // Thirty frames per second is sufficient for the soft form and avoids heating the phone.
      if (now - lastPaint < 30) return;
      lastPaint = now;
      const {
        stage: liveStage,
        muted: micMuted,
        levelRef: output,
        inputLevelRef: input,
      } = current.current;
      const target =
        liveStage === "speaking"
          ? Math.max(0, Math.min(1, output.current || 0))
          : 0;
      const inputLevel =
        liveStage === "listening" && !micMuted
          ? Math.max(0, Math.min(1, input?.current || 0))
          : 0;
      const activeLevel = liveStage === "speaking" ? target : inputLevel;
      energy += (activeLevel - energy) * (activeLevel > energy ? 0.42 : 0.2);
      if (energy < 0.001) energy = 0;
      canvas.dataset.audioLevel = target.toFixed(3);
      canvas.dataset.inputLevel = inputLevel.toFixed(3);
      if (inputBarsRef.current) {
        inputBarsRef.current.dataset.inputLevel = inputLevel.toFixed(3);
        inputBarsRef.current.dataset.audioLevel = target.toFixed(3);
        inputBarsRef.current.style.setProperty(
          "--input-level",
          String(inputLevel),
        );
        inputBarsRef.current.style.setProperty(
          "--wave-level",
          String(activeLevel),
        );
      }
      const motion = reduced.matches ? 0 : energy;
      const cx = size / 2,
        cy = size / 2;
      const quiet =
        (micMuted && liveStage !== "speaking") || liveStage === "error";
      context.clearRect(0, 0, size, size);

      const halo = context.createRadialGradient(
        cx,
        cy,
        size * 0.24,
        cx,
        cy,
        size * 0.49,
      );
      halo.addColorStop(0, quiet ? "#cce5e424" : "#82dbde30");
      halo.addColorStop(
        0.72,
        quiet ? "#cce5e414" : `rgba(110,211,222,${0.08 + energy * 0.13})`,
      );
      halo.addColorStop(1, "#a6e6e600");
      context.fillStyle = halo;
      context.fillRect(0, 0, size, size);
      context.save();
      context.translate(cx, cy);
      // The translucent petals breathe with audio; a silent microphone stays still.
      context.rotate(motion * 0.065);
      context.scale(1 + motion * 0.045, 1 + motion * 0.025);
      context.globalAlpha = quiet ? 0.48 : 1;
      if (orb.complete && orb.naturalWidth > 0) {
        context.drawImage(orb, -size / 2, -size / 2, size, size);
      } else {
        // Preserve a visible sphere while the bundled SVG is being decoded.
        const fallback = context.createLinearGradient(
          -size / 3,
          -size / 3,
          size / 3,
          size / 3,
        );
        fallback.addColorStop(0, "#e0f9f7");
        fallback.addColorStop(0.45, "#52c2df");
        fallback.addColorStop(1, "#57bcb8");
        context.fillStyle = fallback;
        context.beginPath();
        context.arc(0, 0, size * 0.4, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !disposed) frame = requestAnimationFrame(paint);
    };
    document.addEventListener("visibilitychange", resume);
    frame = requestAnimationFrame(paint);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return (
    <div className="voice-visual">
      <div className="voice-orb-wrap">
        <canvas
          ref={canvasRef}
          className="voice-orb-canvas"
          aria-hidden="true"
          data-testid="voice-orb"
          data-audio-level="0"
          data-input-level="0"
        />
      </div>
      <div className="voice-signal" aria-hidden="true">
        <span
          ref={inputBarsRef}
          className="voice-input-bars"
          data-testid="voice-input-level"
          data-input-level="0"
          data-audio-level="0"
        >
          {waveBars.map((weight, index) => (
            <i
              key={index}
              style={{ "--bar-weight": weight } as CSSProperties}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

export function VoiceConversation({
  stage,
  muted,
  onToggleMute,
  onEnd,
  levelRef,
  inputLevelRef,
  caption,
  liveTranscript,
  hint,
  error,
  voiceWarning,
  onRetry,
  onFinishTurn,
  onMinimize,
  confirmation,
  textScale,
}: Props) {
  useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const endCallback = useRef(onEnd);
  endCallback.current = onEnd;
  const [captions, setCaptions] = useState(false);
  useEffect(() => {
    if (voiceWarning) setCaptions(true);
  }, [voiceWarning]);
  const status =
    stage === "speaking" ||
    stage === "thinking" ||
    stage === "transcribing" ||
    stage === "error"
      ? translate(stageLabels[stage])
      : muted
        ? translate(stageLabels.muted)
        : translate(stageLabels[stage]);
  const hasError = stage === "error" || !!error;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    const scale = getComputedStyle(
      document.querySelector(".app-shell") ?? document.body,
    )
      .getPropertyValue("--text-scale")
      .trim();
    element.style.setProperty("--voice-text-scale", scale || "1");
    document.body.style.overflow = "hidden";
    if (!element.open) element.showModal();
    element.focus({ preventScroll: true });
    const cancel = (event: Event) => {
      event.preventDefault();
      endCallback.current();
    };
    element.addEventListener("cancel", cancel);
    return () => {
      element.removeEventListener("cancel", cancel);
      if (element.open) element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    if (textScale !== undefined) {
      const scale = getComputedStyle(
        document.querySelector(".app-shell") ?? document.body,
      )
        .getPropertyValue("--text-scale")
        .trim();
      dialog.current?.style.setProperty(
        "--voice-text-scale",
        scale || String(textScale),
      );
    }
  }, [textScale]);

  return createPortal(
    <dialog
      ref={dialog}
      className={`voice-conversation${captions ? " has-captions" : ""}${hasError ? " has-error" : ""}${confirmation ? " has-action" : ""}`}
      aria-labelledby="voice-title"
      aria-describedby="voice-demo-notice"
      tabIndex={-1}
      data-testid="voice-conversation"
      data-stage={stage}
      data-muted={muted}
    >
      <header className="voice-header">
        <div className="voice-identity">
          <h2 id="voice-title">Lia</h2>
          <span className="voice-brand">OncoFlow</span>
        </div>
      </header>
      <p id="voice-demo-notice" className="voice-demo-notice">
        {translate("Demonstração · sem atendimento real")}
      </p>
      <main className="voice-main">
        {onMinimize && (
          <button type="button" className="voice-app-link" onClick={onMinimize}>
            {translate("Ver aplicativo")}
          </button>
        )}
        <div className="voice-status-block">
          <p className="voice-status" role="status" aria-live="polite">
            {status}
          </p>
        </div>
        <VoiceOrb
          stage={stage}
          muted={muted}
          levelRef={levelRef}
          inputLevelRef={inputLevelRef}
        />
        <p className="voice-hint">
          {hasError
            ? ""
            : stage === "speaking" || stage === "thinking"
              ? translate("Estou aqui com você.")
              : muted
                ? translate("Toque no microfone para voltar.")
                : stage === "listening"
                  ? translate("Pode falar, estou aqui para ajudar.")
                  : stage === "transcribing"
                    ? translate("Recebi sua fala.")
                    : ""}
        </p>
        {voiceWarning && (
          <p className="voice-playback-warning" role="status">
            {voiceWarning}
          </p>
        )}
        {confirmation}
        {stage === "listening" && !muted && onFinishTurn && (
          <button
            type="button"
            className="voice-finish-turn"
            onClick={onFinishTurn}
          >
            {translate("Terminei de falar")}
          </button>
        )}
        {hasError && (
          <div className="voice-recovery">
            <p className="voice-call-error" role="alert">
              {error ||
                translate(
                  "Não consegui continuar agora. Vamos tentar de novo?",
                )}
            </p>
            {onRetry && (
              <button type="button" className="voice-retry" onClick={onRetry}>
                {translate("Tentar novamente")}
              </button>
            )}
          </div>
        )}
        {captions && !hasError && (
          <section
            className="voice-captions"
            aria-label={translate("Legendas da conversa")}
          >
            {liveTranscript && (
              <div>
                <strong>{translate("Você")}</strong>
                <p>{liveTranscript}</p>
              </div>
            )}
            {caption && (
              <div>
                <strong>Lia</strong>
                <p>{caption}</p>
              </div>
            )}
            {!caption && !liveTranscript && (
              <p>{translate("As falas aparecerão aqui.")}</p>
            )}
          </section>
        )}
      </main>
      <footer className="voice-footer">
        {hint && (
          <p className="voice-bottom-hint" role="status">
            {hint}
          </p>
        )}
        <div className="voice-controls">
          <div className="voice-control-group">
            <button
              type="button"
              className={`voice-control voice-microphone ${muted ? "is-muted" : ""}`}
              disabled={hasError}
              onClick={onToggleMute}
              aria-label={
                muted
                  ? translate("Ativar microfone")
                  : translate("Silenciar microfone")
              }
              aria-pressed={muted}
            >
              {muted ? <MicOff size={27} /> : <Mic size={27} />}
            </button>
            <span>
              {muted ? translate("Silenciado") : translate("Microfone")}
            </span>
          </div>
          <div className="voice-control-group">
            <button
              type="button"
              className="voice-control voice-close"
              onClick={onEnd}
              aria-label={translate("Encerrar conversa")}
            >
              <X size={29} />
            </button>
            <span>{translate("Encerrar")}</span>
          </div>
          <div className="voice-control-group">
            <button
              type="button"
              className={`voice-control voice-caption-toggle ${captions ? "selected" : ""}`}
              onClick={() => setCaptions((value) => !value)}
              aria-label={
                captions
                  ? translate("Ocultar legendas")
                  : translate("Mostrar legendas")
              }
              aria-pressed={captions}
              disabled={hasError}
            >
              <Captions size={27} />
            </button>
            <span>{translate("Legendas")}</span>
          </div>
        </div>
      </footer>
    </dialog>,
    document.body,
  );
}
