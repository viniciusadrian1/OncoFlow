// Tipos compartilhados pelo servidor (server/) e pelos dois apps: OncoFlow Pro (equipe, base IRIS)
// e OncoFlow Paciente. O servidor nunca envia `Paciente` inteiro ao app do paciente: ele monta
// `InicioPaciente` com uma lista explícita de campos (server/visoes.ts).

export type PapelEquipe = 'medico' | 'enfermagem' | 'navegacao';

export interface UsuarioEquipe {
  id: string;
  nome: string;
  cargo: string;
  email: string;
  papel: PapelEquipe;
}

// ---------------------------------------------------------------------------
// Conversa (uma por paciente: a Lia atende e a equipe pode assumir, como no IRIS)
// ---------------------------------------------------------------------------

export type AutorMensagem = 'lia' | 'paciente' | 'profissional' | 'sistema';

// Os quatro status da Lia (princípio 5): só `confirmado` permite dizer que algo foi feito.
export type StatusResultado = 'consultado' | 'registrado' | 'encaminhado' | 'confirmado';

export type TipoSistema = 'info' | 'urgencia' | 'hipotese' | 'videochamada' | 'erro_tecnico';

export interface AcaoMensagem {
  rotulo: string;
  tipo: 'abrir_documento' | 'abrir_tela';
  alvo: string;
}

export interface Mensagem {
  id: string;
  autor: AutorMensagem;
  nomeAutor: string;
  texto: string;
  horario: string; // HH:MM, fuso de São Paulo
  em: string; // ISO 8601
  sistema?: boolean;
  tipoSistema?: TipoSistema;
  visivelPaciente: boolean; // marcadores internos da equipe (hipóteses) ficam fora do app do paciente
  status?: StatusResultado;
  origem?: 'texto' | 'voz';
  link?: string;
  acoes?: AcaoMensagem[];
}

export type ModoConversa = 'lia' | 'profissional';

// Tempo de inatividade do profissional antes de a Lia voltar a atender (herdado do IRIS).
// O valor efetivo vem da configuração do serviço (server/configServico.ts).
export const MINUTOS_RETORNO_LIA_PADRAO = 20;

// ---------------------------------------------------------------------------
// Jornada, agenda, documentos, lembretes e check-ins (OncoFlow Paciente)
// ---------------------------------------------------------------------------

export type EstadoEtapa = 'concluida' | 'em_andamento' | 'proxima' | 'aguardando' | 'futura';

export interface EtapaJornada {
  id: string;
  titulo: string;
  descricao: string;
  estado: EstadoEtapa;
  responsavel?: string;
  oQueFazer?: string;
}

export interface Compromisso {
  id: string;
  titulo: string;
  tipo: 'consulta' | 'exame' | 'retorno';
  dataHora: string; // ISO
  local: string;
  profissional?: string;
  preparo?: string; // somente orientação institucional validada
}

export interface Documento {
  id: string;
  titulo: string;
  tipo: 'resultado' | 'orientacao';
  data: string; // ISO
  texto: string;
  liberadoPor: string;
}

export interface Lembrete {
  id: string;
  texto: string;
  dataHora: string;
  compromissoId?: string;
  criadoEm: string;
}

export type OpcaoCheckin = 'bem' | 'cansaco' | 'dor' | 'nausea' | 'ansiedade' | 'outro';

export const ROTULO_OPCAO_CHECKIN: Record<OpcaoCheckin, string> = {
  bem: 'Well',
  cansaco: 'Tired',
  dor: 'In pain',
  nausea: 'Nauseous',
  ansiedade: 'Anxious',
  outro: 'Other',
};

export interface Checkin {
  id: string;
  em: string;
  opcoes: OpcaoCheckin[];
  texto?: string;
  origem: 'visual' | 'voz';
}

// ---------------------------------------------------------------------------
// Pendências da equipe: tudo o que espera revisão tem origem, status, responsável e prazo
// ---------------------------------------------------------------------------

