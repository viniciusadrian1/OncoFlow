import { translate, useI18n } from "../../i18n";
import { Check, X } from "lucide-react";
import type { PendingLiaAction } from "../../../shared/liaActions";

export function LiaActionConfirmation({
  pending,
  disabled,
  onConfirm,
  onCancel,
}: {
  pending: PendingLiaAction;
  disabled?: boolean;
  onConfirm(id: string): void;
  onCancel(id: string): void;
}) {
  useI18n();
  return (
    <section
      className="lia-action-confirmation"
      aria-label={translate("Confirmar ação da Lia")}
      data-testid="lia-action-confirmation"
    >
      <strong>{translate("Posso fazer isso?")}</strong>
      <p>{pending.summary}</p>
      <p className="lia-confirm-hint">
        {translate("Diga “sim, confirmar” ou “não, cancelar”.")}
      </p>
      <div className="lia-confirm-buttons">
        <button
          type="button"
          className="lia-confirm-yes"
          disabled={disabled}
          onClick={() => onConfirm(pending.id)}
        >
          <Check size={20} aria-hidden="true" />
          {translate("Sim, confirmar")}
        </button>
        <button
          type="button"
          className="lia-confirm-no"
          disabled={disabled}
          onClick={() => onCancel(pending.id)}
        >
          <X size={20} aria-hidden="true" />
          {translate("Não, cancelar")}
        </button>
      </div>
    </section>
  );
}
