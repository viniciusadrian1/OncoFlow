import { translate, useI18n } from "../../i18n";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Mic, MicOff, X } from "lucide-react";

export function LiaCallDock({
  status,
  muted,
  textScale,
  error,
  confirmation,
  onExpand,
  onToggleMute,
  onEnd,
  onRetry,
}: {
  status: string;
  muted: boolean;
  textScale: number;
  error?: string;
  confirmation?: ReactNode;
  onExpand(): void;
  onToggleMute(): void;
  onEnd(): void;
  onRetry(): void;
}) {
  useI18n();
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    document.body.classList.add("lia-call-dock-open");
    const resize = () => {
      const box = element.current?.getBoundingClientRect();
      document.documentElement.style.setProperty(
        "--lia-dock-height",
        `${box?.height ?? 160}px`,
      );
      document.documentElement.style.setProperty(
        "--lia-dock-bottom",
        `${box ? Math.max(0, window.innerHeight - box.bottom) : 90}px`,
      );
    };
    const observer = new ResizeObserver(resize);
    if (element.current) observer.observe(element.current);
    resize();
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      document.body.classList.remove("lia-call-dock-open");
      document.documentElement.style.removeProperty("--lia-dock-height");
      document.documentElement.style.removeProperty("--lia-dock-bottom");
      window.removeEventListener("resize", resize);
    };
  }, []);
  return createPortal(
    <aside
      ref={element}
      className="lia-call-dock"
      style={{ "--text-scale": textScale } as CSSProperties}
      aria-label={translate("Conversa com a Lia em andamento")}
      data-testid="lia-call-dock"
      data-muted={muted}
    >
      <div className="lia-dock-content">
        <div className="lia-dock-heading">
          <img src="./visual/lia-orb.svg" alt="" />
          <div>
            <strong>{translate("Lia está com você")}</strong>
            <p role="status">{status}</p>
          </div>
        </div>
        {error && (
          <>
            <p role="alert" className="lia-dock-error">
              {error}
            </p>
            <button type="button" className="lia-dock-retry" onClick={onRetry}>
              {translate("Tentar novamente")}
            </button>
          </>
        )}
        {confirmation}
      </div>
      <div className="lia-dock-controls">
        <button
          type="button"
          onClick={onExpand}
          aria-label={translate("Voltar à conversa")}
        >
          <Maximize2 size={22} aria-hidden="true" />
          <span>{translate("Conversa")}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          disabled={!!error}
          aria-label={
            muted
              ? translate("Ativar microfone")
              : translate("Silenciar microfone")
          }
          aria-pressed={muted}
        >
          {muted ? (
            <MicOff size={22} aria-hidden="true" />
          ) : (
            <Mic size={22} aria-hidden="true" />
          )}
          <span>
            {muted ? translate("Ativar mic.") : translate("Silenciar")}
          </span>
        </button>
        <button
          type="button"
          onClick={onEnd}
          aria-label={translate("Encerrar conversa")}
        >
          <X size={22} aria-hidden="true" />
          <span>{translate("Encerrar")}</span>
        </button>
      </div>
    </aside>,
    document.body,
  );
}
