import { getLocale, translate } from "../i18n";
import type {
  Appointment,
  DemoDocument,
  PatientDataPort,
  Preferences,
} from "../../shared/contracts";
import {
  parseLiaAction,
  type LiaAppBridge,
  type LiaAppSnapshot,
  type LiaExecution,
  type LiaPageId,
  type LiaSymptomReportInput,
} from "../../shared/liaActions";
import { DEMO_TIMEZONE } from "../demo/fixtures";
import { isCurrent } from "./session";
import { requestStatusLabel } from "../integrations/connectedText";
import { HospitalIntegrationError } from "../integrations/hospital/errors";
import type { HospitalCareContext } from "../../shared/hospitalContracts";

export type ConnectedLiaActions = {
  reportSymptoms?: NonNullable<LiaAppBridge["reportSymptoms"]>;
  saveMood(
    feeling: string,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  submitRequest(
    type: "contact" | "reschedule",
    appointmentId: string | undefined,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<void>;
  updatePreferences(
    preferences: Preferences,
    operationId: string,
    signal?: AbortSignal,
  ): Promise<void>;
};

type Options = {
  data: PatientDataPort;
  getSnapshot(): LiaAppSnapshot;
  navigate(page: LiaPageId): void;
  openAppointment(appointment: Appointment): void;
  openDocument(document: DemoDocument): void;
  saveMood(feeling: string): void;
  updatePreferences(preferences: Preferences): void;
  connected?(): ConnectedLiaActions | null;
};
const pageLabels: Record<LiaPageId, string> = {
  home: "Início",
  journey: "Minha jornada",
  lia: "Lia",
  agenda: "Minha agenda",
  profile: "Meu perfil",
  documents: "Meus documentos",
  requests: "Meus pedidos",
  checkin: "Como estou",
  messages: "Mensagens da equipe",
};
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit",
    month: "long",
    timeZone: DEMO_TIMEZONE,
  }).format(new Date(iso));
const formatTime = (iso: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEMO_TIMEZONE,
  }).format(new Date(iso));
const appointmentText = (a: Appointment) =>
  translate("{title}, em {date} às {time}, em {location}.", {
    title: a.title,
    date: formatDate(a.startsAt),
    time: formatTime(a.startsAt),
    location: a.locationLabel,
  });
const completed = (text: string, showApp = false): LiaExecution => ({
  status: "completed",
  text,
  showApp,
});
const rejected = (
  text = translate(
    "Não consegui realizar essa tarefa neste perfil. Pode pedir de outra forma?",
  ),
): LiaExecution => ({ status: "rejected", text });

function careProfileText(care: HospitalCareContext | undefined): string {
  if (!care) return "";
  const facts = [
    translate("Diagnóstico informado pelo hospital: {value}.", {
      value: care.diagnosisLabel,
    }),
    ...(care.treatmentLabel
      ? [
          translate("Tratamento ou etapa informada: {value}.", {
            value: care.treatmentLabel,
          }),
        ]
      : []),
    ...(care.cycleLabel
      ? [translate("Ciclo informado: {value}.", { value: care.cycleLabel })]
      : []),
    translate("Fonte: {value}.", { value: care.sourceLabel }),
  ];
  const complete = [...facts, ...care.patientInstructions].join(" ");
  // Do not split a published instruction or overflow the native speech contract.
  return (
    (complete.length <= 1800
      ? complete
      : [
          ...facts,
          translate(
            "As orientações completas estão no Perfil e nos documentos publicados.",
          ),
        ].join(" ")) + " "
  );
}