export type TipoPendencia =
  | 'sinal_urgencia'
  | 'checkin'
  | 'contato_equipe'
  | 'reagendamento'
  | 'duvida';

export type OrigemPendencia = 'hipotese_sistema' | 'solicitacao_paciente' | 'regra_servico';

export type EstadoPendencia = 'aberta' | 'em_andamento' | 'concluida';

export type Desfecho = 'sem_acao_necessaria' | 'contato_realizado' | 'encaminhado';

export const ROTULO_DESFECHO: Record<Desfecho, string> = {
  sem_acao_necessaria: 'No action needed',
  contato_realizado: 'Contact made',
  encaminhado: 'Referred',
};

export interface Pendencia {
  id: string;
  pacienteId: string;
  tipo: TipoPendencia;
  origem: OrigemPendencia;
  estado: EstadoPendencia;
  titulo: string;
  falaLiteral?: string;
  motivo?: string; // termo detectado ou regra do serviço que gerou a pendência
  confirmadaPeloPaciente?: boolean; // relato que o paciente pediu para encaminhar
  papelDestino: PapelEquipe;
  criadaEm: string;
  prazo: string;
  responsavel?: string;
  desfecho?: Desfecho;
  concluidaEm?: string;
  concluidaPor?: string;
}

// Situação operacional derivada das pendências abertas. Não é prioridade clínica: quem define
// prioridade clínica é a equipe (princípio 2).
export type SituacaoPaciente = 'sinal_a_revisar' | 'aguardando_revisao' | 'sem_pendencias';

// ---------------------------------------------------------------------------
// Paciente: visão completa (servidor) e visões por experiência
// ---------------------------------------------------------------------------

export interface Paciente {
  id: string;
  nome: string;
  idade: number;
  diagnosticoResumido: string;
  esquemaResumido: string;
  cicloAtual: string;
  ecog: string;
  ultimaInteracao: string;
  planoTerapeuticoTexto: string; // documento da equipe; não alimenta respostas ao paciente
  planoAtualizadoEm: string;
  mensagens: Mensagem[];
  modoConversa: ModoConversa;
  profissionalResponsavel?: string;
  ultimaAtividadeProfissional?: string;
  jornada: EtapaJornada[];
  agenda: Compromisso[];
  documentos: Documento[];
  lembretes: Lembrete[];
  checkins: Checkin[];
}

export interface PacientePro extends Paciente {
  pendencias: Pendencia[];
  situacao: SituacaoPaciente;
}

export interface RegraRevisaoPublica {
  id: string;
  descricao: string;
  exemplo: boolean;
}

export interface EstadoPro {
  versao: number;
  pacientes: PacientePro[];
  usuarios: UsuarioEquipe[];
  regrasRevisao: RegraRevisaoPublica[];
  minutosRetornoLia: number;
}

export interface PropostaLia {
  token: string;
  resumo: string;
  rotuloConfirmar: string;
  rotuloRecusar: string;
  expiraEm: string;
}

export type EstadoSolicitacaoPaciente = 'registrada' | 'com_a_equipe' | 'respondida';

export interface SolicitacaoPaciente {
  id: string;
  titulo: string;
  estado: EstadoSolicitacaoPaciente;
  criadaEm: string;
}

export interface AvisoUrgencia {
  titulo: string;
  texto: string;
  contato: string;
}

export interface InicioPaciente {
  versao: number;
  primeiroNome: string;
  assistenteNome: string;
  proximoCompromisso?: Compromisso;
  jornada: EtapaJornada[];
  agenda: Compromisso[];
  documentos: Documento[];
  lembretes: Lembrete[];
  checkins: Checkin[];
  conversa: Mensagem[];
  modoConversa: ModoConversa;
  atendente?: string;
  solicitacoes: SolicitacaoPaciente[];
  proposta?: PropostaLia;
  avisoUrgencia: AvisoUrgencia;
  quemVe: string;
}
