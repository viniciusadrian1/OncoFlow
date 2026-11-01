// Lia, assistente do OncoFlow Paciente. Substitui a "IRIS automática" do protótipo.
//
// Regras (CLAUDE.md, 3 e 4): a Lia não orienta sobre sintomas, remédios ou resultados; só informa
// o que está no sistema, organiza e encaminha. Ações de escrita passam por confirmação em duas
// fases, e toda resposta usa um dos quatro status: consultado, registrado, encaminhado ou
// confirmado. Os textos saem de modelos por status, nunca de geração livre, e ainda passam por
// `verificarAfirmacoes` antes de chegar ao paciente.
//
// A interpretação do pedido é feita por regras locais (funciona sem rede, como pede o roteiro da
// demo). Um modelo de linguagem pode substituir `classificar` depois, sem mudar o resto.
// A interface da demo está em inglês (EN-US); os padrões abaixo casam com o texto já normalizado
// por `normalizar`, que troca apóstrofos por espaço ("can't" → "can t").

import type { Compromisso, OpcaoCheckin, Paciente, StatusResultado } from '../src/types';
import { ROTULO_OPCAO_CHECKIN } from '../src/types';
import { CONFIG_SERVICO } from './configServico';
import {
  adicionarMensagem,
  criarPendencia,
  definirProposta,
  ErroDominio,
  limparProposta,
  obterPaciente,
  obterPendencia,
  propostaDe,
  registrarCheckin,
  registrarSinalUrgencia,
  type PropostaInterna,
} from './estado';
import { detectarUrgencia } from './urgencia';
import { contemExpressao, dataCurta, dataHoraPorExtenso, diaRelativo, gerarId, agoraISO, normalizar } from './util';

const NOME = CONFIG_SERVICO.assistenteNome;

// ---------------------------------------------------------------------------
// Fala da Lia
// ---------------------------------------------------------------------------

// Verbos que afirmam conclusão. Só podem aparecer com status `confirmado` (princípio 5).
const AFIRMACOES_DE_CONCLUSAO = [
  'i rescheduled',
  'has been rescheduled',
  'was rescheduled',
  'is rescheduled',
  'is scheduled',
  'was scheduled',
  'has been scheduled',
  'i canceled',
  'i cancelled',
  'was canceled',
  'was cancelled',
  'will call you',
  'is going to call',
  'i solved',
  'i resolved',
  'was resolved',
];

const TEXTO_SEGURO_POR_STATUS: Record<StatusResultado, string> = {
  consultado: 'This is the information in the system right now.',
  registrado: 'I logged your request. The team will review it and you will see the answer here.',
  encaminhado: 'I forwarded it to the responsible team.',
  confirmado: 'Done.',
};

export function verificarAfirmacoes(texto: string, status: StatusResultado | undefined): string {
  if (status === 'confirmado') return texto;
  if (!contemExpressao(normalizar(texto), AFIRMACOES_DE_CONCLUSAO)) return texto;
  return status ? TEXTO_SEGURO_POR_STATUS[status] : "I haven't changed anything yet.";
}

function falar(
  paciente: Paciente,
  texto: string,
  extra: { status?: StatusResultado; acoes?: { rotulo: string; tipo: 'abrir_documento' | 'abrir_tela'; alvo: string }[] } = {}
): void {
  adicionarMensagem(paciente, {
    autor: 'lia',
    nomeAutor: NOME,
    texto: verificarAfirmacoes(texto, extra.status),
    status: extra.status,
    acoes: extra.acoes,
    visivelPaciente: true,
  });
}

function primeiroNome(paciente: Paciente): string {
  return paciente.nome.split(' ')[0];
}

// "your oncology appointment", "your blood tests"
function seuCompromisso(compromisso: Compromisso): string {
  return `your ${compromisso.titulo.charAt(0).toLowerCase()}${compromisso.titulo.slice(1)}`;
}