/** The only action side effects use the same state and data port as the visible app. */
type SyncLiaAppBridge = Omit<LiaAppBridge, "execute"> & {
  execute(
    proposal: Parameters<LiaAppBridge["execute"]>[0],
    operationId: string,
    expectedContext: Parameters<LiaAppBridge["execute"]>[2],
    signal?: AbortSignal,
  ): LiaExecution;
};
export function createLiaAppBridge(
  options: Options & { connected: NonNullable<Options["connected"]> },
): LiaAppBridge;
export function createLiaAppBridge(options: Options): SyncLiaAppBridge;
export function createLiaAppBridge(options: Options): LiaAppBridge {
  return {
    getSnapshot: options.getSnapshot,
    get reportSymptoms() {
      const snapshot = options.getSnapshot();
      const remote = options.connected?.();
      if (
        !snapshot.connected ||
        !remote?.reportSymptoms ||
        snapshot.persona.id !== snapshot.context.personaId
      )
        return undefined;
      const expected = { ...snapshot.context };
      const reporter = remote.reportSymptoms;
      return async (input: LiaSymptomReportInput, signal?: AbortSignal) => {
        const current = () =>
          !signal?.aborted &&
          isCurrent(expected) &&
          options.getSnapshot().context.sessionId === expected.sessionId;
        if (!current()) throw new HospitalIntegrationError("aborted");
        const result = await reporter(input, signal);
        if (!current()) throw new HospitalIntegrationError("aborted");
        return result;
      };
    },
    execute(proposal, operationId, expectedContext, signal) {
      try {
        if (signal?.aborted || !isCurrent(expectedContext))
          return rejected(
            translate(
              "Essa conversa pertence a uma sessão encerrada. Comece novamente com o perfil atual.",
            ),
          );
        const s = options.getSnapshot();
        if (
          s.context.sessionId !== expectedContext.sessionId ||
          s.context.epoch !== expectedContext.epoch ||
          s.context.personaId !== expectedContext.personaId
        )
          return rejected(
            translate("O perfil mudou. Peça novamente para o perfil atual."),
          );
        const action = parseLiaAction(proposal);
        if (!action) return rejected();
        if (s.connected)
          return executeConnected(
            action,
            s,
            operationId,
            expectedContext,
            signal,
          );
        const appointment = s.appointments.find(
          (a) => a.id === action.target && a.personaId === s.context.personaId,
        );
        switch (action.type) {
          case "read": {
            switch (action.target) {
              case "agenda": {
                const next = s.appointments.filter(
                  (a) => a.status === "confirmed",
                );
                return completed(
                  next.length
                    ? translate("Na sua agenda fictícia: {items}", {
                        items: next.map(appointmentText).join(" "),
                      })
                    : translate(
                        "Não há encontros confirmados neste perfil fictício.",
                      ),
                );
              }
              case "journey":
                return completed(
                  s.journey.length
                    ? translate("Sua jornada fictícia: {items}", {
                        items: s.journey
                          .map((j) => `${j.title}: ${j.description}`)
                          .join(" "),
                      })
                    : translate("Ainda não há etapas nesta jornada fictícia."),
                );
              case "documents":
                return completed(
                  s.documents.length
                    ? translate(
                        "Você tem {count} documentos fictícios: {items}. Diga qual você quer abrir ou ouvir.",
                        {
                          count: s.documents.length,
                          items: s.documents.map((d) => d.title).join("; "),
                        },
                      )
                    : translate("Não há documentos neste perfil fictício."),
                );
              case "requests":
                return completed(
                  s.requests.length
                    ? getLocale() === "pt-BR"
                      ? `Você tem ${s.requests.length} pedido${s.requests.length === 1 ? "" : "s"} nesta demonstração: ${s.requests.map((r) => (r.type === "contact" ? "contato da equipe" : "reagendamento")).join(", ")}. Todos são simulados; nenhuma equipe real foi avisada.`
                      : translate(
                          "Você tem {count} pedido(s) nesta demonstração: {items}. Todos são simulados; nenhuma equipe real foi avisada.",
                          {
                            count: s.requests.length,
                            items: s.requests
                              .map((r) =>
                                translate(
                                  r.type === "contact"
                                    ? "contato da equipe"
                                    : "reagendamento",
                                ),
                              )
                              .join(", "),
                          },
                        )
                    : translate(
                        "Você ainda não tem pedidos nesta demonstração.",
                      ),
                );
              case "checkin":
                return completed(
                  s.savedMood
                    ? translate(
                        "Seu último registro nesta sessão foi: {feeling}. É apenas um registro fictício, sem avaliação clínica.",
                        { feeling: translate(s.savedMood) },
                      )
                    : translate(
                        "Você ainda não registrou como está se sentindo nesta sessão. Se quiser, diga o que deseja registrar.",
                      ),
                );
              case "profile":
                return completed(
                  translate(
                    "O tamanho das letras está em {size}%. A voz está {speed} e as explicações estão {explanation}. Posso ajustar isso para você.",
                    {
                      size: s.prefs.textScale * 100,
                      speed: translate(
                        s.prefs.speechRate < 1
                          ? "mais devagar"
                          : s.prefs.speechRate > 1
                            ? "mais rápida"
                            : "na velocidade normal",
                      ),
                      explanation: translate(
                        s.prefs.explanation === "short"
                          ? "curtas"
                          : "em passos",
                      ),
                    },
                  ),
                );
              case "help":
                return completed(
                  translate(
                    "Posso consultar sua agenda, abrir e ler documentos, mostrar sua jornada e ajustar as letras ou a voz. Também posso registrar como você está se sentindo e preparar pedidos simulados, depois de você confirmar. O que gostaria de fazer?",
                  ),
                );
              default:
                return rejected();
            }
          }
          case "navigate":
            if (action.target === "messages")
              return rejected(
                translate(
                  "Conecte ao hospital para consultar as mensagens compartilhadas pela equipe.",
                ),
              );
            options.navigate(action.target as LiaPageId);
            return completed(
              translate(
                "Abri {page}. Continuo aqui; pode me pedir o próximo passo.",
                { page: translate(pageLabels[action.target as LiaPageId]) },
              ),
              true,
            );
          case "open_appointment":
            if (!appointment)
              return rejected(
                translate(
                  "Não encontrei esse encontro no seu perfil. Posso consultar sua agenda.",
                ),
              );
            options.navigate("agenda");
            options.openAppointment(appointment);
            return completed(
              translate("Abri o encontro fictício. {appointment}{status}", {
                appointment: appointmentText(appointment),
                status:
                  appointment.status === "cancelled"
                    ? translate(" Esse encontro está cancelado.")
                    : "",
              }),
              true,
            );
          case "open_document": {
            const doc = s.documents.find(
              (d) =>
                d.id === action.target && d.personaId === s.context.personaId,
            );
            if (!doc)
              return rejected(
                translate(
                  "Não encontrei esse documento no seu perfil. Posso listar seus documentos.",
                ),
              );
            options.navigate("documents");
            options.openDocument(doc);
            return completed(
              translate(
                "Abri {title}. Documento fictício, sem validade clínica. {body}",
                { title: doc.title, body: doc.body.join(" ") },
              ),
              true,
            );
          }
          case "record_wellbeing":
            options.saveMood(action.value!);
            options.navigate("checkin");
            return completed(
              translate(
                "Registrei {feeling} nesta sessão da demonstração. Esse registro não avalia sintomas e nenhuma equipe foi avisada.",
                { feeling: translate(action.value!) },
              ),
              true,
            );
          case "request_contact":
          case "request_reschedule": {
            const type =
              action.type === "request_contact" ? "contact" : "reschedule";
            if (
              type === "reschedule" &&
              (!appointment || appointment.status !== "confirmed")
            )
              return rejected(
                translate(
                  "Não encontrei uma consulta confirmada para esse pedido. Sua agenda continua como estava.",
                ),
              );
            const previous = s.requests.some(
              (r) =>
                r.type === type &&
                (type === "contact" || r.appointmentId === appointment!.id),
            );
            options.data.request(s.context, {
              type,
              appointmentId:
                type === "reschedule" ? appointment!.id : undefined,
              idempotencyKey: `${type}:${type === "reschedule" ? appointment!.id : "team"}`,
            });
            options.navigate("requests");
            return completed(
              [
                translate(
                  previous
                    ? "Esse pedido já estava registrado nesta demonstração."
                    : type === "contact"
                      ? "Pedido de contato foi registrado nesta demonstração."
                      : "Pedido de reagendamento foi registrado nesta demonstração.",
                ),
                ...(type === "reschedule"
                  ? [translate("A consulta original continua confirmada.")]
                  : []),
                translate("Nenhuma equipe real foi avisada."),
              ].join(" "),
              true,
            );
          }
          case "set_text_scale":
            options.updatePreferences({
              ...s.prefs,
              textScale: Number(action.value) as Preferences["textScale"],
            });
            return completed(
              translate("Pronto. Ajustei as letras para {size}%.", {
                size: Number(action.value) * 100,
              }),
            );
          case "set_speech_rate":
            options.updatePreferences({
              ...s.prefs,
              speechRate: Number(action.value) as Preferences["speechRate"],
            });
            return completed(
              translate("Pronto. Vou falar {speed}.", {
                speed: translate(
                  action.value === "0.8"
                    ? "mais devagar"
                    : action.value === "1.2"
                      ? "mais rápido"
                      : "na velocidade normal",
                ),
              }),
            );
          case "set_explanation":
            options.updatePreferences({
              ...s.prefs,
              explanation: action.value as Preferences["explanation"],
            });
            return completed(
              action.value === "short"
                ? translate("Pronto. Vou usar explicações curtas.")
                : translate("Pronto. Vou explicar um passo de cada vez."),
            );
        }
      } catch {
        return rejected(
          translate(
            "Não consegui concluir a tarefa. Nenhuma confirmação de sucesso foi registrada. Tente novamente.",
          ),
        );
      }
    },
  };

  async function executeConnected(
    action: NonNullable<ReturnType<typeof parseLiaAction>>,
    s: LiaAppSnapshot,
    operationId: string,
    expectedContext: LiaAppSnapshot["context"],
    signal?: AbortSignal,
  ): Promise<LiaExecution> {
    const stillCurrent = () =>
      !signal?.aborted &&
      isCurrent(expectedContext) &&
      options.getSnapshot().context.sessionId === expectedContext.sessionId;
    const appointment = s.appointments.find(
      (item) =>
        item.id === action.target && item.personaId === s.context.personaId,
    );
    const actions = options.connected?.();
    if (!actions || !stillCurrent()) return rejected();
    try {
      const readCompleted = (text: string) =>
        completed(
          (s.connected?.status === "offline"
            ? translate(
                "Sem atualização do hospital. Os dados abaixo podem estar desatualizados.",
              ) + " "
            : "") + text,
        );
      if (action.type === "read") {
        if (s.connected?.status === "loading")
          return rejected(
            translate(
              "Esse conteúdo do hospital ainda não foi carregado. Use Tentar novamente e peça de novo.",
            ),
          );
        switch (action.target) {
          case "agenda": {
            const items = s.appointments.filter(
              (item) =>
                item.status === "confirmed" || item.status === "scheduled",
            );
            return readCompleted(
              items.length
                ? translate("Na agenda compartilhada pelo hospital: {items}", {
                    items: items.map(appointmentText).join(" "),
                  })
                : translate(
                    "Não há encontros confirmados na agenda compartilhada pelo hospital.",
                  ),
            );
          }
          case "journey":
            return readCompleted(
              s.journey.length
                ? translate("Jornada compartilhada pelo hospital: {items}", {
                    items: s.journey
                      .map((item) => `${item.title}: ${item.description}`)
                      .join(" "),
                  })
                : translate("Nenhuma etapa publicada pela equipe."),
            );
          case "documents":
            return readCompleted(
              s.documents.length
                ? translate("Documentos publicados para você: {items}", {
                    items: s.documents.map((item) => item.title).join("; "),
                  })
                : translate("Nenhum documento publicado para você."),
            );
          case "requests":
            return readCompleted(
              s.requests.length
                ? translate("Pedidos no hospital: {items}", {
                    items: s.requests
                      .map(
                        (item) =>
                          `${translate(item.type === "contact" ? "Solicitação de contato" : "Pedido de reagendamento")}: ${translate(requestStatusLabel[item.status])}`,
                      )
                      .join("; "),
                  })
                : translate(
                    "Nenhum pedido foi recebido pelo hospital nesta sessão.",
                  ),
            );
          case "checkin":
            return readCompleted(
              s.savedMood
                ? translate(
                    "Registro confirmado: {feeling}. Ele não substitui avaliação profissional.",
                    { feeling: translate(s.savedMood) },
                  )
                : translate("Não há registro confirmado nesta sessão."),
            );
          case "profile":
            return readCompleted(
              careProfileText(s.careContext) +
                translate(
                  "O tamanho das letras está em {size}%. A voz está {speed} e as explicações estão {explanation}. Posso ajustar isso para você.",
                  {
                    size: s.prefs.textScale * 100,
                    speed: translate(
                      s.prefs.speechRate < 1
                        ? "mais devagar"
                        : s.prefs.speechRate > 1
                          ? "mais rápida"
                          : "na velocidade normal",
                    ),
                    explanation: translate(
                      s.prefs.explanation === "short" ? "curtas" : "em passos",
                    ),
                  },
                ),
            );
          case "help":
            return readCompleted(
              translate(
                "Posso consultar os dados compartilhados pelo hospital, abrir documentos e ajustar suas preferências. Posso enviar um registro ou pedido após você confirmar. Para orientações clínicas, peça contato da equipe.",
              ),
            );
          case "messages":
            return readCompleted(
              s.messages?.length
                ? s.messages
                    .map(
                      (message) =>
                        `${message.role === "patient" ? translate("Você") : message.authorLabel}: ${message.text}`,
                    )
                    .join(" ")
                : translate("Ainda não há mensagens compartilhadas."),
            );
          default:
            return rejected();
        }
      }
      if (action.type === "navigate") {
        options.navigate(action.target as LiaPageId);
        return completed(
          translate(
            "Abri {page}. Continuo aqui; pode me pedir o próximo passo.",
            { page: translate(pageLabels[action.target as LiaPageId]) },
          ),
          true,
        );
      }
      if (action.type === "open_appointment") {
        if (!appointment) return rejected();
        options.navigate("agenda");
        options.openAppointment(appointment);
        return completed(
          translate(
            "Abri o encontro compartilhado pelo hospital. {appointment}",
            { appointment: appointmentText(appointment) },
          ),
          true,
        );
      }
      if (action.type === "open_document") {
        const doc = s.documents.find(
          (item) =>
            item.id === action.target && item.personaId === s.context.personaId,
        );
        if (!doc) return rejected();
        options.navigate("documents");
        options.openDocument(doc);
        return completed(
          translate("Abri {title}. Publicado pela equipe: {body}", {
            title: doc.title,
            body: doc.body.join(" "),
          }),
          true,
        );
      }
      if (action.type === "record_wellbeing") {
        await actions.saveMood(action.value!, operationId, signal);
        if (!stillCurrent()) return rejected();
        options.navigate("checkin");
        return completed(
          translate(
            "Registro confirmado pelo hospital da demonstração. Este registro não é uma avaliação clínica.",
          ),
          true,
        );
      }
      if (
        action.type === "request_contact" ||
        action.type === "request_reschedule"
      ) {
        if (
          action.type === "request_reschedule" &&
          (!appointment ||
            !["confirmed", "scheduled"].includes(appointment.status))
        )
          return rejected();
        await actions.submitRequest(
          action.type === "request_contact" ? "contact" : "reschedule",
          action.type === "request_reschedule" ? appointment!.id : undefined,
          operationId,
          signal,
        );
        if (!stillCurrent()) return rejected();
        options.navigate("requests");
        return completed(
          translate(
            "Pedido confirmado pelo hospital da demonstração. Acompanhe o status em Meus pedidos.",
          ),
          true,
        );
      }
      const preferences = { ...s.prefs };
      if (action.type === "set_text_scale")
        preferences.textScale = Number(
          action.value,
        ) as Preferences["textScale"];
      else if (action.type === "set_speech_rate")
        preferences.speechRate = Number(
          action.value,
        ) as Preferences["speechRate"];
      else if (action.type === "set_explanation")
        preferences.explanation = action.value as Preferences["explanation"];
      else return rejected();
      await actions.updatePreferences(preferences, operationId, signal);
      if (!stillCurrent()) return rejected();
      return completed(translate("Preferências confirmadas pelo hospital."));
    } catch {
      return rejected(
        translate(
          "Não consegui concluir o envio ao hospital. Nenhum sucesso foi confirmado. Você pode tentar novamente.",
        ),
      );
    }
  }
}
