export type DemoContext = {
  sessionId: string;
  epoch: number;
  personaId: string;
};
export type Preferences = {
  explanation: "short" | "step_by_step";
  speechRate: 0.8 | 1 | 1.2;
  textScale: 1 | 1.25 | 1.5 | 2;
};

export type Persona = {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  ageLabel: string;
  journeyLabel: string;
  description: string;
  accent: "teal" | "blue" | "lavender";
  simulated: true;
};

export type Appointment = {
  id: string;
  personaId: string;
  startsAt: string;
  title: string;
  locationLabel: string;
  professionalLabel: string;
  category: string;
  description: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  simulated: true;
};

export type JourneyEvent = {
  id: string;
  personaId: string;
  title: string;
  occurredAt: string;
  description: string;
  status: "completed" | "current" | "planned";
  source: "institution_fixture" | "hospital" | "patient_report";
  simulated: true;
};

export type DemoDocument = {
  id: string;
  personaId: string;
  title: string;
  issuedAt: string;
  approvedContentId: string;
  typeLabel: string;
  authorLabel: string;
  body: string[];
  simulated: true;
};

export type DemoRequest = {
  id: string;
  context: DemoContext;
  type: "contact" | "reschedule";
  appointmentId?: string;
  status:
    "simulated_requested" | import("./hospitalContracts").HospitalRequestStatus;
  idempotencyKey: string;
  createdAt: string;
};

export type RequestInput = {
  type: "contact" | "reschedule";
  appointmentId?: string;
  idempotencyKey: string;
};

export interface PatientDataPort {
  appointments(ctx: DemoContext): Appointment[];
  journey(ctx: DemoContext): JourneyEvent[];
  documents(ctx: DemoContext): DemoDocument[];
  request(ctx: DemoContext, input: RequestInput): DemoRequest;
  requests(ctx: DemoContext): DemoRequest[];
}
