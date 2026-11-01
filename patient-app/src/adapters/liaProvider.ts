import { getLocale, translate, type AppLocale } from "../i18n";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { parseLiaAction, type LiaAction } from "../../shared/liaActions";

export type LiaIntent =
  | "agenda"
  | "journey"
  | "documents"
  | "contact"
  | "reschedule"
  | "checkin"
  | "clarify"
  | "safety"
  | "other";
export type LiaMessage = { role: "user" | "assistant"; text: string };
export type LiaChatInput = {
  locale?: AppLocale;
  connected?: boolean;
  text: string;
  personaId: string;
  explanation: "short" | "step_by_step";
  history: LiaMessage[];
  context: string;
};
export type LiaResponse = {
  text: string;
  intent: LiaIntent;
  action?: LiaAction | null;
};
export type AudioPayload = {
  locale?: AppLocale;
  base64: string;
  mimeType: string;
  durationMs: number;
};
export type TranscriptionSession = {
  clientSecret: string;
  /** Unix timestamp in seconds; only the short-lived connection credential. */
  expiresAt: number;
};
export interface NativeLiaProvider {
  chat(
    input: LiaChatInput,
  ): Promise<{ text: string; intent: string; action?: unknown }>;
  transcribe(input: AudioPayload): Promise<{ text: string }>;
  createTranscriptionSession(input?: {
    locale?: AppLocale;
  }): Promise<TranscriptionSession>;
  synthesize(input: {
    text: string;
    speed: number;
    locale?: AppLocale;
  }): Promise<{ base64: string; mimeType: string }>;
  status(): Promise<{ configured: boolean }>;
  cancel(): Promise<void>;
}
const intents = new Set<LiaIntent>([
  "agenda",
  "journey",
  "documents",
  "contact",
  "reschedule",
  "checkin",
  "clarify",
  "safety",
  "other",
]);
const plugin = registerPlugin<NativeLiaProvider>("LiaProvider");
function explicitScreenCommand(text: string): string | undefined {
  const command = text
    .toLowerCase()
    .trim()
    .replace(/^(?:lia|leah)[,\s]+/, "")
    .replace(/^please\s+/, "")
    .replace(/[,\s]*(?:please|por favor)[.!]*$/, "")
    .replace(/[.!]+$/, "")
    .trim();
  const match =
    /^(?:open|show|abra|abrir|mostre|mostrar)\s+(?:(?:my|the|a|o|minha|meu|meus|minhas)\s+)?(.+?)(?:\s+(?:screen|page))?$/.exec(
      command,
    );
  if (!match) return undefined;
  return (
    {
      schedule: "agenda",
      calendar: "agenda",
      agenda: "agenda",
      journey: "journey",
      "care journey": "journey",
      jornada: "journey",
      documents: "documents",
      documentos: "documents",
      requests: "requests",
      pedidos: "requests",
      profile: "profile",
      perfil: "profile",
      "check-in": "checkin",
      "check in": "checkin",
    } as Record<string, string>
  )[match[1]];
}
const unavailable = () =>
  new Error(translate("A IA ao vivo está disponível no APK Android."));
const abortError = () =>
  new DOMException(translate("Operação cancelada"), "AbortError");

