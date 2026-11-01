import type {
  HospitalAppointment,
  HospitalDocument,
  HospitalJourneyEvent,
  HospitalPatientRequest,
  HospitalPatientScope,
  HospitalPatientSummary,
  HospitalPreferences,
  HospitalRequestInput,
  HospitalSnapshot,
  HospitalWellbeingInput,
  HospitalWellbeingRecord,
  HospitalMessage,
  HospitalMessageInput,
  HospitalPreferencesInput,
  HospitalCareContext,
  HospitalSymptomReportInput,
  HospitalSymptomReportResult,
} from "../../../shared/hospitalContracts";
import { HospitalIntegrationError } from "./errors";

type ObjectValue = Record<string, unknown>;
const fail = (): never => {
  throw new HospitalIntegrationError("invalid_response");
};
export const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const result = value as ObjectValue;
  if (
    required.some((key) => !(key in result)) ||
    Object.keys(result).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    return fail();
  return result;
}
function text(value: unknown, limit = 200): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > limit ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    return fail();
  return value;
}
function id(value: unknown): string {
  return validId(value) ? value : fail();
}
function date(value: unknown): string {
  const result = text(value, 40);
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      result,
    );
  if (!parts || !Number.isFinite(Date.parse(result))) return fail();
  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    offsetHour = "0",
    offsetMinute = "0",
  ] = parts;
  const maxDay = new Date(
    Date.UTC(Number(year), Number(month), 0),
  ).getUTCDate();
  if (
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > maxDay ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(offsetHour) > 23 ||
    Number(offsetMinute) > 59
  )
    return fail();
  return result;
}
function choice<T extends string | number>(
  value: unknown,
  choices: readonly T[],
): T {
  return choices.includes(value as T) ? (value as T) : fail();
}
const scopeKeys = ["tenantId", "hospitalId", "patientId"];
const recordKeys = [...scopeKeys, "id"];
export function parseScope(value: unknown): HospitalPatientScope {
  const item = object(value, scopeKeys);
  return {
    tenantId: id(item.tenantId),
    hospitalId: id(item.hospitalId),
    patientId: id(item.patientId),
  };
}
function record(item: ObjectValue, scope: HospitalPatientScope) {
  if (
    scopeKeys.some(
      (key) => item[key] !== scope[key as keyof HospitalPatientScope],
    )
  )
    return fail();
  return { ...scope, id: id(item.id) };
}
function optionalText(item: ObjectValue, key: string, limit = 200) {
  return item[key] === undefined ? {} : { [key]: text(item[key], limit) };
}
export function parseSummary(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalPatientSummary {
  const item = object(
    value,
    [...recordKeys, "displayName", "careTeamLabel"],
    ["preferredName", "lastWellbeing", "careContext"],
  );
  return {
    ...record(item, scope),
    displayName: text(item.displayName),
    careTeamLabel: text(item.careTeamLabel),
    ...optionalText(item, "preferredName"),
    ...(item.careContext === undefined
      ? {}
      : { careContext: parseCareContext(item.careContext) }),
    ...(item.lastWellbeing === undefined
      ? {}
      : {
          lastWellbeing: (() => {
            const report = object(item.lastWellbeing, [
              "feeling",
              "recordedAt",
            ]);
            return {
              feeling: text(report.feeling),
              recordedAt: date(report.recordedAt),
            };
          })(),
        }),
  };
}

export function parseCareContext(value: unknown): HospitalCareContext {
  const item = object(
    value,
    ["diagnosisLabel", "sourceLabel", "patientInstructions"],
    ["treatmentLabel", "cycleLabel"],
  );
  if (
    !Array.isArray(item.patientInstructions) ||
    item.patientInstructions.length > 24
  )
    return fail();
  return {
    diagnosisLabel: text(item.diagnosisLabel),
    sourceLabel: text(item.sourceLabel),
    ...optionalText(item, "treatmentLabel"),
    ...optionalText(item, "cycleLabel"),
    patientInstructions: item.patientInstructions.map((instruction) =>
      text(instruction, 4000),
    ),
  };
}

export function parseSymptomReport(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalSymptomReportResult {
  if (
    value &&
    typeof value === "object" &&
    (value as ObjectValue).status === "not_applicable"
  ) {
    const item = object(value, [...scopeKeys, "status"]);
    if (
      scopeKeys.some(
        (key) => item[key] !== scope[key as keyof HospitalPatientScope],
      )
    )
      return fail();
    return { ...scope, status: "not_applicable" };
  }
  const item = object(value, [
    ...recordKeys,
    "text",
    "source",
    "recordedAt",
    "status",
    "alertId",
    "reviewRequired",
    "guidance",
  ]);
  if (item.reviewRequired !== true) return fail();
  return {
    ...record(item, scope),
    text: text(item.text, 4000),
    source: choice(item.source, ["text", "voice"] as const),
    recordedAt: date(item.recordedAt),
    status: choice(item.status, ["recorded"] as const),
    alertId: id(item.alertId),
    reviewRequired: true,
    guidance: text(item.guidance, 4000),
  };
}

export function validateSymptomReportInput(
  value: unknown,
): HospitalSymptomReportInput {
  try {
    const item = object(value, ["text", "source", "locale", "idempotencyKey"]);
    return {
      text: text(item.text, 4000),
      source: choice(item.source, ["text", "voice"] as const),
      locale: choice(item.locale, ["pt-BR", "en-US"] as const),
      idempotencyKey: id(item.idempotencyKey),
    };
  } catch {
    throw new HospitalIntegrationError("invalid_input");
  }
}
export function parseAppointment(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalAppointment {
  const item = object(
    value,
    [
      ...recordKeys,
      "startsAt",
      "title",
      "locationLabel",
      "professionalLabel",
      "status",
    ],
    ["preparation"],
  );
  return {
    ...record(item, scope),
    startsAt: date(item.startsAt),
    title: text(item.title),
    locationLabel: text(item.locationLabel),
    professionalLabel: text(item.professionalLabel),
    ...optionalText(item, "preparation", 4000),
    status: choice(item.status, [
      "scheduled",
      "confirmed",
      "completed",
      "cancelled",
    ] as const),
  };
}
export function parseJourney(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalJourneyEvent {
  const item = object(value, [
    ...recordKeys,
    "title",
    "occurredAt",
    "description",
    "status",
    "source",
  ]);
  return {
    ...record(item, scope),
    title: text(item.title),
    occurredAt: date(item.occurredAt),
    description: text(item.description, 4000),
    status: choice(item.status, ["completed", "current", "planned"] as const),
    source: choice(item.source, ["hospital", "patient_report"] as const),
  };
}
export function parseDocument(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalDocument {
  const item = object(value, [
    ...recordKeys,
    "title",
    "issuedAt",
    "typeLabel",
    "authorLabel",
    "body",
  ]);
  if (!Array.isArray(item.body) || item.body.length > 100) return fail();
  return {
    ...record(item, scope),
    title: text(item.title),
    issuedAt: date(item.issuedAt),
    typeLabel: text(item.typeLabel),
    authorLabel: text(item.authorLabel),
    body: item.body.map((paragraph) => text(paragraph, 4000)),
  };
}
export function parseRequest(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalPatientRequest {
  const item = object(
    value,
    [
      ...recordKeys,
      "type",
      "status",
      "idempotencyKey",
      "createdAt",
      "updatedAt",
    ],
    ["appointmentId"],
  );
  const type = choice(item.type, ["contact", "reschedule"] as const);
  if ((type === "reschedule") !== (item.appointmentId !== undefined))
    return fail();
  return {
    ...record(item, scope),
    type,
    ...(item.appointmentId === undefined
      ? {}
      : { appointmentId: id(item.appointmentId) }),
    status: choice(item.status, [
      "accepted",
      "queued",
      "delivered",
      "read",
      "in_progress",
      "completed",
      "declined",
      "failed",
    ] as const),
    idempotencyKey: id(item.idempotencyKey),
    createdAt: date(item.createdAt),
    updatedAt: date(item.updatedAt),
  };
}
export function parsePreferences(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalPreferences {
  const item = object(value, [
    ...recordKeys,
    "locale",
    "explanation",
    "speechRate",
    "textScale",
  ]);
  return {
    ...record(item, scope),
    locale: choice(item.locale, ["pt-BR", "en-US"] as const),
    explanation: choice(item.explanation, ["short", "step_by_step"] as const),
    speechRate: choice(item.speechRate, [0.8, 1, 1.2] as const),
    textScale: choice(item.textScale, [1, 1.25, 1.5, 2] as const),
  };
}
export function parseWellbeing(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalWellbeingRecord {
  const item = object(
    value,
    [
      ...recordKeys,
      "feeling",
      "recordedAt",
      "createdAt",
      "idempotencyKey",
      "status",
    ],
    ["note"],
  );
  return {
    ...record(item, scope),
    feeling: text(item.feeling),
    ...optionalText(item, "note", 2000),
    recordedAt: date(item.recordedAt),
    createdAt: date(item.createdAt),
    idempotencyKey: id(item.idempotencyKey),
    status: choice(item.status, ["recorded"] as const),
  };
}
export function parseMessage(
  value: unknown,
  scope: HospitalPatientScope,
): HospitalMessage {
  const item = object(value, [
    ...recordKeys,
    "role",
    "authorLabel",
    "text",
    "createdAt",
    "status",
  ]);
  return {
    ...record(item, scope),
    role: choice(item.role, ["patient", "team", "system"] as const),
    authorLabel: text(item.authorLabel),
    text: text(item.text, 4000),
    createdAt: date(item.createdAt),
    status: choice(item.status, ["recorded"] as const),
  };
}

export function validateMessageInput(value: unknown): HospitalMessageInput {
  try {
    const item = object(value, [
      "text",
      "source",
      "idempotencyKey",
      "confirmation",
    ]);
    return {
      text: text(item.text, 4000),
      source: choice(item.source, ["text", "voice"] as const),
      idempotencyKey: id(item.idempotencyKey),
      confirmation: confirmation(item.confirmation),
    };
  } catch {
    throw new HospitalIntegrationError("invalid_input");
  }
}

export function validatePreferencesInput(
  value: unknown,
): HospitalPreferencesInput {
  try {
    const item = object(value, [
      "locale",
      "explanation",
      "speechRate",
      "textScale",
      "idempotencyKey",
    ]);
    return {
      locale: choice(item.locale, ["pt-BR", "en-US"] as const),
      explanation: choice(item.explanation, ["short", "step_by_step"] as const),
      speechRate: choice(item.speechRate, [0.8, 1, 1.2] as const),
      textScale: choice(item.textScale, [1, 1.25, 1.5, 2] as const),
      idempotencyKey: id(item.idempotencyKey),
    };
  } catch {
    throw new HospitalIntegrationError("invalid_input");
  }
}
export function parseList<T>(
  value: unknown,
  scope: HospitalPatientScope,
  parse: (item: unknown, scope: HospitalPatientScope) => T,
): T[] {
  if (!Array.isArray(value) || value.length > 250) return fail();
  const result = value.map((item) => parse(item, scope));
  const ids = result.map((item) => (item as { id: string }).id);
  if (new Set(ids).size !== ids.length) return fail();
  return result;
}
export function parseSnapshot<T>(
  value: unknown,
  scope: HospitalPatientScope,
  resourceType: string,
  parse: (data: unknown, scope: HospitalPatientScope) => T,
): HospitalSnapshot<T> {
  const item = object(value, [
    "apiVersion",
    "resourceType",
    "scope",
    "asOf",
    "data",
  ]);
  if (item.apiVersion !== "1" || item.resourceType !== resourceType)
    return fail();
  const receivedScope = parseScope(item.scope);
  if (
    scopeKeys.some(
      (key) =>
        receivedScope[key as keyof HospitalPatientScope] !==
        scope[key as keyof HospitalPatientScope],
    )
  )
    return fail();
  return {
    scope: receivedScope,
    asOf: date(item.asOf),
    data: parse(item.data, scope),
  };
}
function confirmation(value: unknown) {
  const item = object(value, ["confirmed", "confirmedAt"]);
  if (item.confirmed !== true) return fail();
  return { confirmed: true as const, confirmedAt: date(item.confirmedAt) };
}
export function validateRequestInput(value: unknown): HospitalRequestInput {
  try {
    const item = object(
      value,
      ["type", "idempotencyKey", "confirmation"],
      ["appointmentId"],
    );
    const type = choice(item.type, ["contact", "reschedule"] as const);
    if ((type === "reschedule") !== (item.appointmentId !== undefined))
      return fail();
    return {
      type,
      ...(item.appointmentId === undefined
        ? {}
        : { appointmentId: id(item.appointmentId) }),
      idempotencyKey: id(item.idempotencyKey),
      confirmation: confirmation(item.confirmation),
    };
  } catch {
    throw new HospitalIntegrationError("invalid_input");
  }
}
export function validateWellbeingInput(value: unknown): HospitalWellbeingInput {
  try {
    const item = object(
      value,
      ["feeling", "recordedAt", "idempotencyKey", "confirmation"],
      ["note"],
    );
    return {
      feeling: text(item.feeling),
      ...optionalText(item, "note", 2000),
      recordedAt: date(item.recordedAt),
      idempotencyKey: id(item.idempotencyKey),
      confirmation: confirmation(item.confirmation),
    };
  } catch {
    throw new HospitalIntegrationError("invalid_input");
  }
}
