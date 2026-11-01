// Estado da demo em memória, compartilhado pelo OncoFlow Pro (equipe) e pelo OncoFlow Paciente.
// No IRIS esse estado vivia dentro do React; aqui ele fica no servidor para que a equipe e a
// paciente vejam os mesmos dados em abas ou aparelhos diferentes. A persistência da demonstração
// é instalada pelo servidor; somente POST /api/demo/reset volta ao seed.

import type {
  Checkin,
  Desfecho,
  Mensagem,
  OpcaoCheckin,
  Paciente,
  Pendencia,
  SituacaoPaciente,
  TipoPendencia,
  UsuarioEquipe,
} from '../src/types';
import { CONFIG_SERVICO, type RegraRevisaoCheckin } from './configServico';
import { criarSeed, SESSOES_PACIENTE, USUARIOS_EQUIPE } from './seed';
import { detectarUrgencia } from './urgencia';
import { agoraISO, gerarId, horarioDe, somarHoras } from './util';
import { iniciarVideochamada as gerarSalaVideochamada } from '../src/services/chamadaService';

export class ErroDominio extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string
  ) {
    super(mensagem);
  }
}

export type AcaoProposta =
  | 'reagendamento'
  | 'contato_equipe'
  | 'duvida'
  | 'relato_urgencia'
  | 'checkin'
  | 'lembrete';

export interface PropostaInterna {
  token: string;
  pacienteId: string;
  acao: AcaoProposta;
  resumo: string;
  rotuloConfirmar: string;
  rotuloRecusar: string;
  expiraEm: string;
  dados: Record<string, unknown>;
}

interface EventoAuditoria {
  em: string;
  ator: string;
  acao: string;
  alvo: string;
}

const estado = {
  versao: 1,
  pacientes: [] as Paciente[],
  pendencias: [] as Pendencia[],
  propostas: new Map<string, PropostaInterna>(),
  auditoria: [] as EventoAuditoria[],
};

type EstadoSalvo = Pick<typeof estado, 'versao' | 'pacientes' | 'pendencias' | 'auditoria'>;
const aoResetar = new Set<() => void>();
export function observarReset(callback: () => void): () => void {
  aoResetar.add(callback);
  return () => aoResetar.delete(callback);
}
export function exportarEstado(): EstadoSalvo {
  return { versao: estado.versao, pacientes: estado.pacientes, pendencias: estado.pendencias, auditoria: estado.auditoria };
}
export function importarEstado(salvo: EstadoSalvo): void {
  if (!salvo || !Array.isArray(salvo.pacientes) || !salvo.pacientes.length || !Array.isArray(salvo.pendencias) || !Array.isArray(salvo.auditoria)) {
    throw new Error('Invalid saved fictional demo state. Restore the file or reset it explicitly.');
  }
  estado.versao = salvo.versao;
  estado.pacientes = salvo.pacientes;
  estado.pendencias = salvo.pendencias;
  estado.auditoria = salvo.auditoria;
  estado.propostas.clear();
}
export function marcarAlteracao(): void { mudou(); }

export function resetar(): void {
  const seed = criarSeed();
  estado.pacientes = seed.pacientes;
  estado.pendencias = seed.pendencias;
  estado.propostas.clear();
  estado.auditoria = [];
  estado.versao += 1;
  for (const callback of aoResetar) callback();
}

resetar();

export function versaoAtual(): number {
  return estado.versao;
}

function mudou(): void {
  estado.versao += 1;
}

export function todosPacientes(): Paciente[] {
  return estado.pacientes;
}

export function todasPendencias(): Pendencia[] {
  return estado.pendencias;
}

export function obterPaciente(id: string): Paciente {
  const paciente = estado.pacientes.find((p) => p.id === id);
  if (!paciente) throw new ErroDominio(404, 'paciente_nao_encontrado', 'Patient not found.');
  return paciente;
}

export function pacienteDaSessao(token: string | undefined): Paciente {
  const id = token ? SESSOES_PACIENTE[token] : undefined;
  if (!id) throw new ErroDominio(401, 'sessao_invalida', 'Invalid patient session.');
  return obterPaciente(id);
}

