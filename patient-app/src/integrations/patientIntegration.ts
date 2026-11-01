import type { HospitalPatientRepository } from "../../shared/hospitalContracts";
import {
  createHospitalRepository,
  type HospitalRepositoryOptions,
} from "./hospital/repository";

export type PatientIntegrationConfig =
  { mode: "demo" } | { mode: "hospital"; hospital: HospitalRepositoryOptions };

export type PatientIntegration =
  | { mode: "demo" }
  | { mode: "hospital"; repository: HospitalPatientRepository };

/** An explicit future application boundary. This does not replace the sync demo port. */
export function createPatientIntegration(
  config: PatientIntegrationConfig = { mode: "demo" },
): PatientIntegration {
  if (config.mode === "demo") return { mode: "demo" };
  return {
    mode: "hospital",
    repository: createHospitalRepository(config.hospital),
  };
}
