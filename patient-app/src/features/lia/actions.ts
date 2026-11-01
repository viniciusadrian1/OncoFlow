import { getLocale, translate } from "../../i18n";
import type { DemoContext } from "../../../shared/contracts";
import {
  parseLiaAction,
  type LiaAction,
  type LiaAppBridge,
  type LiaAppSnapshot,
  type LiaExecution,
  type PendingLiaAction,
} from "../../../shared/liaActions";
import { DEMO_NOW, DEMO_TIMEZONE } from "../../demo/fixtures";

const confirmationLifetimeMs = 120_000;
let operationSequence = 0;
const positiveAnswers = new Set([
  "yes",
  "confirm",
  "i confirm",
  "yes confirm",
  "yes please",
  "go ahead",
  "yes go ahead",
  "please confirm",
  "confirm it",
  "do it",
  "yes do it",
  "sim",
  "confirmo",
  "confirmar",
  "pode",
  "pode sim",
  "sim pode",
  "sim confirmo",
  "sim confirmar",
  "pode confirmar",
  "sim pode confirmar",
  "pode registrar",
  "sim pode registrar",
  "pode salvar",
  "sim pode salvar",
  "pode fazer",
  "sim pode fazer",
]);
const negativeAnswers = new Set([
  "no",
  "cancel",
  "no cancel",
  "cancel it",
  "please cancel",
  "no thanks",
  "no thank you",
  "not now",
  "never mind",
  "do not confirm",
  "dont confirm",
  "nao",
  "nao quero",
  "nao quero mais",
  "nao pode",
  "nao precisa",
  "nao confirmar",
  "nao confirme",
  "nao cancelar",
  "cancelar",
  "cancela",
  "cancele",
  "pode cancelar",
  "agora nao",
  "deixa pra la",
  "deixa para la",
  "nao obrigado",
  "nao obrigada",
]);
const rejected = (text: string): LiaExecution => ({ status: "rejected", text });
const noPending = () =>
  rejected(
    translate(
      "Não há uma ação aguardando confirmação. Diga o que você quer fazer.",
    ),
  );
const sameContext = (a: DemoContext, b: DemoContext) =>
  a.sessionId === b.sessionId &&
  a.epoch === b.epoch &&
  a.personaId === b.personaId;
const clonePending = (pending: PendingLiaAction): PendingLiaAction => ({
  ...pending,
  context: { ...pending.context },
  action: { ...pending.action },
});

function validSnapshot(snapshot: LiaAppSnapshot): boolean {
  return (
    !!snapshot.context.sessionId &&
    Number.isSafeInteger(snapshot.context.epoch) &&
    snapshot.context.epoch > 0 &&
    snapshot.persona.id === snapshot.context.personaId
  );
}
function resourceAvailable(
  action: LiaAction,
  snapshot: LiaAppSnapshot,
): boolean {
  if (
    action.type === "open_appointment" ||
    action.type === "request_reschedule"
  ) {
    return snapshot.appointments.some(
      (item) =>
        item.id === action.target &&
        item.personaId === snapshot.context.personaId &&
        (action.type !== "request_reschedule" ||
          item.status === "confirmed" ||
          item.status === "scheduled"),
    );
  }
  if (action.type === "open_document") {
    return snapshot.documents.some(
      (item) =>
        item.id === action.target &&
        item.personaId === snapshot.context.personaId,
    );
  }
  return true;
}
function confirmationText(action: LiaAction, snapshot: LiaAppSnapshot): string {
  const response = translate(
    " Diga “sim” para confirmar ou “não” para cancelar.",
  );
  if (snapshot.connected) {
    if (action.type === "record_wellbeing") {
      return translate(
        "Posso enviar seu registro de “{feeling}” ao painel da equipe de demonstração? Esse relato não avalia a gravidade.{response}",
        { feeling: translate(action.value!), response },
      );
    }
    if (action.type === "request_reschedule") {
      const appointment = snapshot.appointments.find(
        (item) => item.id === action.target,
      )!;
      return translate(
        "Posso enviar um pedido de reagendamento de {title} à equipe? A consulta só muda depois da confirmação da equipe.{response}",
        { title: appointment.title, response },
      );
    }
    return translate(
      "Posso enviar um pedido de contato ao painel da equipe de demonstração? O envio não garante atendimento imediato.{response}",
      { response },
    );
  }
  if (action.type === "record_wellbeing")
    return translate(
      "Posso registrar “{feeling}” como seu bem-estar nesta demonstração? Esse registro não faz avaliação clínica.{response}",
      { feeling: translate(action.value!), response },
    );
  if (action.type === "request_reschedule") {
    const appointment = snapshot.appointments.find(
      (item) => item.id === action.target,
    )!;
    const formatted = new Intl.DateTimeFormat(getLocale(), {
      day: "2-digit",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: DEMO_TIMEZONE,
    }).format(new Date(appointment.startsAt));
    return translate(
      "Posso registrar um pedido fictício de reagendamento de {title}, em {date}? A consulta original continuará confirmada.{response}",
      { title: appointment.title, date: formatted, response },
    );
  }
  return translate(
    "Posso registrar um pedido de contato fictício? Nenhuma equipe real será avisada.{response}",
    { response },
  );
}