export function usuarioPorId(id: string | undefined): UsuarioEquipe {
  const usuario = USUARIOS_EQUIPE.find((u) => u.id === id);
  if (!usuario) throw new ErroDominio(401, 'usuario_invalido', 'Team user not identified.');
  return usuario;
}

export function auditar(ator: string, acao: string, alvo: string): void {
  estado.auditoria.push({ em: agoraISO(), ator, acao, alvo });
}

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

export function adicionarMensagem(
  paciente: Paciente,
  parcial: Omit<Mensagem, 'id' | 'em' | 'horario'>
): Mensagem {
  const em = agoraISO();
  const mensagem: Mensagem = { id: gerarId('msg'), em, horario: horarioDe(em), ...parcial };
  paciente.mensagens.push(mensagem);
  paciente.ultimaInteracao = `Today, ${mensagem.horario}`;
  mudou();
  return mensagem;
}

function marcadorEquipe(paciente: Paciente, texto: string, tipoSistema: Mensagem['tipoSistema']): void {
  adicionarMensagem(paciente, {
    autor: 'sistema',
    nomeAutor: 'System',
    texto,
    sistema: true,
    tipoSistema,
    visivelPaciente: false,
  });
}

function marcadorParaTodos(paciente: Paciente, texto: string): void {
  adicionarMensagem(paciente, {
    autor: 'sistema',
    nomeAutor: 'System',
    texto,
    sistema: true,
    tipoSistema: 'info',
    visivelPaciente: true,
  });
}

export function assumirConversa(pacienteId: string, usuario: UsuarioEquipe): void {
  const paciente = obterPaciente(pacienteId);
  if (paciente.modoConversa === 'profissional' && paciente.profissionalResponsavel === usuario.nome) {
    paciente.ultimaAtividadeProfissional = agoraISO();
    return;
  }
  paciente.modoConversa = 'profissional';
  paciente.profissionalResponsavel = usuario.nome;
  paciente.ultimaAtividadeProfissional = agoraISO();
  estado.propostas.delete(pacienteId);
  marcadorParaTodos(paciente, `${usuario.nome} joined the conversation`);
  auditar(usuario.nome, 'assumiu_conversa', pacienteId);
}

export function devolverParaLia(
  pacienteId: string,
  usuario: UsuarioEquipe | undefined,
  motivo: 'manual' | 'inatividade'
): void {
  const paciente = obterPaciente(pacienteId);
  if (paciente.modoConversa === 'lia') return;
  paciente.modoConversa = 'lia';
  paciente.profissionalResponsavel = undefined;
  paciente.ultimaAtividadeProfissional = undefined;
  marcadorParaTodos(
    paciente,
    motivo === 'inatividade'
      ? `${CONFIG_SERVICO.assistenteNome} took the conversation back after a period without team activity`
      : `${usuario?.nome ?? 'The team'} handed the conversation back to ${CONFIG_SERVICO.assistenteNome}`
  );
  auditar(usuario?.nome ?? 'sistema', `devolveu_conversa_${motivo}`, pacienteId);
}

export function mensagemDoProfissional(pacienteId: string, usuario: UsuarioEquipe, texto: string): void {
  // Validate before assuming the conversation or appending its team-joined marker.
  // The native strict contract accepts at most 4,000 characters per message.
  if (texto.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(texto)) {
    throw new ErroDominio(400, 'mensagem_invalida', 'Use a message with up to 4,000 characters and no invalid control characters.');
  }
  const limpo = texto.trim();
  if (!limpo) throw new ErroDominio(400, 'texto_vazio', 'Type a message.');
  // Como no IRIS: enviar uma mensagem com a Lia ativa faz o profissional assumir a conversa.
  assumirConversa(pacienteId, usuario);
  const paciente = obterPaciente(pacienteId);
  paciente.ultimaAtividadeProfissional = agoraISO();
  adicionarMensagem(paciente, {
    autor: 'profissional',
    nomeAutor: usuario.nome,
    texto: limpo,
    visivelPaciente: true,
  });
  auditar(usuario.nome, 'enviou_mensagem', pacienteId);
}