const DESCRICAO_FALADA: Record<OpcaoCheckin, string> = {
  bem: 'well',
  cansaco: 'tiredness',
  dor: 'pain',
  nausea: 'nausea',
  ansiedade: 'worry or anxiety',
  outro: 'something different',
};

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function mensagemDoPaciente(pacienteId: string, texto: string, origem: 'texto' | 'voz'): void {
  const paciente = obterPaciente(pacienteId);
  const limpo = texto.trim();
  if (!limpo) throw new ErroDominio(400, 'texto_vazio', 'Type or say your message.');

  adicionarMensagem(paciente, {
    autor: 'paciente',
    nomeAutor: paciente.nome,
    texto: limpo,
    origem,
    visivelPaciente: true,
  });

  // 1. Possível urgência, antes de qualquer outra coisa, nos dois modos de atendimento.
  const urgencia = detectarUrgencia(limpo);
  if (urgencia) {
    limparProposta(paciente.id);
    const pendencia = registrarSinalUrgencia(paciente, limpo, urgencia.termo);
    if (paciente.modoConversa === 'lia') {
      definirProposta(paciente, {
        acao: 'relato_urgencia',
        resumo: `Forward your report to the nursing team: "${limpo}"`,
        rotuloConfirmar: 'Forward report',
        rotuloRecusar: 'Not now',
        dados: { pendenciaId: pendencia.id },
      });
      falar(paciente, 'Do you want me to forward this report to your nursing team?');
    }
    return;
  }

  // 2. Com um profissional na conversa, quem responde é ele (como no IRIS).
  if (paciente.modoConversa === 'profissional') return;

  responderComoLia(paciente, limpo, origem);
}

function responderComoLia(paciente: Paciente, texto: string, origem: 'texto' | 'voz'): void {
  const t = normalizar(texto);

  const pendente = propostaDe(paciente.id);
  if (pendente) {
    if (/^(yes|yeah|yep|sure|confirm|ok|okay|please|go ahead|do it|of course)\b/.test(t)) {
      responderProposta(paciente.id, pendente.token, true);
      return;
    }
    if (/^(no|nope|not now|cancel|never mind|don t)\b/.test(t)) {
      responderProposta(paciente.id, pendente.token, false);
      return;
    }
    limparProposta(paciente.id);
  }

  const intencao = classificar(t);
  switch (intencao.tipo) {
    case 'duvida_clinica':
      return duvidaClinica(paciente, texto);
    case 'contato':
      return propostaContato(paciente, texto);
    case 'reagendamento':
      return propostaReagendamento(paciente, texto, t);
    case 'lembrete':
      return criarLembrete(paciente, t);
    case 'checkin_iniciar':
      return falar(
        paciente,
        'Of course. How are you feeling today? You can tell me in your own words or pick an option on the How am I? screen.',
        { acoes: [{ rotulo: 'Open How am I?', tipo: 'abrir_tela', alvo: 'como-estou' }] }
      );
    case 'checkin_texto':
      return propostaCheckin(paciente, texto, intencao.opcoes, origem);
    case 'preparo':
      return consultarPreparo(paciente, t);
    case 'documentos':
      return consultarDocumentos(paciente);
    case 'agenda':
      return consultarAgenda(paciente, t);
    case 'jornada':
      return consultarJornada(paciente);
    case 'saudacao':
      return falar(
        paciente,
        `Hi, ${primeiroNome(paciente)}. How can I help? I can check your schedule, your journey and your documents, log how you are feeling or reach your care team.`
      );
    case 'agradecimento':
      return falar(paciente, `You're welcome, ${primeiroNome(paciente)}. Just call me if you need anything.`);
    default:
      return falar(
        paciente,
        "I can't help with that yet. I can check your schedule, your journey and your documents, log how you are feeling or ask the team to contact you."
      );
  }
}

// ---------------------------------------------------------------------------
// Interpretação do pedido (regras locais)
// ---------------------------------------------------------------------------

type Intencao =
  | { tipo: 'duvida_clinica' | 'contato' | 'reagendamento' | 'lembrete' | 'checkin_iniciar' }
  | { tipo: 'checkin_texto'; opcoes: OpcaoCheckin[] }
  | { tipo: 'preparo' | 'documentos' | 'agenda' | 'jornada' | 'saudacao' | 'agradecimento' | 'desconhecida' };

