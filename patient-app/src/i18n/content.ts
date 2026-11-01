import type {
  Appointment,
  DemoDocument,
  JourneyEvent,
  Persona,
} from "../../shared/contracts";
import { getLocale, type AppLocale } from "./index";
import { appointments, documents, journey, personas } from "../demo/fixtures";

const personaContent: Record<
  string,
  Pick<Persona, "ageLabel" | "journeyLabel" | "description">
> = {
  marina: {
    ageLabel: "48 years old",
    journeyLabel: "One step at a time",
    description:
      "A journey with appointments, documents, and next steps organized.",
  },
  joao: {
    ageLabel: "62 years old",
    journeyLabel: "Care that stays with you",
    description:
      "A follow-up journey with a schedule and a reference care team.",
  },
  helena: {
    ageLabel: "35 years old",
    journeyLabel: "Clarity to move forward",
    description: "A journey of support and preparation for upcoming meetings.",
  },
};
const appointmentContent: Record<
  string,
  Pick<Appointment, "title" | "category" | "description">
> = {
  "marina-consulta-1": {
    title: "Follow-up appointment",
    category: "Appointment",
    description:
      "A meeting to discuss the journey and review next steps. The details of this appointment are fictional.",
  },
  "marina-navegacao-1": {
    title: "Conversation with the navigation team",
    category: "Support",
    description:
      "A demo space to organize questions, documents, and practical needs.",
  },
  "joao-consulta-1": {
    title: "Return appointment",
    category: "Appointment",
    description:
      "A fictional follow-up to review the journey and organize what comes next.",
  },
  "joao-navegacao-1": {
    title: "Follow-up meeting",
    category: "Navigation",
    description:
      "A fictional conversation about organizing the schedule and everyday questions.",
  },
  "helena-acolhimento-1": {
    title: "Welcome meeting",
    category: "Support",
    description:
      "An initial demo conversation to meet the care team and organize upcoming meetings.",
  },
  "helena-consulta-1": {
    title: "Appointment with the care team",
    category: "Appointment",
    description:
      "A fictional appointment to discuss the available information and next steps.",
  },
};
const journeyContent: Record<
  string,
  Pick<JourneyEvent, "title" | "description">
> = {
  "marina-j1": {
    title: "First welcome meeting",
    description:
      "The fictional care team introduced the journey and follow-up channels.",
  },
  "marina-j2": {
    title: "Documents organized",
    description: "The sample documents were collected in one place.",
  },
  "marina-j3": {
    title: "Preparing for the next meeting",
    description:
      "This is the current stage of the fictional journey. You can check the schedule and note your questions.",
  },
  "marina-j4": {
    title: "Follow-up appointment",
    description: "Next fictional meeting confirmed in the schedule.",
  },
  "marina-j5": {
    title: "Conversation with the navigation team",
    description: "A fictional opportunity to follow up on next steps.",
  },
  "joao-j1": {
    title: "Welcome completed",
    description:
      "First meeting with the fictional care team and introduction to the journey.",
  },
  "joao-j2": {
    title: "Information collected",
    description: "Demo documents and schedule are available to review.",
  },
  "joao-j3": {
    title: "Following the journey",
    description:
      "Current stage of the fictional scenario, with a return appointment scheduled.",
  },
  "joao-j4": {
    title: "Return appointment",
    description: "A fictional meeting to talk with the care team.",
  },
  "joao-j5": {
    title: "Follow-up meeting",
    description: "A fictional navigation conversation about organizing care.",
  },
  "helena-j1": {
    title: "Welcome to the journey",
    description: "Fictional start of follow-up with the care team.",
  },
  "helena-j2": {
    title: "Schedule organized",
    description: "The first fictional meetings were organized.",
  },
  "helena-j3": {
    title: "Getting to know the next steps",
    description:
      "Current stage of the scenario: review the schedule and prepare questions for the meeting.",
  },
  "helena-j4": {
    title: "Welcome meeting",
    description: "A fictional conversation with the navigation team.",
  },
  "helena-j5": {
    title: "Appointment with the care team",
    description: "First fictional appointment recorded in this schedule.",
  },
};

