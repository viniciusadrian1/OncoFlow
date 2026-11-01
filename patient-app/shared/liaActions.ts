import type {
  Appointment,
  DemoContext,
  DemoDocument,
  DemoRequest,
  JourneyEvent,
  Persona,
  Preferences,
} from "./contracts";
import type {
  HospitalCareContext,
  HospitalSymptomReportResult,
} from "./hospitalContracts";

export type LiaSymptomReportInput = {
  text: string;
  source: "text" | "voice";
  locale: "pt-BR" | "en-US";
  operationId: string;
};

export const LIA_PAGES = [
  "home",
  "journey",
  "lia",
  "agenda",
  "profile",
  "documents",
  "requests",
  "checkin",
  "messages",
] as const;
export type LiaPageId = (typeof LIA_PAGES)[number];
export const LIA_FEELINGS = [
  "Bem",
  "Cansado(a)",
  "Com dor",
  "Náusea",
  "Ansioso(a)",
  "Outro",
] as const;
export const LIA_ACTION_TYPES = [
  "navigate",
  "read",
  "open_appointment",
  "open_document",
  "record_wellbeing",
  "request_contact",
  "request_reschedule",
  "set_text_scale",
  "set_speech_rate",
  "set_explanation",
] as const;
export type LiaAction = {
  type: (typeof LIA_ACTION_TYPES)[number];
  target: string | null;
  value: string | null;
};
export type LiaAppSnapshot = {
  context: DemoContext;
  persona: Persona;
  page: LiaPageId;
  prefs: Preferences;
  appointments: Appointment[];
  journey: JourneyEvent[];
  documents: DemoDocument[];
  requests: DemoRequest[];
  savedMood: string;
  /** Connected snapshots contain patient-visible server data only; never credentials. */
  connected?: { status: "loading" | "ready" | "offline"; asOf?: string };
  careContext?: HospitalCareContext;
  messages?: {
    id: string;
    authorLabel: string;
    text: string;
    createdAt: string;
    role: "patient" | "team" | "system";
  }[];
};
export type LiaExecution = {
  status: "completed" | "needs_confirmation" | "rejected" | "cancelled";
  text: string;
  showApp?: boolean;
};
export type PendingLiaAction = {
  id: string;
  action: LiaAction;
  context: DemoContext;
  summary: string;
  createdAt: number;
};
export type LiaAppBridge = {
  getSnapshot(): LiaAppSnapshot;
  reportSymptoms?(
    input: LiaSymptomReportInput,
    signal?: AbortSignal,
  ): Promise<HospitalSymptomReportResult>;
  execute(
    action: LiaAction,
    operationId: string,
    expectedContext: DemoContext,
    signal?: AbortSignal,
  ): LiaExecution | Promise<LiaExecution>;
};

export const LIA_READ_TARGETS = [
  "agenda",
  "journey",
  "documents",
  "requests",
  "checkin",
  "profile",
  "help",
  "messages",
] as const;

/** Validate the provider's proposal; this function never authorizes execution. */
export function parseLiaAction(value: unknown): LiaAction | null {
  if (value === null || value === undefined) return null;
  const invalid = () =>
    new Error("A Lia propôs uma ação inválida. Tente pedir de outra forma.");
  if (typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 3 ||
    !keys.every((key) => ["type", "target", "value"].includes(key))
  )
    throw invalid();
  if (
    typeof record.type !== "string" ||
    !(LIA_ACTION_TYPES as readonly string[]).includes(record.type)
  )
    throw invalid();
  if (
    (record.target !== null && typeof record.target !== "string") ||
    (record.value !== null && typeof record.value !== "string")
  )
    throw invalid();
  const action = {
    type: record.type,
    target: record.target,
    value: record.value,
  } as LiaAction;
  const oneOf = (candidate: string | null, choices: readonly string[]) =>
    candidate !== null && choices.includes(candidate);
  const validId = (candidate: string | null) =>
    candidate !== null &&
    candidate.length >= 1 &&
    candidate.length <= 128 &&
    candidate.trim() === candidate &&
    !Array.from(candidate).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    );
  let valid = false;
  switch (action.type) {
    case "navigate":
      valid = action.value === null && oneOf(action.target, LIA_PAGES);
      break;
    case "read":
      valid = action.value === null && oneOf(action.target, LIA_READ_TARGETS);
      break;
    case "open_appointment":
    case "open_document":
    case "request_reschedule":
      valid = action.value === null && validId(action.target);
      break;
    case "record_wellbeing":
      valid = action.target === null && oneOf(action.value, LIA_FEELINGS);
      break;
    case "request_contact":
      valid = action.target === null && action.value === null;
      break;
    case "set_text_scale":
      valid =
        action.target === null &&
        oneOf(action.value, ["1", "1.25", "1.5", "2"]);
      break;
    case "set_speech_rate":
      valid =
        action.target === null && oneOf(action.value, ["0.8", "1", "1.2"]);
      break;
    case "set_explanation":
      valid =
        action.target === null &&
        oneOf(action.value, ["short", "step_by_step"]);
      break;
  }
  if (!valid) throw invalid();
  return action;
}