const SINONIMOS_CHECKIN: Record<Exclude<OpcaoCheckin, 'outro'>, string[]> = {
  cansaco: ['tired*', 'exhausted', 'no energy', 'fatigue*', 'weak', 'worn out'],
  dor: ['pain*', 'hurt*', 'aching', 'ache*', 'sore'],
  nausea: ['nause*', 'queasy', 'sick to my stomach', 'vomit*', 'throwing up', 'threw up'],
  ansiedade: ['anxious', 'anxiety', 'worried', 'nervous', 'scared', 'afraid', 'sad', 'stressed'],
  bem: [
    'i m fine',
    'i m good',
    'i m well',
    'i m ok',
    'i m okay',
    'i feel good',
    'i feel fine',
    'feeling good',
    'feeling fine',
    'feeling well',
    'feeling great',
    'doing well',
    'doing good',
  ],
};

const PALAVRAS_EXAME = ['test*', 'exam*', 'scan*', 'blood work'];
const PALAVRAS_CONSULTA = ['appointment*', 'visit*'];

function opcoesDoTexto(t: string): OpcaoCheckin[] {
  return (Object.keys(SINONIMOS_CHECKIN) as (keyof typeof SINONIMOS_CHECKIN)[]).filter((opcao) =>
    contemExpressao(t, SINONIMOS_CHECKIN[opcao])
  );
}

export function classificar(t: string): Intencao {
  if (
    contemExpressao(t, [
      'can i take',
      'should i take',
      'can i stop',
      'should i stop',
      'stop the medication',
      'stop my medication',
      'is it normal',
      'is this normal',
      'is that normal',
      'what does it mean',
      'what does this mean',
      'is it serious',
      'is this serious',
      'which medication',
      'what medication',
      'which medicine',
      'what medicine',
      'what dose',
      'which dose',
      'increase the dose',
      'lower the dose',
      'take another',
    ])
  ) {
    return { tipo: 'duvida_clinica' };
  }
  if (
    contemExpressao(t, [
      'talk to the nurse',
      'talk to a nurse',
      'talk to my nurse',
      'speak to the nurse',
      'speak with the nurse',
      'talk to the team',
      'talk to my team',
      'talk to someone',
      'talk to somebody',
      'talk to the doctor',
      'talk to my doctor',
      'speak to the doctor',
      'speak with my doctor',
      'talk to a person',
      'talk to a human',
      'talk to the navigator',
      'need to talk to',
      'want to talk to',
      'need to speak',
      'want to speak',
    ])
  ) {
    return { tipo: 'contato' };
  }
  if (
    contemExpressao(t, [
      'can t go',
      'can t make it',
      'cannot go',
      'won t be able to go',
      'won t be able to make it',
      'not be able to go',
      'reschedul*',
      'move my appointment',
      'move the appointment',
      'change my appointment',
      'change the appointment',
      'change the date',
      'change the time',
      'change the day',
      'cancel my appointment',
      'cancel the appointment',
    ])
  ) {
    return { tipo: 'reagendamento' };
  }
  if (contemExpressao(t, ['remind*', 'reminder*', 'notify me'])) return { tipo: 'lembrete' };
  if (
    contemExpressao(t, [
      'how i m feeling',
      'how i am feeling',
      'tell you how i',
      'log how i',
      'do a check in',
      'do my check in',
      'check in',
      'checkin',
    ])
  ) {
    return { tipo: 'checkin_iniciar' };
  }
  const opcoes = opcoesDoTexto(t);
  if (opcoes.length > 0) return { tipo: 'checkin_texto', opcoes };
  if (
    contemExpressao(t, [
      'prep',
      'prepar*',
      'fasting',
      'how will it be',
      'how does it work',
      'what to bring',
      'what should i bring',
      'what do i need to bring',
    ])
  ) {
    return { tipo: 'preparo' };
  }
  if (contemExpressao(t, ['document*', 'result*', 'report*', 'blood count', 'my tests', 'lab work'])) {
    return { tipo: 'documentos' };
  }
  if (
    contemExpressao(t, ['next appointment', 'schedule*', 'when', 'what time', 'calendar', ...PALAVRAS_CONSULTA, ...PALAVRAS_EXAME])
  ) {
    return { tipo: 'agenda' };
  }
  if (
    contemExpressao(t, ['journey', 'next step*', 'step*', 'stage*', 'what comes next', 'what s next', 'what is next', 'what s left'])
  ) {
    return { tipo: 'jornada' };
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(t)) return { tipo: 'saudacao' };
  if (contemExpressao(t, ['thank*', 'thx', 'appreciate it'])) return { tipo: 'agradecimento' };
  return { tipo: 'desconhecida' };
}