export function localizePersona(
  item: Persona,
  locale: AppLocale = getLocale(),
): Persona {
  const original = personas.find((source) => source.id === item.id) ?? item;
  return {
    ...item,
    ageLabel: original.ageLabel,
    journeyLabel: original.journeyLabel,
    description: original.description,
    ...(locale === "en-US" ? personaContent[item.id] : {}),
  };
}

export function localizeAppointment(
  item: Appointment,
  locale: AppLocale = getLocale(),
): Appointment {
  const original = appointments.find((source) => source.id === item.id) ?? item;
  const canonical = {
    ...item,
    title: original.title,
    category: original.category,
    description: original.description,
    professionalLabel: original.professionalLabel,
    locationLabel: original.locationLabel,
  };
  if (locale !== "en-US" || !appointmentContent[item.id]) return canonical;
  return {
    ...item,
    ...appointmentContent[item.id],
    professionalLabel: item.id.includes("consulta")
      ? "Oncology team · fictional"
      : "Navigation team · fictional",
    locationLabel: original.locationLabel.startsWith("Encontro online")
      ? "Online meeting · simulation"
      : "Care center · fictional facility",
  };
}

export function localizeJourney(
  item: JourneyEvent,
  locale: AppLocale = getLocale(),
): JourneyEvent {
  const original = journey.find((source) => source.id === item.id) ?? item;
  return {
    ...item,
    title: original.title,
    description: original.description,
    ...(locale === "en-US" ? journeyContent[item.id] : {}),
  };
}

export function localizeDocument(
  item: DemoDocument,
  locale: AppLocale = getLocale(),
): DemoDocument {
  const original = documents.find((source) => source.id === item.id) ?? item;
  if (locale !== "en-US")
    return {
      ...item,
      title: original.title,
      typeLabel: original.typeLabel,
      authorLabel: original.authorLabel,
      body: [...original.body],
    };
  const common = { ...item, authorLabel: "Fictional OncoFlow team" };
  if (item.approvedContentId === "demo-guide-v1")
    return {
      ...common,
      title: "Your follow-up guide",
      typeLabel: "Journey guide",
      body: [
        "FICTIONAL — This document was created exclusively to demonstrate OncoFlow navigation.",
        "On the Journey screen, you can find completed meetings, the current stage, and next steps in this scenario.",
        "In Schedule, you can open appointment details and try a rescheduling request. The request does not change the confirmed appointment.",
        "Nothing in this document is individual clinical advice. No real care team monitors this demo.",
      ],
    };
  if (item.approvedContentId === "demo-summary-v1") {
    const firstName =
      { marina: "Marina", joao: "João", helena: "Helena" }[item.personaId] ??
      "the patient";
    return {
      ...common,
      title: "Meeting summary",
      typeLabel: "Fictional summary",
      body: [
        "FICTIONAL — A demo summary with no connection to a real person or institution.",
        `In this scenario, ${firstName} learned about the follow-up plan and had upcoming meetings organized.`,
        "The fictional schedule remains available in the app. Questions can be organized for the next demo conversation.",
        "This summary contains no diagnosis, prescription, or test result and does not replace professional care.",
      ],
    };
  }
  if (item.approvedContentId === "demo-conversation-v1")
    return {
      ...common,
      title: "Preparing for your conversation",
      typeLabel: "Organization",
      body: [
        "FICTIONAL — Organizational material for this demo.",
        "You can use the next-steps list to remember the topics you would like to discuss with your care team.",
        "The content shown here is an example of how approved documents could be presented. Importing real documents is not enabled.",
        "Times, locations, professionals, and records in this version are entirely fictional.",
      ],
    };
  return { ...item, body: [...item.body] };
}
