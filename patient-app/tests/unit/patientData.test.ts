import { beforeEach, describe, expect, it } from "vitest";
import { createSession, resetSession } from "../../src/app/session";
import { createPatientDataPort } from "../../src/adapters/patientData.mock";

describe("fictitious patient data", () => {
  const port = createPatientDataPort();
  beforeEach(() => {
    createSession("marina");
  });

  it("returns only the selected persona and sorts appointments chronologically", () => {
    const ctx = createSession("joao");
    const appointments = port.appointments(ctx);
    expect(appointments.length).toBeGreaterThan(0);
    expect(
      appointments.every((item) => item.personaId === "joao" && item.simulated),
    ).toBe(true);
    expect(appointments.map((item) => item.startsAt)).toEqual(
      appointments.map((item) => item.startsAt).sort(),
    );
    expect(port.journey(ctx).every((item) => item.personaId === "joao")).toBe(
      true,
    );
    expect(port.documents(ctx).every((item) => item.personaId === "joao")).toBe(
      true,
    );
  });

  it("records a rescheduling request without changing a confirmed appointment", () => {
    const ctx = createSession("marina");
    const appointment = port.appointments(ctx)[0]!;
    const request = port.request(ctx, {
      type: "reschedule",
      appointmentId: appointment.id,
      idempotencyKey: "reschedule-1",
    });
    expect(request.status).toBe("simulated_requested");
    expect(port.appointments(ctx)[0]).toEqual(appointment);
    expect(appointment.status).toBe("confirmed");
    expect(port.requests(ctx)).toEqual([request]);
  });

  it("does not duplicate a request when the same action is retried", () => {
    const ctx = createSession("marina");
    const action = { type: "contact" as const, idempotencyKey: "contact-1" };
    const first = port.request(ctx, action);
    const second = port.request(ctx, action);
    expect(first.id).toBe(second.id);
    expect(port.requests(ctx)).toHaveLength(1);
  });

  it("rejects an appointment belonging to a different persona", () => {
    const joao = createSession("joao");
    const otherAppointment = port.appointments(joao)[0]!;
    const marina = createSession("marina");
    expect(() =>
      port.request(marina, {
        type: "reschedule",
        appointmentId: otherAppointment.id,
        idempotencyKey: "wrong-person",
      }),
    ).toThrow("Consulta indisponível neste perfil");
    expect(port.requests(marina)).toEqual([]);
  });

  it("invalidates stale reads and clears request history on reset", () => {
    const previous = createSession("marina");
    port.request(previous, { type: "contact", idempotencyKey: "before-reset" });
    const next = resetSession();
    expect(port.requests(next)).toEqual([]);
    expect(() => port.appointments(previous)).toThrow("Sessão encerrada");
    expect(() =>
      port.request(previous, { type: "contact", idempotencyKey: "stale" }),
    ).toThrow("Sessão encerrada");
  });

  it("returns copies instead of leaking shared fixture objects", () => {
    const ctx = createSession("marina");
    const original = port.appointments(ctx)[0]!.title;
    port.appointments(ctx)[0]!.title = "Changed by UI";
    port.documents(ctx)[0]!.body.push("Changed by UI");
    expect(port.appointments(ctx)[0]!.title).toBe(original);
    expect(port.documents(ctx)[0]!.body).not.toContain("Changed by UI");
  });

  it("rejects reusing an idempotency key for a different request", () => {
    const ctx = createSession("marina");
    port.request(ctx, { type: "contact", idempotencyKey: "same-key" });
    expect(() =>
      port.request(ctx, {
        type: "reschedule",
        appointmentId: port.appointments(ctx)[0]!.id,
        idempotencyKey: "same-key",
      }),
    ).toThrow("Identificador já usado para outro pedido");
  });
});
