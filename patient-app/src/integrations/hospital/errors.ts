export type HospitalErrorCode =
  | "config"
  | "auth"
  | "scope"
  | "aborted"
  | "network"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server"
  | "invalid_response"
  | "invalid_input";

const messages: Record<HospitalErrorCode, string> = {
  config: "Hospital integration configuration is invalid.",
  auth: "An active authenticated patient session is required.",
  scope: "This session cannot access the requested hospital resource.",
  aborted: "The hospital operation was cancelled.",
  network: "The hospital connection could not be completed.",
  not_found: "The hospital resource was not found.",
  conflict: "This operation conflicts with an existing hospital operation.",
  rate_limited: "The hospital service is temporarily limiting requests.",
  server: "The hospital service could not complete the operation.",
  invalid_response: "The hospital response could not be validated.",
  invalid_input: "The patient operation is invalid or was not confirmed.",
};

/** Contains no raw response, URL, token, input text or underlying exception. */
export class HospitalIntegrationError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: HospitalErrorCode,
    readonly httpStatus?: number,
    readonly outcome?: "unknown",
  ) {
    super(messages[code]);
    this.name = "HospitalIntegrationError";
    this.retryable = ["network", "rate_limited", "server"].includes(code);
  }
}
