import { evaluateScenario, type DemoDecision } from "./demoScenarioEngine";

export type AlertStatus =
  | "simulated_pending"
  | "simulated_sent"
  | "simulated_received"
  | "simulated_assigned"
  | "simulated_closed"
  | "simulated_failed";
export type AlertEventKind = AlertStatus | "simulated_escalated";
export type AlertEvent = {
  sequence: number;
  kind: AlertEventKind;
  simulated: true;
};
export type ScenarioReport = {
  id: string;
  operationId: string;
  scenarioId: string;
  originalText: string;
  source: "scenario" | "text" | "provider";
  version: number;
  supersedes?: string;
  decision: DemoDecision;
};
export type ScenarioAlert = {
  id: string;
  reportId: string;
  status: AlertStatus;
  events: AlertEvent[];
  simulated: true;
};
export type SafetyState = {
  sessionId: string;
  reports: ScenarioReport[];
  alerts: ScenarioAlert[];
};
type ScenarioInput = {
  scenarioId: string;
  text: string;
  operationId: string;
  source: "scenario" | "text" | "provider";
  failSend?: boolean;
};

export function createSafetyState(sessionId: string): SafetyState {
  return { sessionId, reports: [], alerts: [] };
}

export function runScenario(
  state: SafetyState,
  input: ScenarioInput,
): SafetyState {
  if (state.reports.some((report) => report.operationId === input.operationId))
    return state;
  const previous = [...state.reports]
    .reverse()
    .find((report) => report.scenarioId === input.scenarioId);
  // Re-submitting the same report through another button is not a correction.
  if (
    previous === state.reports.at(-1) &&
    previous?.originalText === input.text
  )
    return state;
  const report: ScenarioReport = {
    id: `${state.sessionId}:report:${state.reports.length + 1}`,
    operationId: input.operationId,
    scenarioId: input.scenarioId,
    originalText: input.text,
    source: input.source,
    version: (previous?.version ?? 0) + 1,
    supersedes: previous?.id,
    decision: evaluateScenario(input.scenarioId, input.text),
  };
  const shouldAlert = ["urgent_care", "team_review"].includes(
    report.decision.disposition,
  );
  const status: AlertStatus = input.failSend
    ? "simulated_failed"
    : "simulated_sent";
  const alerts = shouldAlert
    ? [
        ...state.alerts,
        {
          id: `${state.sessionId}:alert:${state.alerts.length + 1}`,
          reportId: report.id,
          status,
          simulated: true as const,
          events: [
            {
              sequence: 1,
              kind: "simulated_pending" as const,
              simulated: true as const,
            },
            { sequence: 2, kind: status, simulated: true as const },
          ],
        },
      ]
    : state.alerts;
  return { ...state, reports: [...state.reports, report], alerts };
}

export function retryAlert(state: SafetyState, alertId: string): SafetyState {
  const target = state.alerts.find((alert) => alert.id === alertId);
  if (!target || target.status !== "simulated_failed") return state;
  return {
    ...state,
    alerts: state.alerts.map((alert) =>
      alert === target
        ? {
            ...alert,
            status: "simulated_sent",
            events: [
              ...alert.events,
              {
                sequence: alert.events.length + 1,
                kind: "simulated_pending",
                simulated: true,
              },
              {
                sequence: alert.events.length + 2,
                kind: "simulated_sent",
                simulated: true,
              },
            ],
          }
        : alert,
    ),
  };
}

const nextEvent: Partial<Record<AlertStatus, AlertStatus>> = {
  simulated_sent: "simulated_received",
  simulated_received: "simulated_assigned",
  simulated_assigned: "simulated_closed",
};

export function advanceAlert(
  state: SafetyState,
  alertId: string,
  event: AlertEventKind,
): SafetyState {
  const target = state.alerts.find((alert) => alert.id === alertId);
  if (!target) return state;
  const escalation = event === "simulated_escalated";
  if (escalation) {
    if (
      target.status !== "simulated_sent" ||
      target.events.some((item) => item.kind === event)
    )
      return state;
  } else if (nextEvent[target.status] !== event) return state;
  return {
    ...state,
    alerts: state.alerts.map((alert) =>
      alert === target
        ? {
            ...alert,
            status: escalation ? alert.status : (event as AlertStatus),
            events: [
              ...alert.events,
              {
                sequence: alert.events.length + 1,
                kind: event,
                simulated: true,
              },
            ],
          }
        : alert,
    ),
  };
}
