import { describe, expect, it, vi } from "vitest";
import type {
  HospitalPatientRepository,
  HospitalSnapshot,
  HospitalWellbeingInput,
} from "../../shared/hospitalContracts";
import {
  createHospitalConnection,
  hospitalOrigin,
  pairHospital,
} from "../../src/integrations/hospital/connection";

const scope = {
  tenantId: "demo",
  hospitalId: "oncoflow",
  patientId: "pac-maria",
};
const now = "2026-10-31T12:00:00Z";
const snapshot = <T>(data: T): HospitalSnapshot<T> => ({
  scope,
  asOf: now,
  data,
});
const identity = {
  scope,
  displayName: "Maria do hospital",
  expiresAt: "2099-10-31T12:00:00Z",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  const repository: HospitalPatientRepository = {
    summary: vi.fn<HospitalPatientRepository["summary"]>(async () =>
      snapshot({
        ...scope,
        id: "summary",
        displayName: "Maria do hospital",
        careTeamLabel: "Equipe de navegação",
      }),
    ),
    appointments: vi.fn<HospitalPatientRepository["appointments"]>(async () =>
      snapshot([]),
    ),
    journey: vi.fn<HospitalPatientRepository["journey"]>(async () =>
      snapshot([]),
    ),
    documents: vi.fn<HospitalPatientRepository["documents"]>(async () =>
      snapshot([]),
    ),
    requests: vi.fn<HospitalPatientRepository["requests"]>(async () =>
      snapshot([]),
    ),
    messages: vi.fn<HospitalPatientRepository["messages"]>(async () =>
      snapshot([]),
    ),
    preferences: vi.fn<HospitalPatientRepository["preferences"]>(async () =>
      snapshot({
        ...scope,
        id: "prefs",
        locale: "pt-BR",
        explanation: "short",
        speechRate: 1,
        textScale: 1,
      }),
    ),
    submitRequest: vi.fn<HospitalPatientRepository["submitRequest"]>(
      async (input) =>
        snapshot({
          ...scope,
          id: "request",
          type: input.type,
          appointmentId: input.appointmentId,
          idempotencyKey: input.idempotencyKey,
          status: "accepted",
          createdAt: now,
          updatedAt: now,
        }),
    ),
    recordWellbeing: vi.fn<HospitalPatientRepository["recordWellbeing"]>(
      async (input) =>
        snapshot({
          ...scope,
          id: "report",
          feeling: input.feeling,
          recordedAt: input.recordedAt,
          createdAt: now,
          idempotencyKey: input.idempotencyKey,
          status: "recorded",
        }),
    ),
    sendMessage: vi.fn<HospitalPatientRepository["sendMessage"]>(
      async (input) =>
        snapshot({
          ...scope,
          id: "message",
          role: "patient",
          authorLabel: "Maria",
          text: input.text,
          createdAt: now,
          status: "recorded",
        }),
    ),
    updatePreferences: vi.fn<HospitalPatientRepository["updatePreferences"]>(
      async (input) =>
        snapshot({
          ...scope,
          id: "prefs",
          locale: input.locale,
          explanation: input.explanation,
          speechRate: input.speechRate,
          textScale: input.textScale,
        }),
    ),
    reportSymptoms: vi.fn<HospitalPatientRepository["reportSymptoms"]>(
      async () => snapshot({ ...scope, status: "not_applicable" }),
    ),
    disconnect: vi.fn(),
  };
  return {
    repository,
    connection: createHospitalConnection(repository, identity),
  };
}

