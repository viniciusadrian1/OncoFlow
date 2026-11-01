/** Proposed patient-facing API v1. These types do not represent demo fixtures or FHIR. */
export type HospitalPatientScope = {
  tenantId: string;
  hospitalId: string;
  patientId: string;
};

export type HospitalRecord = HospitalPatientScope & { id: string };

/** Server time for this response, not a claim that cached data is current. */
export type HospitalSnapshot<T> = {
  scope: HospitalPatientScope;
  asOf: string;
  data: T;
};

export type HospitalPatientSummary = HospitalRecord & {
  displayName: string;
  preferredName?: string;
  careTeamLabel: string;
  lastWellbeing?: { feeling: string; recordedAt: string };
  careContext?: HospitalCareContext;
};

/** Confirmed registry facts and patient-published instructions; no inferred clinical state. */
export type HospitalCareContext = {
  diagnosisLabel: string;
  treatmentLabel?: string;
  cycleLabel?: string;
  sourceLabel: string;
  patientInstructions: string[];
};

export type HospitalSymptomReportInput = {
  text: string;
  source: "text" | "voice";
  locale: "pt-BR" | "en-US";
  idempotencyKey: string;
};

/** This receipt confirms storage and a pending review, never clinical severity or delivery to a clinician. */
export type HospitalSymptomReportResult =
  | (HospitalPatientScope & { status: "not_applicable" })
  | (HospitalRecord & {
      text: string;
      source: "text" | "voice";
      recordedAt: string;
      status: "recorded";
      alertId: string;
      reviewRequired: true;
      guidance: string;
    });

export type HospitalAppointment = HospitalRecord & {
  startsAt: string;
  title: string;
  locationLabel: string;
  professionalLabel: string;
  preparation?: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
};

export type HospitalJourneyEvent = HospitalRecord & {
  title: string;
  occurredAt: string;
  description: string;
  status: "completed" | "current" | "planned";
  source: "hospital" | "patient_report";
};

/** Hospital-authored display text. No arbitrary remote attachment URL is fetched. */
export type HospitalDocument = HospitalRecord & {
  title: string;
  issuedAt: string;
  typeLabel: string;
  authorLabel: string;
  body: string[];
};

export type HospitalRequestStatus =
  | "accepted"
  | "queued"
  | "delivered"
  | "read"
  | "in_progress"
  | "completed"
  | "declined"
  | "failed";

/** Acceptance is storage/queue acceptance; only the server can report later states. */
export type HospitalPatientRequest = HospitalRecord & {
  type: "contact" | "reschedule";
  appointmentId?: string;
  status: HospitalRequestStatus;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type HospitalPreferences = HospitalRecord & {
  /** Interface preference only; clinical source text is not translated by this adapter. */
  locale: "pt-BR" | "en-US";
  explanation: "short" | "step_by_step";
  speechRate: 0.8 | 1 | 1.2;
  textScale: 1 | 1.25 | 1.5 | 2;
};

export type PatientConfirmation = {
  confirmed: true;
  confirmedAt: string;
};

/** No appointment change occurs when submitting a rescheduling request. */
export type HospitalRequestInput = {
  type: "contact" | "reschedule";
  appointmentId?: string;
  idempotencyKey: string;
  confirmation: PatientConfirmation;
};

/** This report is not an assessment, alert, delivery receipt or treatment instruction. */
export type HospitalWellbeingInput = {
  feeling: string;
  note?: string;
  recordedAt: string;
  idempotencyKey: string;
  confirmation: PatientConfirmation;
};

export type HospitalWellbeingRecord = HospitalRecord & {
  feeling: string;
  note?: string;
  recordedAt: string;
  createdAt: string;
  idempotencyKey: string;
  status: "recorded";
};

export type HospitalReadOptions = { signal?: AbortSignal };

export type HospitalMessage = HospitalRecord & {
  role: "patient" | "team" | "system";
  authorLabel: string;
  text: string;
  createdAt: string;
  status: "recorded";
};

export type HospitalMessageInput = {
  text: string;
  source: "text" | "voice";
  idempotencyKey: string;
  confirmation: PatientConfirmation;
};

export type HospitalPreferencesInput = Pick<
  HospitalPreferences,
  "locale" | "explanation" | "speechRate" | "textScale"
> & { idempotencyKey: string };

/** Bound to one authenticated patient. Callers cannot choose a scope per operation. */
export interface HospitalPatientRepository {
  summary(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalPatientSummary>>;
  appointments(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalAppointment[]>>;
  journey(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalJourneyEvent[]>>;
  documents(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalDocument[]>>;
  requests(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalPatientRequest[]>>;
  preferences(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalPreferences>>;
  messages(
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalMessage[]>>;
  sendMessage(
    input: HospitalMessageInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalMessage>>;
  updatePreferences(
    input: HospitalPreferencesInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalPreferences>>;
  submitRequest(
    input: HospitalRequestInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalPatientRequest>>;
  recordWellbeing(
    input: HospitalWellbeingInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalWellbeingRecord>>;
  reportSymptoms(
    input: HospitalSymptomReportInput,
    options?: HospitalReadOptions,
  ): Promise<HospitalSnapshot<HospitalSymptomReportResult>>;
  /** Invalidate on logout/patient switch; no late result may update the old session. */
  disconnect(): void;
}