// ---------------------------------------------------------------------------
// Informar (status `consultado`)
// ---------------------------------------------------------------------------

function proximo(paciente: Paciente, tipo?: Compromisso['tipo']): Compromisso | undefined {
  const agora = Date.now();
  return [...paciente.agenda]
    .filter((c) => new Date(c.dataHora).getTime() > agora && (!tipo || c.tipo === tipo))
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora))[0];
}

function lembreteExistente(paciente: Paciente, compromissoId: string): boolean {
  return paciente.lembretes.some((l) => l.compromissoId === compromissoId);
}

function consultarAgenda(paciente: Paciente, t: string): void {
  const tipo = contemExpressao(t, PALAVRAS_CONSULTA) ? 'consulta' : contemExpressao(t, PALAVRAS_EXAME) ? 'exame' : undefined;
  const compromisso = proximo(paciente, tipo) ?? proximo(paciente);
  if (!compromisso) {
    falar(paciente, "I didn't find any appointments on your schedule.", { status: 'consultado' });
    return;
  }
  const quando = dataHoraPorExtenso(compromisso.dataHora);
  const texto =
    compromisso.tipo === 'consulta'
      ? `Your next appointment is ${quando}, at the ${compromisso.local}.`
      : `Your next appointment is ${compromisso.titulo}: ${quando}, at the ${compromisso.local}.`;
  falar(paciente, texto, { status: 'consultado' });

  if (!lembreteExistente(paciente, compromisso.id)) {
    definirProposta(paciente, {
      acao: 'lembrete',
      resumo: `Create a reminder one day before ${seuCompromisso(compromisso)}`,
      rotuloConfirmar: 'Yes, please',
      rotuloRecusar: 'Not now',
      dados: { compromissoId: compromisso.id },
    });
    falar(paciente, 'Do you want me to remind you one day before?');
  }
}

function consultarJornada(paciente: Paciente): void {
  const atual = paciente.jornada.find((e) => e.estado === 'em_andamento');
  const seguinte = paciente.jornada.find((e) => e.estado === 'proxima' || e.estado === 'aguardando');
  const partes: string[] = [];
  if (atual) partes.push(`You are now at the ${atual.titulo} step.`);
  if (seguinte) {
    partes.push(`The next one is ${seguinte.titulo}${seguinte.estado === 'aguardando' ? ', which is pending' : ''}.`);
    if (seguinte.oQueFazer) partes.push(seguinte.oQueFazer);
  }
  if (partes.length === 0) partes.push("I didn't find any steps in your journey.");
  falar(paciente, partes.join(' '), {
    status: 'consultado',
    acoes: [{ rotulo: 'See my journey', tipo: 'abrir_tela', alvo: 'jornada' }],
  });
}

function consultarDocumentos(paciente: Paciente): void {
  const recente = [...paciente.documentos].sort((a, b) => b.data.localeCompare(a.data))[0];
  if (!recente) {
    falar(paciente, 'There are no documents released to you yet.', { status: 'consultado' });
    return;
  }
  falar(
    paciente,
    `Your most recent document is ${recente.titulo}, released on ${dataCurta(recente.data)} by ${recente.liberadoPor}. I can open it for you to read or listen to.`,
    {
      status: 'consultado',
      acoes: [
        { rotulo: 'See the full document', tipo: 'abrir_documento', alvo: recente.id },
        { rotulo: 'My documents', tipo: 'abrir_tela', alvo: 'documentos' },
      ],
    }
  );
}

function consultarPreparo(paciente: Paciente, t: string): void {
  const tipo = contemExpressao(t, PALAVRAS_CONSULTA) ? 'consulta' : 'exame';
  const compromisso = proximo(paciente, tipo) ?? proximo(paciente);
  if (compromisso?.preparo) {
    falar(
      paciente,
      `For ${compromisso.titulo}, ${dataHoraPorExtenso(compromisso.dataHora)}, the hospital's instructions are: ${compromisso.preparo}`,
      { status: 'consultado' }
    );
    return;
  }
  definirProposta(paciente, {
    acao: 'duvida',
    resumo: 'Ask the team for the prep instructions for your next test',
    rotuloConfirmar: 'Ask the team',
    rotuloRecusar: 'Not now',
    dados: { texto: 'Prep instructions for the next test' },
  });
  falar(paciente, "I don't have validated instructions for this test yet. Do you want me to ask the team?");
}

