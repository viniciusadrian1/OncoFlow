// O que cada experiência recebe. A visão do paciente é uma lista explícita de campos: nunca
// reaproveite a visão da equipe na rota do paciente (é assim que vazam marcadores internos,
// hipóteses do sistema e o plano terapêutico).

import type {
  EstadoPro,
  EstadoSolicitacaoPaciente,
  InicioPaciente,
  Paciente,
  Pendencia,
} from '../src/types';
import { CONFIG_SERVICO } from './configServico';
import { propostaDe, situacaoDe, todasPendencias, todosPacientes, versaoAtual } from './estado';
import { USUARIOS_EQUIPE } from './seed';

export function visaoPro(): EstadoPro {
  const pendencias = todasPendencias();
  return {
    versao: versaoAtual(),
    pacientes: todosPacientes().map((p) => ({
      ...p,
      pendencias: pendencias
        .filter((pe) => pe.pacienteId === p.id)
        .sort((a, b) => a.prazo.localeCompare(b.prazo)),
      situacao: situacaoDe(p.id),
    })),
    usuarios: USUARIOS_EQUIPE,
    regrasRevisao: CONFIG_SERVICO.regrasRevisao.map(({ id, descricao, exemplo }) => ({ id, descricao, exemplo })),
    minutosRetornoLia: CONFIG_SERVICO.minutosRetornoLia,
  };
}

function estadoParaPaciente(pendencia: Pendencia): EstadoSolicitacaoPaciente {
  if (pendencia.estado === 'concluida') return 'respondida';
  if (pendencia.estado === 'em_andamento') return 'com_a_equipe';
  return 'registrada';
}

export function visaoPaciente(paciente: Paciente): InicioPaciente {
  const agora = Date.now();
  const agenda = [...paciente.agenda]
    .filter((c) => new Date(c.dataHora).getTime() > agora)
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const proposta = propostaDe(paciente.id);

  return {
    versao: versaoAtual(),
    primeiroNome: paciente.nome.split(' ')[0],
    assistenteNome: CONFIG_SERVICO.assistenteNome,
    proximoCompromisso: agenda[0],
    jornada: paciente.jornada,
    agenda,
    documentos: [...paciente.documentos].sort((a, b) => b.data.localeCompare(a.data)),
    lembretes: paciente.lembretes,
    checkins: [...paciente.checkins].sort((a, b) => b.em.localeCompare(a.em)),
    conversa: paciente.mensagens.filter((m) => m.visivelPaciente),
    modoConversa: paciente.modoConversa,
    atendente: paciente.modoConversa === 'profissional' ? paciente.profissionalResponsavel : undefined,
    solicitacoes: todasPendencias()
      .filter((p) => p.pacienteId === paciente.id && p.confirmadaPeloPaciente)
      .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm))
      .map((p) => ({
        id: p.id,
        // O título da hipótese ("possível sinal de urgência") é linguagem da equipe, não do paciente.
        titulo: p.tipo === 'sinal_urgencia' ? 'Report for the nursing team' : p.titulo,
        estado: estadoParaPaciente(p),
        criadaEm: p.criadaEm,
      })),
    proposta: proposta
      ? {
          token: proposta.token,
          resumo: proposta.resumo,
          rotuloConfirmar: proposta.rotuloConfirmar,
          rotuloRecusar: proposta.rotuloRecusar,
          expiraEm: proposta.expiraEm,
        }
      : undefined,
    avisoUrgencia: CONFIG_SERVICO.avisoUrgencia,
    quemVe: CONFIG_SERVICO.quemVe,
  };
}
