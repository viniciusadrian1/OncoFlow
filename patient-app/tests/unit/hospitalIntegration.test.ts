import { describe, expect, it, vi } from "vitest";
import {
  createHospitalRepository,
  HospitalIntegrationError,
  type HospitalRepositoryOptions,
} from "../../src/integrations/hospital/repository";
import { createPatientIntegration } from "../../src/integrations/patientIntegration";

const scope = {
  tenantId: "tenant-1",
  hospitalId: "hospital-1",
  patientId: "patient-1",
};
const now = "2026-10-31T12:00:00Z";
const scoped = { ...scope, id: "record-1" };
const summary = {
  ...scoped,
  displayName: "Paciente de teste",
  preferredName: "Paciente",
  careTeamLabel: "Equipe de teste",
};
const appointment = {
  ...scoped,
  startsAt: now,
  title: "Consulta",
  locationLabel: "Unidade 1",
  professionalLabel: "Equipe",
  status: "confirmed",
};
const request = {
  ...scoped,
  type: "contact",
  status: "accepted",
  createdAt: now,
  updatedAt: now,
  idempotencyKey: "operation-1",
};
const envelope = (resourceType: string, data: unknown, override = {}) => ({
  apiVersion: "1",
  resourceType,
  scope,
  asOf: now,
  data,
  ...override,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function setup(response = json(envelope("patient_summary", summary))) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  const getAccessToken = vi.fn().mockResolvedValue("secret-access-token");
  const options: HospitalRepositoryOptions = {
    baseUrl: "https://hospital.example/api/v1",
    allowedOrigins: ["https://hospital.example"],
    authentication: {
      scope: { ...scope },
      subjectId: "authenticated-subject",
      sessionId: "authenticated-session",
      isSessionActive: () => true,
      getAccessToken,
    },
    fetch: fetcher,
  };
  return { options, fetcher, getAccessToken };
}

describe("proposed hospital integration boundary", () => {
  it("defaults to demo and does not instantiate a hospital connection", () => {
    expect(createPatientIntegration()).toEqual({ mode: "demo" });
    expect(createPatientIntegration({ mode: "demo" })).toEqual({
      mode: "demo",
    });
  });

  it("requires explicit hospital configuration and allowlisted HTTPS origins", () => {
    const { options, fetcher } = setup();
    for (const baseUrl of [
      "http://hospital.example/api/v1",
      "https://other.example/api/v1",
      "https://secret@hospital.example/api/v1",
      "https://hospital.example/api/v1?token=secret",
      "https://hospital.example/api/v1#patient",
    ]) {
      expect(() => createHospitalRepository({ ...options, baseUrl })).toThrow(
        HospitalIntegrationError,
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(() =>
      createPatientIntegration({ mode: "hospital" } as never),
    ).toThrow(HospitalIntegrationError);
  });

  it("uses only the captured authenticated patient scope and memory token", async () => {
    const { options, fetcher, getAccessToken } = setup();
    const repository = createHospitalRepository(options);
    options.authentication.scope.patientId = "mutated-patient";
    const result = await repository.summary();
    expect(result.data.displayName).toBe(summary.displayName);
    expect(result.scope.patientId).toBe("patient-1");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      "https://hospital.example/api/v1/tenants/tenant-1/hospitals/hospital-1/patients/patient-1/summary",
    );
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { Authorization: "Bearer secret-access-token" },
    });
    expect(getAccessToken.mock.calls[0]![0]).toMatchObject({
      subjectId: "authenticated-subject",
      patientId: "patient-1",
    });
    expect(JSON.stringify({ url, body: init?.body })).not.toMatch(
      /secret-access-token|personaId|marina|joao/,
    );
  });

  it("rejects missing authentication before fetching and sanitizes token failures", async () => {
    const { options, fetcher, getAccessToken } = setup();
    getAccessToken.mockResolvedValueOnce(null);
    const repository = createHospitalRepository(options);
    await expect(repository.summary()).rejects.toMatchObject({ code: "auth" });
    getAccessToken.mockRejectedValueOnce(
      new Error("secret-access-token private patient details"),
    );
    const failure = await repository.summary().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(HospitalIntegrationError);
    expect(String(failure)).not.toMatch(/secret-access-token|private patient/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects unsafe identity segments and checks a session again after token acquisition", async () => {
    const { options, fetcher, getAccessToken } = setup();
    expect(() =>
      createHospitalRepository({
        ...options,
        authentication: {
          ...options.authentication,
          scope: { ...scope, patientId: "../marina" },
        },
      }),
    ).toThrow(HospitalIntegrationError);
    let active = true;
    options.authentication.isSessionActive = () => active;
    getAccessToken.mockImplementationOnce(async () => {
      active = false;
      return "secret-access-token";
    });
    await expect(
      createHospitalRepository(options).summary(),
    ).rejects.toMatchObject({
      code: "auth",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      "wrong patient",
      envelope("patient_summary", summary, {
        scope: { ...scope, patientId: "other" },
      }),
    ],
    [
      "wrong tenant record",
      envelope("patient_summary", { ...summary, tenantId: "other" }),
    ],
    [
      "wrong hospital record",
      envelope("patient_summary", { ...summary, hospitalId: "other" }),
    ],
    ["wrong resource", envelope("documents", summary)],
    [
      "wrong API version",
      envelope("patient_summary", summary, { apiVersion: "2" }),
    ],
    ["invalid record type", envelope("patient_summary", [])],
  ])("rejects %s without exposing payloads", async (_label, body) => {
    const { options } = setup(json(body));
    const failure = await createHospitalRepository(options)
      .summary()
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: "invalid_response" });
    expect(String(failure)).not.toContain(summary.displayName);
  });

  it("reads all supported resources using validated server snapshots", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    const cases = [
      ["appointments", [appointment], () => repository.appointments()],
      [
        "journey",
        [
          {
            ...scoped,
            title: "Etapa",
            occurredAt: now,
            description: "Planejada",
            status: "planned",
            source: "hospital",
          },
        ],
        () => repository.journey(),
      ],
      [
        "documents",
        [
          {
            ...scoped,
            title: "Orientações",
            issuedAt: now,
            typeLabel: "Orientação",
            authorLabel: "Equipe",
            body: ["Texto fornecido pela equipe"],
          },
        ],
        () => repository.documents(),
      ],
      ["requests", [request], () => repository.requests()],
      [
        "preferences",
        {
          ...scoped,
          locale: "en-US",
          explanation: "short",
          speechRate: 1,
          textScale: 1.25,
        },
        () => repository.preferences(),
      ],
    ] as const;
    for (const [resource, data, read] of cases) {
      fetcher.mockResolvedValueOnce(json(envelope(resource, data)));
      const snapshot = await read();
      expect(snapshot.asOf).toBe(now);
      expect(snapshot.data).toEqual(data);
    }
  });

  it.each(["simulated_requested", "success", "clinician_notified"])(
    "rejects unsupported server request status %s",
    async (status) => {
      const { options } = setup(
        json(envelope("requests", [{ ...request, status }])),
      );
      await expect(
        createHospitalRepository(options).requests(),
      ).rejects.toMatchObject({ code: "invalid_response" });
    },
  );

  it("accepts supported patient language preferences and rejects an unsupported locale", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    for (const locale of ["pt-BR", "en-US"]) {
      fetcher.mockResolvedValueOnce(
        json(
          envelope("preferences", {
            ...scoped,
            locale,
            explanation: "short",
            speechRate: 1,
            textScale: 1,
          }),
        ),
      );
      expect((await repository.preferences()).data.locale).toBe(locale);
    }
    fetcher.mockResolvedValueOnce(
      json(
        envelope("preferences", {
          ...scoped,
          locale: "fr-FR",
          explanation: "short",
          speechRate: 1,
          textScale: 1,
        }),
      ),
    );
    await expect(repository.preferences()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("does not return a late result after logout or disconnect", async () => {
    const { options, fetcher } = setup();
    let active = true;
    options.authentication.isSessionActive = () => active;
    fetcher.mockImplementationOnce(async () => {
      active = false;
      return json(envelope("patient_summary", summary));
    });
    const repository = createHospitalRepository(options);
    await expect(repository.summary()).rejects.toMatchObject({ code: "auth" });
    active = true;
    repository.disconnect();
    await expect(repository.summary()).rejects.toMatchObject({ code: "auth" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("propagates abort signals and rejects already aborted operations before auth", async () => {
    const { options, fetcher, getAccessToken } = setup();
    const controller = new AbortController();
    controller.abort();
    const repository = createHospitalRepository(options);
    await expect(
      repository.summary({ signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(getAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    const liveController = new AbortController();
    fetcher.mockImplementationOnce(async (_url, init) => {
      expect(init?.signal).toBe(liveController.signal);
      liveController.abort();
      throw new DOMException("private detail", "AbortError");
    });
    await expect(
      repository.summary({ signal: liveController.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
  });

  it("bounds payloads and rejects non-JSON, malformed JSON and long clinical text", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    for (const response of [
      new Response("private detail", {
        headers: { "Content-Type": "text/html" },
      }),
      new Response("{ private detail", {
        headers: { "Content-Type": "application/json" },
      }),
      new Response(" ".repeat(262145), {
        headers: { "Content-Type": "application/json" },
      }),
      json(
        envelope("patient_summary", {
          ...summary,
          displayName: "x".repeat(201),
        }),
      ),
    ]) {
      fetcher.mockResolvedValueOnce(response);
      await expect(repository.summary()).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });

  it.each([
    [401, "auth", false],
    [403, "scope", false],
    [404, "not_found", false],
    [409, "conflict", false],
    [429, "rate_limited", true],
    [503, "server", true],
  ])("maps HTTP %s to a bounded %s error", async (status, code, retryable) => {
    const { options, fetcher } = setup(
      new Response("Bearer secret-access-token private details", { status }),
    );
    const failure = await createHospitalRepository(options)
      .summary()
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({ code, retryable, httpStatus: status });
    expect(String(failure)).not.toMatch(/secret-access-token|private details/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("submits only patient-confirmed requests with stable caller idempotency and actual accepted status", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    const input = {
      type: "contact",
      idempotencyKey: "operation-1",
      confirmation: { confirmed: true, confirmedAt: now },
    } as const;
    for (let attempt = 0; attempt < 2; attempt++) {
      fetcher.mockResolvedValueOnce(
        json(envelope("request", request), attempt ? 200 : 202),
      );
      const result = await repository.submitRequest(input);
      expect(result.data.status).toBe("accepted");
      expect(result.data).not.toHaveProperty("deliveredAt");
    }
    const writes = fetcher.mock.calls;
    expect(writes[0]![1]?.body).toBe(writes[1]![1]?.body);
    expect(writes[0]![1]).toMatchObject({
      method: "POST",
      headers: { "Idempotency-Key": "operation-1" },
    });
    expect(JSON.parse(String(writes[0]![1]?.body))).toEqual(input);
    await expect(
      repository.submitRequest({
        ...input,
        type: "reschedule",
        appointmentId: "appointment-1",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects unconfirmed actions and invalid request shapes without fetching", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    for (const input of [
      { type: "contact", idempotencyKey: "operation-1" },
      {
        type: "contact",
        idempotencyKey: "operation-1",
        confirmation: { confirmed: false, confirmedAt: now },
      },
      {
        type: "reschedule",
        idempotencyKey: "operation-1",
        confirmation: { confirmed: true, confirmedAt: now },
      },
      {
        type: "change_treatment",
        idempotencyKey: "operation-1",
        confirmation: { confirmed: true, confirmedAt: now },
      },
      {
        type: "contact",
        idempotencyKey: "Bearer secret",
        confirmation: { confirmed: true, confirmedAt: now },
      },
    ]) {
      await expect(
        repository.submitRequest(input as never),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not automatically retry POST network failures and marks the result unknown", async () => {
    const { options, fetcher } = setup();
    fetcher.mockRejectedValueOnce(
      new Error("secret-access-token server hostname"),
    );
    const repository = createHospitalRepository(options);
    const input = {
      type: "contact",
      idempotencyKey: "operation-1",
      confirmation: { confirmed: true, confirmedAt: now },
    } as const;
    const failure = await repository
      .submitRequest(input)
      .catch((e: unknown) => e);
    expect(failure).toMatchObject({
      code: "network",
      outcome: "unknown",
      retryable: true,
    });
    expect(String(failure)).not.toMatch(/secret-access-token|hostname/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retains an unknown write outcome when the caller aborts after dispatch", async () => {
    const { options, fetcher } = setup();
    const controller = new AbortController();
    fetcher.mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException("not exposed", "AbortError");
    });
    await expect(
      createHospitalRepository(options).submitRequest(
        {
          type: "contact",
          idempotencyKey: "operation-1",
          confirmation: { confirmed: true, confirmedAt: now },
        },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "aborted", outcome: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-patient list entries, invalid dates and duplicate record IDs", async () => {
    const { options, fetcher } = setup();
    const repository = createHospitalRepository(options);
    for (const data of [
      [{ ...appointment, patientId: "other-patient" }],
      [{ ...appointment, startsAt: "2026-02-30T12:00:00Z" }],
      [appointment, appointment],
      [{ ...appointment, status: "simulated_confirmed" }],
    ]) {
      fetcher.mockResolvedValueOnce(json(envelope("appointments", data)));
      await expect(repository.appointments()).rejects.toMatchObject({
        code: "invalid_response",
      });
    }
  });

  it("rejects a write response for a different operation rather than announcing success", async () => {
    const { options } = setup(
      json(
        envelope("request", {
          ...request,
          type: "reschedule",
          appointmentId: "another-appointment",
        }),
        202,
      ),
    );
    await expect(
      createHospitalRepository(options).submitRequest({
        type: "contact",
        idempotencyKey: "operation-1",
        confirmation: { confirmed: true, confirmedAt: now },
      }),
    ).rejects.toMatchObject({ code: "invalid_response", outcome: "unknown" });
  });

  it("records confirmed wellbeing as a patient report without creating a clinical alert", async () => {
    const input = {
      feeling: "Cansado",
      note: "Quero registrar como estou.",
      recordedAt: now,
      idempotencyKey: "wellbeing-1",
      confirmation: { confirmed: true, confirmedAt: now },
    } as const;
    const record = {
      ...scoped,
      feeling: input.feeling,
      note: input.note,
      recordedAt: now,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
      status: "recorded",
    };
    const { options, fetcher } = setup(
      json(envelope("wellbeing_record", record), 201),
    );
    const result =
      await createHospitalRepository(options).recordWellbeing(input);
    expect(result.data).toEqual(record);
    expect(fetcher.mock.calls[0]![0]).toMatch(/\/wellbeing$/);
    expect(fetcher.mock.calls[0]![1]?.body).not.toMatch(
      /triage|urgency|alert|treatment/,
    );
  });
});