export function createLiaAdapter(native: NativeLiaProvider) {
  async function run<T>(
    operation: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw abortError();
    const requestLocale = getLocale();
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal?.removeEventListener("abort", aborted);
      const aborted = () => {
        if (settled) return;
        settled = true;
        cleanup();
        void native.cancel().catch(() => {});
        reject(abortError());
      };
      signal?.addEventListener("abort", aborted, { once: true });
      operation().then(
        (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (requestLocale !== getLocale()) {
            reject(abortError());
            return;
          }
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          cleanup();
          // Native errors are application copy; model answers and transcripts
          // are returned untouched through the success path above.
          if (error instanceof Error) error.message = translate(error.message);
          reject(error);
        },
      );
    });
  }
  return {
    async chatWithLia(
      input: LiaChatInput,
      signal?: AbortSignal,
    ): Promise<LiaResponse> {
      const result = await run(
        () => native.chat({ ...input, locale: input.locale ?? getLocale() }),
        signal,
      );
      if (
        typeof result.text !== "string" ||
        !result.text.trim() ||
        result.text.length > 2400 ||
        !intents.has(result.intent as LiaIntent)
      ) {
        throw new Error(
          translate("A Lia não retornou uma resposta válida. Tente novamente."),
        );
      }
      const response: LiaResponse = {
        text: result.text,
        intent: result.intent as LiaIntent,
      };
      // Legacy responses have no action field. Neither safety guidance nor an
      // unresolved clarification is ever authority to change application state.
      if (result.action !== undefined) {
        if (result.intent === "safety" || result.intent === "clarify") {
          response.action = null;
        } else {
          try {
            response.action = parseLiaAction(result.action);
            // Keep explicit screen-opening commands distinct from read-aloud
            // requests. Only refine a validated read of the very same screen.
            if (
              response.action?.type === "read" &&
              explicitScreenCommand(input.text) === response.action.target
            ) {
              response.action = { ...response.action, type: "navigate" };
            }
            if (response.action?.type === "set_text_scale") {
              const percentages = Array.from(
                input.text.matchAll(
                  /\b(100|125|150|200)\s*(?:%|por\s+cento\b|percent\b)/gi,
                ),
              );
              // An explicit supported size takes precedence over a model's
              // interpretation of "increase" as a single step.
              if (percentages.length === 1) {
                response.action = {
                  ...response.action,
                  value: String(Number(percentages[0][1]) / 100),
                };
              }
            }
          } catch {
            throw new Error(
              translate(
                "A Lia não retornou uma resposta válida. Tente novamente.",
              ),
            );
          }
        }
      }
      return response;
    },
    async transcribeAudio(
      input: AudioPayload,
      signal?: AbortSignal,
    ): Promise<{ text: string }> {
      const result = await run(
        () =>
          native.transcribe({ ...input, locale: input.locale ?? getLocale() }),
        signal,
      );
      if (
        typeof result.text !== "string" ||
        !result.text.trim() ||
        result.text.length > 1500
      ) {
        throw new Error(
          translate(
            "Não consegui entender esse áudio. Tente uma frase mais curta ou digite.",
          ),
        );
      }
      return result;
    },
    async createTranscriptionSession(
      signal?: AbortSignal,
    ): Promise<TranscriptionSession> {
      const result = await run(
        () => native.createTranscriptionSession({ locale: getLocale() }),
        signal,
      );
      if (
        typeof result.clientSecret !== "string" ||
        !result.clientSecret.startsWith("ek_") ||
        result.clientSecret.length <= 3 ||
        result.clientSecret.length > 4096 ||
        /\s/.test(result.clientSecret) ||
        !Number.isSafeInteger(result.expiresAt) ||
        result.expiresAt <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error(
          translate(
            "Não foi possível iniciar a conexão de voz. Tente novamente.",
          ),
        );
      }
      return {
        clientSecret: result.clientSecret,
        expiresAt: result.expiresAt,
      };
    },
    async synthesizeSpeech(
      text: string,
      speed: number,
      signal?: AbortSignal,
    ): Promise<Blob> {
      const result = await run(
        () => native.synthesize({ text, speed, locale: getLocale() }),
        signal,
      );
      if (
        result.mimeType !== "audio/mpeg" ||
        typeof result.base64 !== "string" ||
        !result.base64 ||
        result.base64.length > 6_000_000
      ) {
        throw new Error(
          translate("A voz está indisponível. A resposta continua no texto."),
        );
      }
      const binary = atob(result.base64);
      const bytes = Uint8Array.from(binary, (character) =>
        character.charCodeAt(0),
      );
      return new Blob([bytes], { type: "audio/mpeg" });
    },
    providerStatus: () => native.status(),
    cancelProvider: () => native.cancel(),
  };
}
const nativeAdapter = createLiaAdapter(plugin);
function requireAndroid() {
  if (Capacitor.getPlatform() !== "android") throw unavailable();
}
export async function chatWithLia(input: LiaChatInput, signal?: AbortSignal) {
  requireAndroid();
  return nativeAdapter.chatWithLia(input, signal);
}
export async function transcribeAudio(
  input: AudioPayload,
  signal?: AbortSignal,
) {
  requireAndroid();
  return nativeAdapter.transcribeAudio(input, signal);
}
export async function createTranscriptionSession(
  signal?: AbortSignal,
): Promise<TranscriptionSession> {
  requireAndroid();
  return nativeAdapter.createTranscriptionSession(signal);
}
export async function synthesizeSpeech(
  text: string,
  speed: number,
  signal?: AbortSignal,
) {
  requireAndroid();
  return nativeAdapter.synthesizeSpeech(text, speed, signal);
}
export async function providerStatus(): Promise<{ configured: boolean }> {
  return Capacitor.getPlatform() === "android"
    ? nativeAdapter.providerStatus()
    : { configured: false };
}
export async function cancelProvider(): Promise<void> {
  if (Capacitor.getPlatform() === "android")
    await nativeAdapter.cancelProvider();
}