describe("connected patient session", () => {
  it("keeps the server patient identity and publishes a complete read snapshot", async () => {
    const { connection, repository } = setup();
    const gate = deferred<Awaited<ReturnType<typeof repository.messages>>>();
    vi.mocked(repository.messages).mockReturnValueOnce(gate.promise);
    const read = connection.refresh();
    expect(connection.getSnapshot()).toMatchObject({
      status: "loading",
      appointments: [],
      requests: [],
    });
    gate.resolve(
      snapshot([
        {
          ...scope,
          id: "team-message",
          role: "team",
          authorLabel: "Equipe",
          text: "Mensagem publicada",
          createdAt: now,
          status: "recorded",
        },
      ]),
    );
    await read;
    expect(connection.scope.patientId).toBe("pac-maria");
    expect(connection.getSnapshot()).toMatchObject({
      status: "ready",
      summary: { displayName: "Maria do hospital" },
      messages: [{ text: "Mensagem publicada" }],
    });
    expect(JSON.stringify(connection.getSnapshot())).not.toMatch(
      /accessToken|marina/,
    );
  });

  it("does not confirm before acknowledgement and retries the identical report body after uncertain failure", async () => {
    const { connection, repository } = setup();
    const gate =
      deferred<Awaited<ReturnType<typeof repository.recordWellbeing>>>();
    vi.mocked(repository.recordWellbeing).mockReturnValueOnce(gate.promise);
    const write = connection.recordWellbeing({
      feeling: "Náusea",
      idempotencyKey: "same-operation",
    });
    expect(connection.getSnapshot()).toMatchObject({
      savedMood: "",
      pending: 1,
    });
    const input = vi.mocked(repository.recordWellbeing).mock.calls[0]![0];
    gate.resolve(
      snapshot({
        ...scope,
        id: "report",
        feeling: input.feeling,
        recordedAt: input.recordedAt,
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
        status: "recorded",
      }),
    );
    await write;
    expect(connection.getSnapshot()).toMatchObject({
      savedMood: "Náusea",
      pending: 0,
    });

    vi.mocked(repository.recordWellbeing).mockRejectedValueOnce(
      new Error("unknown network outcome"),
    );
    await expect(
      connection.recordWellbeing({
        feeling: "Cansado(a)",
        idempotencyKey: "retry-operation",
      }),
    ).rejects.toThrow();
    const failedInput = vi.mocked(repository.recordWellbeing).mock.calls[1]![0];
    expect(connection.getSnapshot()).toMatchObject({
      savedMood: "Náusea",
      error: "write",
    });
    await connection.recordWellbeing({
      feeling: "Cansado(a)",
      idempotencyKey: "retry-operation",
    });
    expect(vi.mocked(repository.recordWellbeing).mock.calls[2]![0]).toEqual(
      failedInput,
    );
    await connection.recordWellbeing({
      feeling: "Cansado(a)",
      idempotencyKey: "retry-operation",
    });
    expect(repository.recordWellbeing).toHaveBeenCalledTimes(3);
    await expect(
      connection.recordWellbeing({
        feeling: "Bem",
        idempotencyKey: "retry-operation",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("does not let a read started before a write erase the acknowledged request", async () => {
    const { connection, repository } = setup();
    const gate = deferred<Awaited<ReturnType<typeof repository.requests>>>();
    vi.mocked(repository.requests).mockReturnValueOnce(gate.promise);
    const read = connection.refresh();
    await connection.submitRequest({
      type: "contact",
      idempotencyKey: "request-operation",
    });
    expect(connection.getSnapshot().requests).toHaveLength(1);
    gate.resolve(snapshot([]));
    await read;
    expect(connection.getSnapshot().requests).toHaveLength(1);
  });

  it("restores persisted wellbeing and reconciles an uncertain request from a later server read", async () => {
    const { connection, repository } = setup();
    vi.mocked(repository.summary).mockResolvedValue(
      snapshot({
        ...scope,
        id: "summary",
        displayName: identity.displayName,
        careTeamLabel: "Equipe",
        lastWellbeing: { feeling: "Cansado(a)", recordedAt: now },
      }),
    );
    vi.mocked(repository.submitRequest).mockRejectedValueOnce(
      new Error("response lost after server commit"),
    );
    await expect(
      connection.submitRequest({
        type: "contact",
        idempotencyKey: "persisted-operation",
      }),
    ).rejects.toThrow();
    expect(connection.getSnapshot().error).toBe("write");
    vi.mocked(repository.requests).mockResolvedValue(
      snapshot([
        {
          ...scope,
          id: "persisted-request",
          type: "contact",
          status: "in_progress",
          idempotencyKey: "persisted-operation",
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );
    await connection.refresh();
    expect(connection.getSnapshot()).toMatchObject({
      savedMood: "Cansado(a)",
      error: null,
      requests: [{ status: "in_progress" }],
    });
  });

  it("aborts the whole session and discards every late read and write on disconnect", async () => {
    const { connection, repository } = setup();
    const readGate = deferred<Awaited<ReturnType<typeof repository.summary>>>();
    const writeGate =
      deferred<Awaited<ReturnType<typeof repository.recordWellbeing>>>();
    vi.mocked(repository.summary).mockReturnValueOnce(readGate.promise);
    vi.mocked(repository.recordWellbeing).mockReturnValueOnce(
      writeGate.promise,
    );
    const read = connection.refresh();
    const write = connection.recordWellbeing({
      feeling: "Bem",
      idempotencyKey: "late-operation",
    });
    const readSignal = vi.mocked(repository.summary).mock.calls[0]![0]!.signal!;
    const writeSignal = vi.mocked(repository.recordWellbeing).mock.calls[0]![1]!
      .signal!;
    connection.disconnect();
    expect(readSignal.aborted).toBe(true);
    expect(writeSignal.aborted).toBe(true);
    readGate.resolve(
      snapshot({
        ...scope,
        id: "late",
        displayName: "Old patient",
        careTeamLabel: "Team",
      }),
    );
    const input = vi.mocked(repository.recordWellbeing).mock.calls[0]![0];
    writeGate.resolve(
      snapshot({
        ...scope,
        id: "late",
        feeling: "Bem",
        recordedAt: input.recordedAt,
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
        status: "recorded",
      }),
    );
    await read;
    await expect(write).rejects.toMatchObject({ code: "aborted" });
    expect(connection.getSnapshot()).toMatchObject({
      status: "loading",
      savedMood: "",
      requests: [],
      messages: [],
    });
    expect(connection.getSnapshot().summary).toBeUndefined();
  });

  it("propagates ending a voice action to HTTP without ending the connected session", async () => {
    const { connection, repository } = setup();
    const gate =
      deferred<Awaited<ReturnType<typeof repository.recordWellbeing>>>();
    vi.mocked(repository.recordWellbeing).mockReturnValueOnce(gate.promise);
    const voice = new AbortController();
    const write = connection.recordWellbeing(
      { feeling: "Bem", idempotencyKey: "voice-operation" },
      { signal: voice.signal },
    );
    const input: HospitalWellbeingInput = vi.mocked(repository.recordWellbeing)
      .mock.calls[0]![0];
    voice.abort();
    expect(
      vi.mocked(repository.recordWellbeing).mock.calls[0]![1]!.signal!.aborted,
    ).toBe(true);
    gate.resolve(
      snapshot({
        ...scope,
        id: "report",
        feeling: input.feeling,
        recordedAt: input.recordedAt,
        createdAt: now,
        idempotencyKey: input.idempotencyKey,
        status: "recorded",
      }),
    );
    await expect(write).rejects.toMatchObject({ code: "aborted" });
    expect(connection.getSnapshot().savedMood).toBe("");
    await connection.refresh();
    expect(connection.getSnapshot().status).toBe("ready");
  });
});

describe("explicit hospital pairing", () => {
  it("requires HTTPS by default and permits private HTTP only with local-demo opt-in", () => {
    expect(hospitalOrigin("https://hospital.example/")).toBe(
      "https://hospital.example",
    );
    for (const url of [
      "http://192.168.1.3:3000",
      "http://127.0.0.1:3000",
      "https://user:secret@hospital.example",
      "https://hospital.example/path",
      "https://hospital.example?token=secret",
    ])
      expect(() => hospitalOrigin(url)).toThrow();
    expect(hospitalOrigin("http://192.168.1.3:3000", true)).toBe(
      "http://192.168.1.3:3000",
    );
    expect(hospitalOrigin("http://10.0.2.2:3000", true)).toBe(
      "http://10.0.2.2:3000",
    );
    for (const url of [
      "http://evil.example",
      "http://192.169.1.3",
      "http://172.32.0.1",
      "http://8.8.8.8",
    ])
      expect(() => hospitalOrigin(url, true)).toThrow();
  });

  it("binds the repository to the server scope and keeps its credential outside the visible view", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: "secret-pair-token",
          expiresAt: identity.expiresAt,
          scope,
          patient: { displayName: identity.displayName },
          demo: true,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const connection = await pairHospital({
      origin: "https://hospital.example",
      code: "OF-123456",
      fetch: fetcher,
    });
    expect(connection.scope).toEqual(scope);
    expect(JSON.stringify(connection)).not.toContain("secret-pair-token");
    expect(fetcher.mock.calls[0]).toMatchObject([
      "https://hospital.example/api/mobile/pair",
      { method: "POST", body: '{"code":"OF-123456"}', credentials: "omit" },
    ]);
    connection.disconnect();
    await expect(connection.refresh()).rejects.toMatchObject({
      code: "aborted",
    });
  });
});
