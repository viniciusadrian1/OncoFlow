import { translate, useI18n } from "../../i18n";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { AlertTriangle, ChevronRight, ShieldCheck } from "lucide-react";
import {
  evaluateLiveScenario,
  evaluateScenario,
  scenarios,
  type DemoDecision,
} from "./demoScenarioEngine";
import {
  advanceAlert,
  createSafetyState,
  retryAlert,
  runScenario,
  type AlertEventKind,
  type AlertStatus,
} from "./safetyState";
import "./safetyDemo.css";

const labels: Record<AlertEventKind, string> = {
  simulated_pending: "Preparando envio simulado",
  simulated_sent: "Enviado na simulação",
  simulated_received: "Recebido na simulação",
  simulated_assigned: "Assumido na simulação",
  simulated_closed: "Fechado na simulação",
  simulated_failed: "Falha de envio simulada",
  simulated_escalated: "Sem retorno: escalada simulada",
};
const nextActions: Partial<
  Record<AlertStatus, { label: string; event: AlertEventKind }>
> = {
  simulated_sent: { label: "Simular recebimento", event: "simulated_received" },
  simulated_received: {
    label: "Simular equipe assumindo",
    event: "simulated_assigned",
  },
  simulated_assigned: {
    label: "Simular fechamento",
    event: "simulated_closed",
  },
};
export type SafetyDemoHandle = {
  submitLiveReport(
    text: string,
    source: "text" | "provider",
    operationId?: string,
  ): DemoDecision | null;
  previewLiveReport(text: string): DemoDecision | null;
};
type Props = {
  sessionId: string;
  explanation: "short" | "step_by_step";
  ref?: Ref<SafetyDemoHandle>;
  onDecision?(decision: DemoDecision): void;
};

// Remounts on session change, so pending UI and all reports remain session-local.
export function SafetyDemo(props: Props) {
  return <SafetyDemoSession key={props.sessionId} {...props} />;
}