// ---------------------------------------------------------------------------
// Organizar e encaminhar (propostas confirmadas pelo paciente)
// ---------------------------------------------------------------------------

function duvidaClinica(paciente: Paciente, texto: string): void {
  definirProposta(paciente, {
    acao: 'duvida',
    resumo: `Log your question for the team: "${texto}"`,
    rotuloConfirmar: 'Log question',
    rotuloRecusar: 'Not now',
    dados: { texto },
  });
  falar(
    paciente,
    "That is an important question for your care team. I don't answer questions about medications, symptoms or results. Do you want me to log your question for them?"
  );
}

function propostaContato(paciente: Paciente, texto: string): void {
  definirProposta(paciente, {
    acao: 'contato_equipe',
    resumo: 'Ask the nursing team to contact you',
    rotuloConfirmar: 'Request contact',
    rotuloRecusar: 'No, go back',
    dados: { texto },
  });
  falar(paciente, 'Should I ask the nursing team to contact you?');
}

function propostaReagendamento(paciente: Paciente, texto: string, t: string): void {
  const compromisso = contemExpressao(t, PALAVRAS_EXAME) ? proximo(paciente, 'exame') : proximo(paciente, 'consulta') ?? proximo(paciente);
  if (!compromisso) {
    falar(paciente, "I didn't find any appointments to reschedule.", { status: 'consultado' });
    return;
  }
  const quando = dataHoraPorExtenso(compromisso.dataHora);
  definirProposta(paciente, {
    acao: 'reagendamento',
    resumo: `Open a rescheduling request for ${seuCompromisso(compromisso)}, ${quando}`,
    rotuloConfirmar: 'Open request',
    rotuloRecusar: 'No, go back',
    dados: { compromissoId: compromisso.id, texto },
  });
  falar(
    paciente,
    `Got it: you can't make it to ${seuCompromisso(compromisso)}, ${quando}. Should I open a rescheduling request for the team to review?`
  );
}

function propostaCheckin(paciente: Paciente, texto: string, opcoes: OpcaoCheckin[], origem: 'texto' | 'voz'): void {
  const sintomas = opcoes.filter((o) => o !== 'bem').map((o) => DESCRICAO_FALADA[o]);
  const descricao =
    sintomas.length === 0
      ? 'feeling well'
      : `dealing with ${sintomas.length > 1 ? `${sintomas.slice(0, -1).join(', ')} and ${sintomas[sintomas.length - 1]}` : sintomas[0]}`;
  definirProposta(paciente, {
    acao: 'checkin',
    resumo: `Log in today's check-in: ${opcoes.map((o) => ROTULO_OPCAO_CHECKIN[o]).join(', ')} · "${texto}"`,
    rotuloConfirmar: 'Log check-in',
    rotuloRecusar: 'Not now',
    dados: { opcoes, texto, origem },
  });
  falar(paciente, `Got it: today you are ${descricao}. Do you want me to log this in today's check-in?`);
}

function criarLembrete(paciente: Paciente, t: string): void {
  const compromisso = contemExpressao(t, PALAVRAS_EXAME) ? proximo(paciente, 'exame') : proximo(paciente, 'consulta') ?? proximo(paciente);
  if (!compromisso) {
    falar(paciente, "I didn't find any appointments to create a reminder for.", { status: 'consultado' });
    return;
  }
  executarLembrete(paciente, compromisso);
}

function executarLembrete(paciente: Paciente, compromisso: Compromisso): void {
  if (lembreteExistente(paciente, compromisso.id)) {
    falar(paciente, `You already have a reminder for ${compromisso.titulo}.`, { status: 'consultado' });
    return;
  }
  const diasAteCompromisso = Math.floor(
    (new Date(compromisso.dataHora).getTime() - new Date(diaRelativo(0, 0)).getTime()) / 86_400_000
  );
  const quando = diaRelativo(Math.max(diasAteCompromisso - 1, 0), CONFIG_SERVICO.horaPadraoLembrete);
  paciente.lembretes.push({
    id: gerarId('lem'),
    texto: `${compromisso.titulo} tomorrow, ${dataHoraPorExtenso(compromisso.dataHora)}, at the ${compromisso.local}`,
    dataHora: quando,
    compromissoId: compromisso.id,
    criadoEm: agoraISO(),
  });
  falar(paciente, `Done, the reminder is set for ${dataHoraPorExtenso(quando)}.`, { status: 'confirmado' });
}

