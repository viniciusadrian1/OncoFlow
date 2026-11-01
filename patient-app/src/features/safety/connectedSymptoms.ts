import type { HospitalSymptomReportResult } from "../../../shared/hospitalContracts";

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

// This is an offline fallback only, not the service's detector or a clinical score.
// It never generates an alert: the authoritative decision is made by the service.
function mayNeedSafetyFallback(text: string): boolean {
  return /\b(febre|febril|vomit\w*|fever\w*|throwing up|calafrios|chills|sang\w*|bleed\w*|blood|falta de ar|respirar|breathe|breath|desmai\w*|faint\w*|convuls\w*|seizure|dor|pain)\b/.test(
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase(),
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
    if (!mayNeedSafetyFallback(input.text)) return { kind: "not_applicable" };
    return {
      kind: "unconfirmed",
      text:
        input.locale === "en-US"
          ? "I could not confirm that the care team panel received this report. If you have fever, vomiting or other concerning symptoms during cancer care, contact your oncology service now. If you cannot reach them, seek urgent in-person care. Do not wait for the app. You can retry sending this same report."
          : "Não consegui confirmar que o painel da equipe recebeu este relato. Se você está com febre, vômitos ou outros sintomas que preocupam durante o acompanhamento oncológico, entre em contato com o serviço de oncologia agora. Se não conseguir contato, procure um pronto atendimento. Não espere pelo aplicativo. Você pode tentar enviar este mesmo relato novamente.",
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
