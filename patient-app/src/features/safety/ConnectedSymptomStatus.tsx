import type { ConnectedSymptomOutcome } from "./connectedSymptoms";
import "./connectedSymptoms.css";

export function ConnectedSymptomStatus({
  outcome,
  locale,
  retrying,
  onRetry,
  onDismiss,
}: {
  outcome: Exclude<ConnectedSymptomOutcome, { kind: "not_applicable" }>;
  locale: "pt-BR" | "en-US";
  retrying: boolean;
  onRetry(): void;
  onDismiss(): void;
}) {
  const english = locale === "en-US";
  return (
    <section
      className="lia-action-confirmation connected-symptom-status"
      data-testid="connected-symptom-status"
      role="alert"
    >
      <strong>
        {outcome.kind === "recorded"
          ? english
            ? "Alert recorded · awaiting review"
            : "Alerta registrado · aguardando revisão"
          : english
            ? "Sending not confirmed"
            : "Envio não confirmado"}
      </strong>
      <p>{outcome.text}</p>
      <div className="connected-symptom-buttons">
        {outcome.kind === "unconfirmed" && (
          <button className="primary" disabled={retrying} onClick={onRetry}>
            {retrying
              ? english
                ? "Retrying…"
                : "Tentando novamente…"
              : english
                ? "Retry sending report"
                : "Tentar enviar relato novamente"}
          </button>
        )}
        <button className="secondary" disabled={retrying} onClick={onDismiss}>
          {english ? "Close notice" : "Fechar aviso"}
        </button>
      </div>
    </section>
  );
}
