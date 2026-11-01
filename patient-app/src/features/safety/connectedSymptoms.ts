import type { HospitalSymptomReportResult } from "../../../shared/hospitalContracts";
import { DEMO_ATTENTION_TERMS } from "../../../shared/symptomTerms";
import { findCurrentSymptomAssertion } from "../../../shared/symptomAssertions";

export type ConnectedSymptomInput = {
  text: string;
  source: "text" | "voice";
  locale: "pt-BR" | "en-US";
  operationId: string;
};
export type ConnectedSymptomOutcome =
  | { kind: "not_applicable"; text?: undefined; alertId?: undefined }
  | { kind: "recorded"; text: string; alertId: string }
  | { kind: "unconfirmed"; text: string; alertId?: undefined };

// The service terms select a care-seeking fallback only. A delivery receipt
// still requires its API; this path never creates an alert or scores symptoms.

/** Guidance without any delivery claim, for disconnected or unconfirmed turns.
 * Keeps negation, time, person and hypothetical scope from the service mechanics.
 */
export function getSymptomCareGuidance(
  input: Pick<ConnectedSymptomInput, "text" | "locale">,
): string | null {
  const finding = findCurrentSymptomAssertion(input.text, DEMO_ATTENTION_TERMS);
  if (!finding) return null;
  const fever = /^(?:febre|febril|fever|feverish)$/.test(finding);
  const explanation =
    input.locale === "en-US"
      ? fever
        ? "Fever during cancer treatment can be a sign of infection and needs prompt assessment. "
        : "Symptoms like these during cancer care need professional assessment. "
      : fever
        ? "Febre durante o tratamento oncológico pode ser sinal de infecção e precisa de avaliação imediata. "
        : "Sintomas como esses durante o acompanhamento oncológico precisam de avaliação profissional. ";
  return (
    explanation +
    (input.locale === "en-US"
      ? "Contact your oncology service now. If you cannot reach them, seek urgent in-person care. Do not wait for a reply in the app."
      : "Entre em contato com seu serviço de oncologia agora. Se não conseguir contato, procure um pronto atendimento. Não espere uma resposta pelo aplicativo.")
  );
}

/** One bounded check before the conversational model. A timeout may have an
 * unknown write outcome; the UI retries the SAME operationId, never a new write.
 */
export async function checkConnectedSymptoms({
  report,
  input,
  signal,
  timeoutMs = 3000,
}: {
  report(
    input: ConnectedSymptomInput,
    signal?: AbortSignal,
  ): Promise<HospitalSymptomReportResult>;
  input: ConnectedSymptomInput;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<ConnectedSymptomOutcome> {
  const canceled = () => new DOMException("Conversation ended", "AbortError");
  if (signal.aborted) throw canceled();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCanceled!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => {
    rejectCanceled = reject;
  });
  const onAbort = () => {
    controller.abort();
    rejectCanceled(canceled());
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    const result = await Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw canceled();
        return report(input, controller.signal);
      }),
      stopped,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Unconfirmed symptom report"));
        }, timeoutMs);
      }),
    ]);
    if (signal.aborted) throw canceled();
    if (result.status === "not_applicable") return { kind: "not_applicable" };
    const receipt =
      input.locale === "en-US"
        ? "Alert recorded in the care team panel, awaiting professional review. This does not mean a clinician has read it. Do not wait for a reply in the app before seeking care."
        : "Alerta registrado no painel da equipe, aguardando revisão profissional. Isso não significa que um profissional já o leu. Não espere uma resposta no aplicativo para procurar atendimento.";
    return {
      kind: "recorded",
      text: `${result.guidance}\n\n${receipt}`,
      alertId: result.alertId,
    };
  } catch {
    if (signal.aborted) throw canceled();
    const guidance = getSymptomCareGuidance(input);
    if (!guidance) return { kind: "not_applicable" };
    return {
      kind: "unconfirmed",
      text:
        input.locale === "en-US"
          ? `I could not confirm that the care team panel received this report. ${guidance} You can retry sending this same report.`
          : `Não consegui confirmar que o painel da equipe recebeu este relato. ${guidance} Você pode tentar enviar este mesmo relato novamente.`,
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