function SafetyDemoSession({ sessionId, explanation, ref, onDecision }: Props) {
  useI18n();
  const [state, setState] = useState(() => createSafetyState(sessionId));
  const [scenarioId, setScenarioId] = useState("S08");
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState(0);
  const [failSend, setFailSend] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(false);
  const liveReportCounter = useRef(0);
  const selected = scenarios.find((scenario) => scenario.id === scenarioId)!;
  const latest = state.reports.at(-1);

  useImperativeHandle(
    ref,
    () => ({
      previewLiveReport(text) {
        return evaluateLiveScenario(liveEnabled, scenarioId, text);
      },
      submitLiveReport(text, source, operationId) {
        const decision = evaluateLiveScenario(liveEnabled, scenarioId, text);
        if (!decision) return null;
        const actionId = operationId ?? `live:${++liveReportCounter.current}`;
        setDraft(text);
        setRevision((value) => value + 1);
        setState((current) =>
          runScenario(current, {
            scenarioId,
            text,
            source,
            operationId: actionId,
            failSend,
          }),
        );
        return decision;
      },
    }),
    [liveEnabled, scenarioId, failSend],
  );

  function execute(source: "scenario" | "text") {
    const text =
      source === "scenario" ? translate(selected.phrase) : draft.trim();
    if (!text) return;
    // Interrupt old audio synchronously, before queuing any state or alert work.
    onDecision?.(evaluateScenario(scenarioId, text));
    if (source === "scenario") setDraft(text);
    setState((current) =>
      runScenario(current, {
        scenarioId,
        text,
        source,
        operationId: `${scenarioId}:${source}:${revision}`,
        failSend,
      }),
    );
  }

  return (
    <section className="safety-demo card" aria-labelledby="safety-demo-heading">
      <div className="safety-demo-title">
        <ShieldCheck aria-hidden="true" />
        <h2 id="safety-demo-heading">
          {translate("Gravidade e alertas · demonstração")}
        </h2>
      </div>
      <p>
        {translate(
          "Explore relatos fictícios e acompanhe um alerta simulado. Nenhuma equipe real é acionada.",
        )}
      </p>
      {liveEnabled && (
        <div className="safety-fixture" role="status">
          <strong>
            {translate("Roteiro ativo na conversa: {title}", {
              title: translate(selected.title),
            })}
          </strong>
          <p>
            {translate(
              "Texto e voz serão comparados somente com este cenário fictício.",
            )}
          </p>
          <button onClick={() => setLiveEnabled(false)}>
            {translate("Desativar roteiro da conversa")}
          </button>
        </div>
      )}
      <details>
        <summary>
          {translate("Explorar cenários fictícios")}{" "}
          <ChevronRight size={20} aria-hidden="true" />
        </summary>
        <div className="safety-controls">
          <p>
            {translate(
              "O resultado é definido pelo roteiro escolhido. Relatos livres não recebem uma avaliação clínica.",
            )}
          </p>
          {explanation === "step_by_step" && (
            <ol>
              <li>
                {translate("Escolha o cenário. Isso ainda não cria um relato.")}
              </li>
              <li>
                {translate(
                  "Execute a frase fictícia ou edite o texto para testar o roteiro.",
                )}
              </li>
              <li>
                {translate("Se houver alerta, avance os eventos manualmente.")}
              </li>
            </ol>
          )}
          <label htmlFor="safety-scenario">
            {translate("Cenário da apresentação")}
          </label>
          <select
            id="safety-scenario"
            value={scenarioId}
            onChange={(event) => {
              setScenarioId(event.target.value);
              setLiveEnabled(false);
              setDraft("");
              setRevision((value) => value + 1);
            }}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {translate(scenario.title)}
              </option>
            ))}
          </select>
          <div className="safety-fixture">
            <strong>{translate("Frase fictícia do roteiro")}</strong>
            <p>“{translate(selected.phrase)}”</p>
          </div>
          <label className="safety-checkbox">
            <input
              type="checkbox"
              checked={liveEnabled}
              onChange={(event) => setLiveEnabled(event.target.checked)}
            />
            <span>{translate("Aplicar este cenário à conversa e à voz")}</span>
          </label>
          <p>
            {translate(
              "Ao ativar, você confirma o uso deste roteiro fictício na conversa. Apenas frases completas cadastradas geram o resultado do cenário; outros relatos ficam sem classificação. Nenhum alerta real é enviado.",
            )}
          </p>
          <label className="safety-checkbox">
            <input
              type="checkbox"
              checked={failSend}
              onChange={(event) => {
                setFailSend(event.target.checked);
                setRevision((value) => value + 1);
              }}
            />
            <span>{translate("Simular falha no envio do próximo alerta")}</span>
          </label>
          <p>
            {translate(
              "Ao executar o relato, você confirma a simulação. Um caso urgente mostra a orientação e cria o alerta fictício imediatamente.",
            )}
          </p>
          <button
            className="safety-primary"
            onClick={() => execute("scenario")}
          >
            {translate("Executar relato fictício")}
          </button>
          <label htmlFor="safety-text">
            {translate("Texto para testar ou corrigir neste cenário")}
          </label>
          <textarea
            id="safety-text"
            value={draft}
            maxLength={1500}
            rows={3}
            onChange={(event) => {
              setDraft(event.target.value);
              setRevision((value) => value + 1);
            }}
            placeholder={translate("Use somente relatos fictícios.")}
          />
          <button disabled={!draft.trim()} onClick={() => execute("text")}>
            {translate("Aplicar roteiro ao texto revisado")}
          </button>
          <p>
            {translate(
              "A frase completa precisa corresponder ao roteiro. Corrigir um relato preserva os alertas anteriores no histórico.",
            )}
          </p>
          {state.reports.length > 0 && (
            <button
              onClick={() => {
                setState(createSafetyState(sessionId));
                setLiveEnabled(false);
                setDraft("");
                setRevision((value) => value + 1);
              }}
            >
              {translate("Reiniciar cenários e limpar histórico simulado")}
            </button>
          )}
        </div>
      </details>

      {latest && (
        <div
          className={`safety-result ${latest.decision.disposition === "urgent_care" ? "safety-urgent" : ""}`}
          role={
            latest.decision.disposition === "urgent_care" ? "alert" : "status"
          }
          data-testid="safety-result"
        >
          <div className="safety-demo-title">
            <AlertTriangle aria-hidden="true" />
            <strong>
              {latest.decision.disposition === "urgent_care"
                ? translate("SIMULAÇÃO · orientação urgente")
                : translate("Resultado do roteiro fictício")}
            </strong>
          </div>
          <p>{evaluateScenario(latest.scenarioId, latest.originalText).text}</p>
          <p>
            {translate("Relato {count} · versão {version} · {source}.", {
              count: state.reports.length,
              version: latest.version,
              source:
                latest.source === "scenario"
                  ? translate("frase inserida pelo cenário, sem gravação")
                  : latest.source === "provider"
                    ? translate("transcrição do provedor")
                    : translate("texto revisado manualmente"),
            })}
          </p>
          {latest.supersedes && (
            <p>
              {translate(
                "Esta é uma nova versão. Alertas do relato anterior continuam registrados.",
              )}
            </p>
          )}
        </div>
      )}

      {state.alerts.length > 0 && (
        <div className="safety-alerts">
          <h3>{translate("Histórico de alertas simulados")}</h3>
          <p>
            {translate(
              "Enviado, recebido e assumido são etapas diferentes. Somente os botões abaixo avançam a simulação.",
            )}
          </p>
          {[...state.alerts].reverse().map((alert) => {
            const action = nextActions[alert.status];
            const report = state.reports.find(
              (item) => item.id === alert.reportId,
            )!;
            return (
              <article
                className="safety-alert"
                key={alert.id}
                aria-label={translate(
                  "Alerta simulado do relato versão {version}",
                  { version: report.version },
                )}
              >
                <strong>{translate(labels[alert.status])}</strong>
                <p>
                  {translate("Relato versão {version}: “{text}”", {
                    version: report.version,
                    text: report.originalText,
                  })}
                </p>
                {report.decision.disposition === "urgent_care" && (
                  <p>
                    {
                      evaluateScenario(report.scenarioId, report.originalText)
                        .text
                    }
                  </p>
                )}
                {alert.status === "simulated_failed" && (
                  <>
                    <p>
                      {translate(
                        "O envio fictício falhou. A orientação continua válida dentro do cenário; não espere retorno pelo aplicativo em uma situação real.",
                      )}
                    </p>
                    <button
                      onClick={() =>
                        setState((current) => retryAlert(current, alert.id))
                      }
                    >
                      {translate("Tentar envio simulado novamente")}
                    </button>
                  </>
                )}
                {action && (
                  <button
                    onClick={() =>
                      setState((current) =>
                        advanceAlert(current, alert.id, action.event),
                      )
                    }
                  >
                    {translate(action.label)}
                  </button>
                )}
                {alert.status === "simulated_sent" &&
                  !alert.events.some(
                    (event) => event.kind === "simulated_escalated",
                  ) && (
                    <button
                      onClick={() =>
                        setState((current) =>
                          advanceAlert(
                            current,
                            alert.id,
                            "simulated_escalated",
                          ),
                        )
                      }
                    >
                      {translate("Simular ausência de retorno")}
                    </button>
                  )}
                {alert.status === "simulated_closed" && (
                  <p>
                    {translate(
                      "Fechado apenas na simulação. Isso não significa que um sintoma foi resolvido.",
                    )}
                  </p>
                )}
                <ol>
                  {alert.events.map((event) => (
                    <li key={event.sequence}>
                      {translate(labels[event.kind])}
                    </li>
                  ))}
                </ol>
              </article>
            );
          })}
        </div>
      )}
      {state.reports.length > 0 && (
        <details>
          <summary>
            {translate("Ver relatos desta sessão")}{" "}
            <ChevronRight size={20} aria-hidden="true" />
          </summary>
          <ol className="safety-report-history">
            {state.reports.map((report) => (
              <li key={report.id}>
                <strong>
                  {translate("{id} · versão {version}", {
                    id: report.scenarioId,
                    version: report.version,
                  })}
                </strong>
                <p>“{report.originalText}”</p>
                <p>
                  {report.decision.matched
                    ? translate("Frase reconhecida no roteiro.")
                    : translate("Sem correspondência: gravidade não avaliada.")}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