export function iniciarVideochamada(pacienteId: string, usuario: UsuarioEquipe): string {
  const paciente = obterPaciente(pacienteId);
  const sala = gerarSalaVideochamada(paciente.id);
  assumirConversa(pacienteId, usuario);
  adicionarMensagem(paciente, {
    autor: 'sistema',
    nomeAutor: 'System',
    texto: `Video call opened by ${usuario.nome}`,
    sistema: true,
    tipoSistema: 'videochamada',
    link: sala,
    visivelPaciente: true,
  });
  auditar(usuario.nome, 'abriu_videochamada', pacienteId);
  return sala;
}

// Herdado do IRIS: sem atividade do profissional por N minutos, a Lia volta a atender.
export function verificarInatividade(): void {
  const limite = CONFIG_SERVICO.minutosRetornoLia * 60_000;
  const agora = Date.now();
  for (const paciente of estado.pacientes) {
    if (paciente.modoConversa !== 'profissional' || !paciente.ultimaAtividadeProfissional) continue;
    if (agora - new Date(paciente.ultimaAtividadeProfissional).getTime() >= limite) {
      devolverParaLia(paciente.id, undefined, 'inatividade');
    }
  }
}

export function atualizarPlano(pacienteId: string, usuario: UsuarioEquipe, texto: string, atualizadoEm: string): void {
  const paciente = obterPaciente(pacienteId);
  if (!texto.trim()) throw new ErroDominio(400, 'plano_vazio', 'The plan file is empty.');
  paciente.planoTerapeuticoTexto = texto.trim();
  paciente.planoAtualizadoEm = atualizadoEm;
  auditar(usuario.nome, 'atualizou_plano', pacienteId);
  mudou();
}

// ---------------------------------------------------------------------------
// Pendências
// ---------------------------------------------------------------------------

export function criarPendencia(
  paciente: Paciente,
  dados: Omit<Pendencia, 'id' | 'pacienteId' | 'estado' | 'criadaEm' | 'prazo' | 'papelDestino'> & {
    papelDestino?: Pendencia['papelDestino'];
    prazoHoras?: number;
  }
): Pendencia {
  const criadaEm = agoraISO();
  const { prazoHoras, papelDestino, ...resto } = dados;
  const pendencia: Pendencia = {
    id: gerarId('pend'),
    pacienteId: paciente.id,
    estado: 'aberta',
    criadaEm,
    papelDestino: papelDestino ?? CONFIG_SERVICO.papelPorTipo[dados.tipo],
    prazo: somarHoras(criadaEm, prazoHoras ?? CONFIG_SERVICO.prazoHorasPorTipo[dados.tipo]),
    ...resto,
  };
  estado.pendencias.push(pendencia);
  mudou();
  return pendencia;
}

export function obterPendencia(id: string): Pendencia {
  const pendencia = estado.pendencias.find((p) => p.id === id);
  if (!pendencia) throw new ErroDominio(404, 'pendencia_nao_encontrada', 'Pending item not found.');
  return pendencia;
}

export function assumirPendencia(id: string, usuario: UsuarioEquipe): void {
  const pendencia = obterPendencia(id);
  if (pendencia.estado === 'concluida') {
    throw new ErroDominio(409, 'pendencia_concluida', 'This pending item is already closed.');
  }
  pendencia.estado = 'em_andamento';
  pendencia.responsavel = usuario.nome;
  auditar(usuario.nome, 'assumiu_pendencia', id);
  mudou();
}

export function concluirPendencia(id: string, usuario: UsuarioEquipe, desfecho: Desfecho): void {
  const pendencia = obterPendencia(id);
  if (pendencia.estado === 'concluida') {
    throw new ErroDominio(409, 'pendencia_concluida', 'This pending item is already closed.');
  }
  pendencia.estado = 'concluida';
  pendencia.responsavel = pendencia.responsavel ?? usuario.nome;
  pendencia.desfecho = desfecho;
  pendencia.concluidaEm = agoraISO();
  pendencia.concluidaPor = usuario.nome;
  auditar(usuario.nome, `concluiu_pendencia_${desfecho}`, id);
  mudou();
}

export function situacaoDe(pacienteId: string): SituacaoPaciente {
  const abertas = estado.pendencias.filter((p) => p.pacienteId === pacienteId && p.estado !== 'concluida');
  if (abertas.some((p) => p.tipo === 'sinal_urgencia')) return 'sinal_a_revisar';
  if (abertas.length > 0) return 'aguardando_revisao';
  return 'sem_pendencias';
}