/** Proposals are not authority: this session owns confirmation and execution order. */
export function createLiaActionSession(
  bridge: LiaAppBridge,
  options: { now?: () => number } = {},
) {
  const now = options.now ?? Date.now;
  let waiting: PendingLiaAction | null = null;
  let waitingLocale = getLocale();
  let revision = 0;
  const clear = () => {
    waiting = null;
    revision += 1;
  };
  const isExpired = (pending: PendingLiaAction) =>
    waitingLocale !== getLocale() ||
    now() - pending.createdAt >= confirmationLifetimeMs ||
    now() < pending.createdAt;
  async function execute(
    action: LiaAction,
    id: string,
    expected: DemoContext,
    signal?: AbortSignal,
  ): Promise<LiaExecution> {
    const executionRevision = revision;
    if (signal?.aborted)
      return rejected(
        translate("A ação foi cancelada antes de ser executada."),
      );
    try {
      const snapshot = bridge.getSnapshot();
      if (!validSnapshot(snapshot) || !sameContext(expected, snapshot.context))
        return rejected(
          translate("O perfil ou a sessão mudou. Peça a ação novamente."),
        );
      if (!resourceAvailable(action, snapshot))
        return rejected(
          translate(
            "Esse item não está disponível no perfil atual. Peça a ação novamente.",
          ),
        );
      if (signal?.aborted)
        return rejected(
          translate("A ação foi cancelada antes de ser executada."),
        );
      const result = await (signal
        ? bridge.execute({ ...action }, id, { ...expected }, signal)
        : bridge.execute({ ...action }, id, { ...expected }));
      if (
        signal?.aborted ||
        executionRevision !== revision ||
        !sameContext(expected, bridge.getSnapshot().context)
      ) {
        return rejected(
          translate("O perfil ou a sessão mudou. Peça a ação novamente."),
        );
      }
      return result;
    } catch {
      return rejected(
        translate(
          "Não consegui concluir essa ação. Nenhuma confirmação será repetida automaticamente; você pode pedir novamente.",
        ),
      );
    }
  }
  async function propose(
    value: LiaAction,
    signal?: AbortSignal,
  ): Promise<LiaExecution> {
    clear();
    if (signal?.aborted)
      return rejected(
        translate("A ação foi cancelada antes de ser executada."),
      );
    try {
      const action = parseLiaAction(value);
      if (!action)
        return rejected(
          translate("Não recebi uma ação válida. Diga o que você quer fazer."),
        );
      const snapshot = bridge.getSnapshot();
      if (!validSnapshot(snapshot))
        return rejected(
          translate(
            "O perfil não está disponível. Abra a demonstração novamente.",
          ),
        );
      if (!resourceAvailable(action, snapshot))
        return rejected(
          translate("Esse item não está disponível no perfil atual."),
        );
      const id = `lia-${snapshot.context.sessionId}-${++operationSequence}`;
      if (
        ["record_wellbeing", "request_contact", "request_reschedule"].includes(
          action.type,
        )
      ) {
        const summary = confirmationText(action, snapshot);
        waiting = {
          id,
          action: { ...action },
          context: { ...snapshot.context },
          summary,
          createdAt: now(),
        };
        waitingLocale = getLocale();
        return { status: "needs_confirmation", text: summary };
      }
      return execute(action, id, snapshot.context, signal);
    } catch {
      return rejected(
        translate(
          "Não consegui preparar essa ação. Tente pedir de outra forma.",
        ),
      );
    }
  }
  async function confirm(
    id: string,
    signal?: AbortSignal,
  ): Promise<LiaExecution> {
    if (!waiting || waiting.id !== id) return noPending();
    const pending = waiting;
    clear(); // Consume before any bridge call, including calls that might throw.
    if (isExpired(pending))
      return rejected(
        translate("Essa confirmação expirou. Peça a ação novamente."),
      );
    return execute(pending.action, pending.id, pending.context, signal);
  }
  function cancel(id?: string): LiaExecution {
    if (id !== undefined && waiting?.id !== id) return noPending();
    const hadPending = waiting !== null;
    clear();
    return {
      status: "cancelled",
      text: hadPending
        ? translate("Tudo bem, cancelei essa ação. Nada foi alterado.")
        : translate("Não há ação aguardando confirmação."),
    };
  }
  async function handleInput(
    text: string,
    signal?: AbortSignal,
  ): Promise<LiaExecution | null> {
    if (signal?.aborted) {
      clear();
      return rejected(
        translate("A ação foi cancelada antes de ser executada."),
      );
    }
    const normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[.,!?;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (negativeAnswers.has(normalized)) return cancel();
    if (positiveAnswers.has(normalized))
      return waiting ? confirm(waiting.id, signal) : noPending();
    clear(); // A different topic or an ambiguous answer cannot authorize an old proposal.
    return null;
  }
  function pending(): PendingLiaAction | null {
    if (!waiting) return null;
    try {
      const snapshot = bridge.getSnapshot();
      if (
        isExpired(waiting) ||
        !validSnapshot(snapshot) ||
        !sameContext(waiting.context, snapshot.context)
      ) {
        clear();
        return null;
      }
      return clonePending(waiting);
    } catch {
      clear();
      return null;
    }
  }
  return { propose, handleInput, confirm, cancel, pending, clear };
}

/** Keep the ordinary fixture documents intact; oversized data is explicitly shortened. */
export function buildLiaContext(snapshot: LiaAppSnapshot): string {
  const ownAppointments = snapshot.appointments.filter(
    (item) => item.personaId === snapshot.context.personaId,
  );
  const ownJourney = snapshot.journey.filter(
    (item) => item.personaId === snapshot.context.personaId,
  );
  const ownDocuments = snapshot.documents.filter(
    (item) => item.personaId === snapshot.context.personaId,
  );
  const ownRequests = snapshot.requests.filter((item) =>
    sameContext(item.context, snapshot.context),
  );
  const tiers = [
    { items: 32, text: 4000 },
    { items: 20, text: 1000 },
    { items: 12, text: 400 },
    { items: 8, text: 160 },
    { items: 4, text: 80 },
  ];
  for (const tier of tiers) {
    let truncated = false;
    const shorten = (value: string, limit = tier.text) => {
      if (value.length <= limit) return value;
      truncated = true;
      return value.slice(0, limit - 1) + "…";
    };
    const take = <T>(items: T[], limit = tier.items): T[] => {
      if (items.length > limit) truncated = true;
      return items.slice(0, limit);
    };
    const context = {
      locale: getLocale(),
      demoNow: snapshot.connected?.asOf ?? DEMO_NOW,
      dataSource: snapshot.connected
        ? {
            mode: "connected_demo",
            status: snapshot.connected.status,
            asOf: snapshot.connected.asOf,
          }
        : { mode: "independent_demo" },
      timezone: DEMO_TIMEZONE,
      simulated: true,
      persona: {
        id: shorten(snapshot.persona.id, 128),
        name: shorten(snapshot.persona.name, 160),
        firstName: shorten(snapshot.persona.firstName, 80),
      },
      page: snapshot.page,
      prefs: {
        explanation: snapshot.prefs.explanation,
        speechRate: snapshot.prefs.speechRate,
        textScale: snapshot.prefs.textScale,
      },
      savedMood: shorten(snapshot.savedMood, 160),
      ...(snapshot.connected && snapshot.careContext
        ? {
            careContext: {
              diagnosisLabel: shorten(snapshot.careContext.diagnosisLabel, 200),
              ...(snapshot.careContext.treatmentLabel
                ? {
                    treatmentLabel: shorten(
                      snapshot.careContext.treatmentLabel,
                      200,
                    ),
                  }
                : {}),
              ...(snapshot.careContext.cycleLabel
                ? { cycleLabel: shorten(snapshot.careContext.cycleLabel, 200) }
                : {}),
              sourceLabel: shorten(snapshot.careContext.sourceLabel, 200),
              patientInstructions: take(
                snapshot.careContext.patientInstructions,
                Math.min(tier.items, 24),
              ).map((instruction) => shorten(instruction)),
            },
          }
        : {}),
      counts: {
        appointments: ownAppointments.length,
        journey: ownJourney.length,
        documents: ownDocuments.length,
        requests: ownRequests.length,
      },
      appointments: take(ownAppointments).map((item) => ({
        id: shorten(item.id, 128),
        title: shorten(item.title, 160),
        startsAt: shorten(item.startsAt, 64),
        status: item.status,
        category: shorten(item.category, 80),
        locationLabel: shorten(item.locationLabel, 200),
        professionalLabel: shorten(item.professionalLabel, 200),
        description: shorten(item.description),
      })),
      journey: take(ownJourney).map((item) => ({
        id: shorten(item.id, 128),
        title: shorten(item.title, 160),
        occurredAt: shorten(item.occurredAt, 64),
        status: item.status,
        source: item.source,
        description: shorten(item.description),
      })),
      documents: take(ownDocuments, Math.min(tier.items, 12)).map((item) => ({
        id: shorten(item.id, 128),
        title: shorten(item.title, 160),
        issuedAt: shorten(item.issuedAt, 64),
        typeLabel: shorten(item.typeLabel, 80),
        authorLabel: shorten(item.authorLabel, 160),
        body: take(item.body, Math.min(tier.items, 12)).map((paragraph) =>
          shorten(paragraph),
        ),
      })),
      requests: take(ownRequests).map((item) => ({
        id: shorten(item.id, 128),
        type: item.type,
        appointmentId: item.appointmentId
          ? shorten(item.appointmentId, 128)
          : null,
        status: item.status,
        createdAt: shorten(item.createdAt, 64),
      })),
    };
    const serialized = JSON.stringify({ ...context, truncated });
    if (serialized.length <= 20_000) return serialized;
  }
  // With four bounded entries per collection the final tier is below the limit.
  throw new Error(
    translate("O contexto do aplicativo excedeu o tamanho permitido."),
  );
}