export function responderProposta(pacienteId: string, token: string, aceitar: boolean): void {
  const paciente = obterPaciente(pacienteId);
  const proposta = propostaDe(paciente.id);
  if (!proposta || proposta.token !== token) {
    throw new ErroDominio(409, 'proposta_inexistente', 'This confirmation is no longer available.');
  }
  limparProposta(paciente.id);
  adicionarMensagem(paciente, {
    autor: 'paciente',
    nomeAutor: paciente.nome,
    texto: aceitar ? proposta.rotuloConfirmar : proposta.rotuloRecusar,
    visivelPaciente: true,
  });

  if (new Date(proposta.expiraEm).getTime() < Date.now()) {
    falar(paciente, "This confirmation expired and I didn't change anything. Do you want me to prepare it again?");
    return;
  }
  if (!aceitar) {
    falar(paciente, "All right, I didn't change anything. If you change your mind, just ask me.");
    return;
  }
  executar(paciente, proposta);
}

function executar(paciente: Paciente, proposta: PropostaInterna): void {
  const dados = proposta.dados;
  const texto = typeof dados.texto === 'string' ? dados.texto : undefined;
  switch (proposta.acao) {
    case 'lembrete': {
      const compromisso = paciente.agenda.find((c) => c.id === dados.compromissoId);
      if (compromisso) executarLembrete(paciente, compromisso);
      return;
    }
    case 'reagendamento': {
      const compromisso = paciente.agenda.find((c) => c.id === dados.compromissoId);
      if (!compromisso) return;
      criarPendencia(paciente, {
        tipo: 'reagendamento',
        origem: 'solicitacao_paciente',
        titulo: `Rescheduling request · ${compromisso.titulo}`,
        falaLiteral: texto,
        confirmadaPeloPaciente: true,
      });
      falar(
        paciente,
        `I logged your rescheduling request for ${seuCompromisso(compromisso)}, ${dataHoraPorExtenso(compromisso.dataHora)}. The team will review it and you will see the answer here.`,
        { status: 'registrado' }
      );
      return;
    }
    case 'contato_equipe': {
      criarPendencia(paciente, {
        tipo: 'contato_equipe',
        origem: 'solicitacao_paciente',
        titulo: 'Request to contact the team',
        falaLiteral: texto,
        confirmadaPeloPaciente: true,
      });
      falar(
        paciente,
        `I forwarded your request to the nursing team. The service's agreed response time is up to ${CONFIG_SERVICO.prazoHorasPorTipo.contato_equipe} hours.`,
        { status: 'encaminhado' }
      );
      return;
    }
    case 'duvida': {
      criarPendencia(paciente, {
        tipo: 'duvida',
        origem: 'solicitacao_paciente',
        titulo: 'Question for the team',
        falaLiteral: texto,
        confirmadaPeloPaciente: true,
      });
      falar(paciente, 'I logged your question for the team. The answer will show up here.', { status: 'registrado' });
      return;
    }
    case 'relato_urgencia': {
      const pendencia = obterPendencia(String(dados.pendenciaId));
      pendencia.confirmadaPeloPaciente = true;
      falar(
        paciente,
        `I forwarded your report to the nursing team. The service's agreed response time is up to ${CONFIG_SERVICO.prazoHorasPorTipo.sinal_urgencia} hours. If it gets worse, don't wait: go to the urgent care unit.`,
        { status: 'encaminhado' }
      );
      return;
    }
    case 'checkin': {
      const opcoes = (dados.opcoes as OpcaoCheckin[]) ?? [];
      const origem = dados.origem === 'voz' ? 'voz' : 'visual';
      const { urgencia } = registrarCheckin(paciente, opcoes, texto, origem);
      if (!urgencia) {
        falar(paciente, "I logged today's check-in. Your team will see it as agreed with the service.", {
          status: 'registrado',
        });
      }
      return;
    }
  }
}