// Possível urgência: o paciente vê o aviso aprovado pelo hospital; a equipe recebe uma hipótese
// do sistema para revisar, com a fala literal ao lado. Nada disso é classificação clínica.
export function registrarSinalUrgencia(paciente: Paciente, falaLiteral: string, termo: string): Pendencia {
  const aviso = CONFIG_SERVICO.avisoUrgencia;
  adicionarMensagem(paciente, {
    autor: 'lia',
    nomeAutor: CONFIG_SERVICO.assistenteNome,
    texto: `${aviso.titulo}. ${aviso.texto}`,
    sistema: true,
    tipoSistema: 'urgencia',
    visivelPaciente: true,
  });
  const pendencia = criarPendencia(paciente, {
    tipo: 'sinal_urgencia',
    origem: 'hipotese_sistema',
    titulo: 'Possible urgency sign mentioned',
    falaLiteral,
    motivo: `Term from the service list: "${termo}"`,
  });
  marcadorEquipe(
    paciente,
    `Possible urgency sign mentioned ("${termo}") · system hypothesis, awaiting review`,
    'hipotese'
  );
  return pendencia;
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

function regraQueDispara(paciente: Paciente): RegraRevisaoCheckin | undefined {
  const ordenados = [...paciente.checkins].sort((a, b) => a.em.localeCompare(b.em));
  return CONFIG_SERVICO.regrasRevisao.find((regra) => {
    const ultimos = ordenados.slice(-regra.emSeguida);
    if (ultimos.length < regra.emSeguida) return false;
    return ultimos.every((c) => c.opcoes.some((o) => regra.seAlgumaOpcao.includes(o)));
  });
}

export function registrarCheckin(
  paciente: Paciente,
  opcoes: OpcaoCheckin[],
  texto: string | undefined,
  origem: Checkin['origem']
): { checkin: Checkin; urgencia: boolean } {
  if (opcoes.length === 0 && !texto?.trim()) {
    throw new ErroDominio(400, 'checkin_vazio', 'Pick an option or tell us how you are.');
  }
  const checkin: Checkin = {
    id: gerarId('ck'),
    em: agoraISO(),
    opcoes,
    texto: texto?.trim() || undefined,
    origem,
  };
  paciente.checkins.push(checkin);
  mudou();
  auditar(paciente.nome, 'registrou_checkin', paciente.id);

  const regra = regraQueDispara(paciente);
  if (regra) {
    criarPendencia(paciente, {
      tipo: 'checkin',
      origem: 'regra_servico',
      titulo: 'Check-in awaiting review',
      falaLiteral: checkin.texto,
      motivo: regra.exemplo ? `${regra.descricao} (illustrative criterion, to be defined with the service)` : regra.descricao,
      papelDestino: regra.papelDestino,
      prazoHoras: regra.prazoHoras,
    });
    marcadorEquipe(paciente, `Check-in logged · awaiting review (${regra.descricao})`, 'info');
  }

  const urgencia = checkin.texto ? detectarUrgencia(checkin.texto) : undefined;
  if (urgencia) registrarSinalUrgencia(paciente, checkin.texto!, urgencia.termo);

  return { checkin, urgencia: Boolean(urgencia) };
}

// ---------------------------------------------------------------------------
// Propostas da Lia (confirmação em duas fases)
// ---------------------------------------------------------------------------

export function definirProposta(
  paciente: Paciente,
  proposta: Omit<PropostaInterna, 'token' | 'pacienteId' | 'expiraEm'>
): PropostaInterna {
  const completa: PropostaInterna = {
    ...proposta,
    token: gerarId('conf'),
    pacienteId: paciente.id,
    expiraEm: new Date(Date.now() + CONFIG_SERVICO.minutosValidadeConfirmacao * 60_000).toISOString(),
  };
  estado.propostas.set(paciente.id, completa);
  mudou();
  return completa;
}

export function propostaDe(pacienteId: string): PropostaInterna | undefined {
  return estado.propostas.get(pacienteId);
}

export function limparProposta(pacienteId: string): void {
  if (estado.propostas.delete(pacienteId)) mudou();
}

export function pendenciasPorTipo(pacienteId: string, tipo: TipoPendencia): Pendencia[] {
  return estado.pendencias.filter((p) => p.pacienteId === pacienteId && p.tipo === tipo);
}
