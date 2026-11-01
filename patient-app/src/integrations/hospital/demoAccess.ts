import { HospitalIntegrationError } from "./errors";
import type { DemoService } from "./discovery";
import type { HospitalConnection } from "./connection";
import { authenticatedHospitalSession, hospitalOrigin } from "./connection";
import { readPublicJson } from "./discovery";
import { hospitalFetch } from "../nativeHttp";
import { validId } from "./validation";
export type DemoPatient = { id: string; displayName: string };
export async function startDemoHospital(options: {
  service: DemoService;
  patientId?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<{
  connection: HospitalConnection;
  patients: DemoPatient[];
  service: DemoService;
}> {
  const { service, signal } = options;
  const origin = hospitalOrigin(service.origin, service.allowLocalDemoHttp);
  const fetcher = options.fetch ?? hospitalFetch;
  const raw = await readPublicJson(
    `${origin}/api/mobile/demo-patients`,
    fetcher,
    signal,
  );
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new HospitalIntegrationError("invalid_response");
  const list = raw as Record<string, unknown>;
  if (
    Object.keys(list).sort().join() !== "defaultPatientId,demo,patients" ||
    list.demo !== true ||
    list.defaultPatientId !== service.defaultPatientId ||
    !Array.isArray(list.patients) ||
    !list.patients.length ||
    list.patients.length > 50
  )
    throw new HospitalIntegrationError("invalid_response");
  const patients: DemoPatient[] = list.patients.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new HospitalIntegrationError("invalid_response");
    const item = value as Record<string, unknown>;
    if (
      Object.keys(item).sort().join() !== "displayName,id" ||
      !validId(item.id) ||
      typeof item.displayName !== "string" ||
      !item.displayName.trim() ||
      item.displayName.length > 200 ||
      /[\u0000-\u001f]/.test(item.displayName)
    )
      throw new HospitalIntegrationError("invalid_response");
    return { id: item.id, displayName: item.displayName };
  });
  if (
    new Set(patients.map((item) => item.id)).size !== patients.length ||
    !patients.some((item) => item.id === service.defaultPatientId)
  )
    throw new HospitalIntegrationError("invalid_response");
  const patientId = options.patientId ?? service.defaultPatientId;
  if (!patients.some((item) => item.id === patientId))
    throw new HospitalIntegrationError("scope");
  if (signal?.aborted) throw new HospitalIntegrationError("aborted");
  const response = await fetcher(`${origin}/api/mobile/demo-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ patientId }),
    signal,
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const connection = await authenticatedHospitalSession(response, {
    origin,
    signal,
    allowLocalDemoHttp: service.allowLocalDemoHttp,
    fetch: fetcher,
    expectedScope: { tenantId: "demo", hospitalId: "oncoflow", patientId },
  });
  return { connection, patients, service };
}
