import type {
  DemoContext,
  DemoRequest,
  PatientDataPort,
} from "../../shared/contracts";
import { appointments, DEMO_NOW, documents, journey } from "../demo/fixtures";
import { isCurrent, registerSessionCleanup } from "../app/session";

function requireCurrent(ctx: DemoContext): void {
  if (!isCurrent(ctx)) throw new Error("Sessão encerrada");
}

function copyRequest(request: DemoRequest): DemoRequest {
  return { ...request, context: { ...request.context } };
}

export function createPatientDataPort(): PatientDataPort {
  const recordedRequests = new Map<string, DemoRequest>();
  let sequence = 0;
  registerSessionCleanup(() => {
    recordedRequests.clear();
    sequence = 0;
  });

  return {
    appointments(ctx) {
      requireCurrent(ctx);
      return appointments
        .filter((item) => item.personaId === ctx.personaId)
        .map((item) => ({ ...item }))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    journey(ctx) {
      requireCurrent(ctx);
      return journey
        .filter((item) => item.personaId === ctx.personaId)
        .map((item) => ({ ...item }))
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    },
    documents(ctx) {
      requireCurrent(ctx);
      return documents
        .filter((item) => item.personaId === ctx.personaId)
        .map((item) => ({ ...item, body: [...item.body] }));
    },
    request(ctx, input) {
      requireCurrent(ctx);
      if (!input.idempotencyKey.trim())
        throw new Error("Identificador do pedido obrigatório");
      if (input.type !== "contact" && input.type !== "reschedule")
        throw new Error("Tipo de pedido inválido");
      if (
        input.type === "reschedule" &&
        !appointments.some(
          (item) =>
            item.id === input.appointmentId &&
            item.personaId === ctx.personaId &&
            item.status === "confirmed",
        )
      )
        throw new Error("Consulta indisponível neste perfil");

      const key = `${ctx.sessionId}:${input.idempotencyKey}`;
      const previous = recordedRequests.get(key);
      if (previous) {
        if (
          previous.type !== input.type ||
          previous.appointmentId !== input.appointmentId
        ) {
          throw new Error("Identificador já usado para outro pedido");
        }
        return copyRequest(previous);
      }
      sequence += 1;
      const request: DemoRequest = {
        id: `${ctx.sessionId}-request-${sequence}`,
        context: { ...ctx },
        type: input.type,
        ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
        idempotencyKey: input.idempotencyKey,
        status: "simulated_requested",
        createdAt: DEMO_NOW,
      };
      recordedRequests.set(key, request);
      return copyRequest(request);
    },
    requests(ctx) {
      requireCurrent(ctx);
      return [...recordedRequests.values()]
        .filter((item) => item.context.sessionId === ctx.sessionId)
        .map(copyRequest);
    },
  };
}
