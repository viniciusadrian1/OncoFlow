export type DemoDisposition =
  "record_only" | "team_review" | "urgent_care" | "unclassified";
export type DemoDecision = {
  matched: boolean;
  disposition: DemoDisposition;
  scenarioId: string;
  scenarioVersion: "2026-10-31.1";
  text: string;
};
export type DemoScenario = {
  id: string;
  title: string;
  phrase: string;
  disposition: DemoDisposition;
  text: string;
};

export const URGENT_COPY =
  "SIMULAÇÃO: neste cenário, a orientação é procurar atendimento de urgência imediatamente, sem aguardar retorno pelo aplicativo. Nenhuma equipe real foi acionada.";
export const UNCLASSIFIED_COPY =
  "Este relato não corresponde à frase do cenário selecionado. A demonstração não determina a gravidade de relatos livres. Se a situação for real, busque atendimento real; nenhuma equipe acompanha este aplicativo.";

export const scenarios: readonly DemoScenario[] = [
  {
    id: "S03",
    title: "Registro de bem-estar",
    phrase: "Hoje estou cansada",
    disposition: "record_only",
    text: "SIMULAÇÃO: o relato de cansaço foi registrado nesta sessão. Registrar não significa avaliar a gravidade ou afirmar que não há risco.",
  },
  {
    id: "S03B",
    title: "Pedido de revisão pela equipe",
    phrase: "Quero conversar com a equipe sobre como estou me sentindo",
    disposition: "team_review",
    text: "SIMULAÇÃO: este cenário demonstra um pedido de revisão pela equipe. Nenhuma equipe real foi acionada. O pedido não representa avaliação clínica.",
  },
  {
    id: "S04",
    title: "Expressão regional ambígua",
    phrase: "Estou agoniada",
    disposition: "unclassified",
    text: "Quando você diz “agoniada”, o que está sentindo? Pode explicar com suas palavras? A expressão pode ter sentidos diferentes; esta demonstração não atribui um sintoma ou gravidade a ela.",
  },
  {
    id: "S05",
    title: "Preservar a negação",
    phrase: "Não estou com falta de ar; estou com enjoo",
    disposition: "unclassified",
    text: "Você relatou que não sente falta de ar e que sente enjoo. São informações diferentes. Esta demonstração não avalia a gravidade desse relato nem conclui que a situação é segura.",
  },
  {
    id: "S06",
    title: "Distinguir passado e presente",
    phrase: "Ontem senti isso, mas agora passou",
    disposition: "unclassified",
    text: "Você descreveu algo que aconteceu ontem e disse que agora passou. O que sentiu ontem? A demonstração mantém essa diferença de tempo, sem concluir que não existe risco.",
  },
  {
    id: "S07",
    title: "Relato sobre outra pessoa",
    phrase: "Minha irmã está com dor",
    disposition: "unclassified",
    text: "Você está falando sobre sua irmã, correto? Este relato não será registrado como um sintoma seu. A demonstração não determina a gravidade da situação dela.",
  },
  {
    id: "S08",
    title: "Orientação urgente e alerta",
    phrase: "Estou com muita falta de ar agora",
    disposition: "urgent_care",
    text: URGENT_COPY,
  },
];

// Deliberately narrow: no accent folding, keyword matching, or clinical inference.
export function normalizeScenarioPhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/u, "")
    .trim();
}

export function evaluateScenario(
  scenarioId: string,
  text: string,
): DemoDecision {
  const scenario = scenarios.find((item) => item.id === scenarioId);
  const matched =
    !!scenario &&
    [scenario.phrase, translate(scenario.phrase, {}, "en-US")].some(
      (phrase) =>
        normalizeScenarioPhrase(phrase) === normalizeScenarioPhrase(text),
    );
  return {
    matched,
    disposition: matched ? scenario.disposition : "unclassified",
    scenarioId,
    scenarioVersion: "2026-10-31.1",
    text: translate(matched ? scenario.text : UNCLASSIFIED_COPY),
  };
}

export function evaluateLiveScenario(
  enabled: boolean,
  scenarioId: string,
  text: string,
): DemoDecision | null {
  return enabled ? evaluateScenario(scenarioId, text) : null;
}
import { translate } from "../../i18n";
