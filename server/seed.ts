// Seed fictício da demo. Todos os nomes, documentos, telefones e planos são inventados.
// Maria é a protagonista do roteiro do OncoFlow; José, Renato e Ana vêm do protótipo IRIS.
// As respostas clínicas que o IRIS dava automaticamente agora aparecem como mensagens de
// profissionais: no OncoFlow, orientação clínica é da equipe, nunca da Lia.

import type { Mensagem, Paciente, Pendencia, UsuarioEquipe } from '../src/types';
import { CONFIG_SERVICO } from './configServico';
import { PLANOS_IRIS } from './planosIris';
import { diaRelativo, horarioDe, proximoDiaDaSemana, somarHoras } from './util';

export const USUARIOS_EQUIPE: UsuarioEquipe[] = [
  {
    id: 'usr-camila',
    nome: 'Dr. Camila Ribeiro',
    cargo: 'Medical oncologist · License 145892 (fictional)',
    email: 'camila.oncologia@hospital-ficticio.org',
    papel: 'medico',
  },
  {
    id: 'usr-rodrigo',
    nome: 'Nurse Rodrigo Mendes',
    cargo: 'Oncology nurse · License 234567 (fictional)',
    email: 'rodrigo.enfermagem@hospital-ficticio.org',
    papel: 'enfermagem',
  },
  {
    id: 'usr-carla',
    nome: 'Carla Menezes',
    cargo: 'Patient navigator',
    email: 'carla.navegacao@hospital-ficticio.org',
    papel: 'navegacao',
  },
];

// Sessões da demo. Em produção o paciente vem do token de autenticação, nunca da URL.
export const SESSOES_PACIENTE: Record<string, string> = {
  'demo-maria': 'pac-maria',
};

function minutosAtras(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

let seq = 0;
function msg(
  autor: Mensagem['autor'],
  nomeAutor: string,
  texto: string,
  em: string,
  extra: Partial<Mensagem> = {}
): Mensagem {
  seq += 1;
  return {
    id: `seed-m${seq}`,
    autor,
    nomeAutor,
    texto,
    em,
    horario: horarioDe(em),
    visivelPaciente: true,
    ...extra,
  };
}

const APRESENTACAO_LIA =
  "Hi, I'm Lia, OncoFlow's virtual assistant. I'm here to help you organize your care journey. We can talk whenever you need.";

export function criarSeed(): { pacientes: Paciente[]; pendencias: Pendencia[] } {
  seq = 0;
  const consultaMaria = proximoDiaDaSemana(2, 14); // próxima terça, 14h (mockup do conceito)
  const examesMaria = proximoDiaDaSemana(4, 7, 30); // próxima quinta, 7h30

  const maria: Paciente = {
    id: 'pac-maria',
    nome: 'Maria Oliveira Costa',
    idade: 34,
    diagnosticoResumido: 'Invasive breast carcinoma, newly diagnosed. Staging in progress.',
    esquemaResumido: 'To be defined after the oncology appointment and pre-treatment tests.',
    cicloAtual: 'Pre-treatment',
    ecog: 'ECOG 0',
    ultimaInteracao: 'Yesterday',
    planoAtualizadoEm: '',
    planoTerapeuticoTexto:
      "Patient: Maria Oliveira Costa, 34 years old (fictional data).\n\nTreatment plan not yet defined. Oncology appointment in progress; pre-treatment tests ordered. Log the patient's questions for discussion at the appointment.",
    modoConversa: 'lia',
    jornada: [
      {
        id: 'et-m1',
        titulo: 'Diagnosis recorded',
        descricao: 'Your diagnosis was recorded by the team.',
        estado: 'concluida',
        responsavel: 'Dr. Camila Ribeiro',
      },
      {
        id: 'et-m2',
        titulo: 'Oncology appointment',
        descricao: 'A conversation with your oncologist to define the next steps of your treatment.',
        estado: 'em_andamento',
        responsavel: 'Dr. Camila Ribeiro',
        oQueFazer: 'Bring your previous test results and the list of medications you take.',
      },
      {
        id: 'et-m3',
        titulo: 'Pre-treatment tests',
        descricao: 'Blood tests ordered by the team before starting treatment.',
        estado: 'aguardando',
        responsavel: 'Navigation · Carla Menezes',
        oQueFazer: 'Follow the prep instructions shown on your schedule.',
      },
      {
        id: 'et-m4',
        titulo: 'Treatment start',
        descricao: 'Will be scheduled after the appointment and the tests.',
        estado: 'futura',
      },
      {
        id: 'et-m5',
        titulo: 'Follow-up',
        descricao: 'Appointments and check-ins throughout treatment.',
        estado: 'futura',
      },
    ],
    agenda: [
      {
        id: 'ag-m1',
        titulo: 'Oncology appointment',
        tipo: 'consulta',
        dataHora: consultaMaria,
        local: 'Oncology Outpatient Clinic',
        profissional: 'Dr. Camila Ribeiro',
        preparo:
          'Bring a photo ID, your previous test results and the list of medications you take. Arrive 20 minutes early. (Fictional institutional instructions.)',
      },
      {
        id: 'ag-m2',
        titulo: 'Pre-treatment blood tests',
        tipo: 'exame',
        dataHora: examesMaria,
        local: 'Laboratory · ground floor',
        preparo:
          'Fast for 8 hours. You may drink water. Bring the test order and a photo ID. (Fictional institutional instructions.)',
      },
    ],
    documentos: [
      {
        id: 'doc-m1',
        titulo: 'Complete blood count result',
        tipo: 'resultado',
        data: diaRelativo(-20, 10),
        texto:
          'Complete blood count done at the hospital laboratory. The result was reviewed by Dr. Camila Ribeiro and will be discussed with you at your next appointment. (Fictional document.)',
        liberadoPor: 'Dr. Camila Ribeiro',
      },
      {
        id: 'doc-m2',
        titulo: 'Guidance for your first appointment',
        tipo: 'orientacao',
        data: diaRelativo(-5, 15),
        texto:
          'Write down your questions before the appointment. You can bring someone you trust. If you need to reschedule, ask through the app or Lia: the team reviews it and answers here. (Fictional institutional instructions.)',
        liberadoPor: 'Carla Menezes · Navigation',
      },
    ],
    lembretes: [],
    checkins: [
      { id: 'ck-m1', em: diaRelativo(-6, 19), opcoes: ['bem'], origem: 'visual' },
      { id: 'ck-m2', em: diaRelativo(-3, 20), opcoes: ['bem'], origem: 'visual' },
      {
        id: 'ck-m3',
        em: diaRelativo(-1, 21),
        opcoes: ['cansaco'],
        texto: "I haven't slept much this week.",
        origem: 'visual',
      },
    ],
    mensagens: [msg('lia', 'Lia', APRESENTACAO_LIA, diaRelativo(-1, 9))],
  };

  const jose: Paciente = {
    id: 'pac-001',
    nome: 'José Pereira da Silva',
    idade: 64,
    diagnosticoResumido:
      'Non-small cell lung carcinoma, stage IV, EGFR mutation positive.',
    esquemaResumido: 'Carboplatin + Pemetrexed every 21 days + continuous Gefitinib.',
    cicloAtual: 'D8 of cycle 2',
    ecog: 'ECOG 1',
    ultimaInteracao: 'Hoje',
    planoAtualizadoEm: '08/25/2026 08:30',
    planoTerapeuticoTexto: PLANOS_IRIS['pac-001'],
    modoConversa: 'lia',
    jornada: [
      { id: 'et-j1', titulo: 'Diagnosis recorded', descricao: '', estado: 'concluida' },
      { id: 'et-j2', titulo: 'Treatment · cycle 2', descricao: '', estado: 'em_andamento' },
      { id: 'et-j3', titulo: 'Cycle 3', descricao: '', estado: 'futura' },
    ],
    agenda: [
      {
        id: 'ag-j1',
        titulo: 'Chemotherapy · cycle 3',
        tipo: 'consulta',
        dataHora: diaRelativo(13, 8),
        local: 'Chemotherapy center',
      },
    ],
    documentos: [],
    lembretes: [],
    checkins: [
      {
        id: 'ck-j1',
        em: minutosAtras(26 * 60),
        opcoes: ['dor'],
        texto: 'Back pain since last night.',
        origem: 'voz',
      },
    ],
    mensagens: [
      msg('lia', 'Lia', 'Good morning, Mr. José. How can I help today?', minutosAtras(95)),
      msg(
        'paciente',
        'José Pereira da Silva',
        'Good morning! I feel good today, thank God. I managed to have breakfast and took a light walk in the backyard.',
        minutosAtras(81)
      ),
      msg(
        'profissional',
        'Dr. Camila Ribeiro',
        'Glad to hear it, Mr. José. Keep taking gefitinib at the usual time and drink plenty of water. If you notice any skin rash or fever, let us know through the app.',
        minutosAtras(70)
      ),
    ],
  };

  const renato: Paciente = {
    id: 'pac-002',
    nome: 'Renato Oliveira Santos',
    idade: 57,
    diagnosticoResumido: 'Sigmoid colon adenocarcinoma, resected, pT3N1M0.',
    esquemaResumido: 'FOLFOX every 14 days, 12 cycles planned, with an elastomeric infusion pump.',
    cicloAtual: 'D3 of cycle 4',
    ecog: 'ECOG 0',
    ultimaInteracao: 'Hoje',
    planoAtualizadoEm: '08/24/2026 16:10',
    planoTerapeuticoTexto: PLANOS_IRIS['pac-002'],
    modoConversa: 'lia',
    jornada: [
      { id: 'et-r1', titulo: 'Surgery', descricao: '', estado: 'concluida' },
      { id: 'et-r2', titulo: 'Adjuvant therapy · cycle 4 of 12', descricao: '', estado: 'em_andamento' },
    ],
    agenda: [
      {
        id: 'ag-r1',
        titulo: 'Chemotherapy · cycle 5',
        tipo: 'consulta',
        dataHora: diaRelativo(11, 9),
        local: 'Chemotherapy center',
      },
    ],
    documentos: [],
    lembretes: [],
    checkins: [{ id: 'ck-r1', em: diaRelativo(-2, 18), opcoes: ['bem'], origem: 'visual' }],
    mensagens: [
      msg(
        'paciente',
        'Renato Oliveira Santos',
        'Good morning! The pump ran normally and I am on my way to have it removed. I felt a slight tingling in my fingertips when I grabbed some fruit from the fridge, but it went away.',
        minutosAtras(330)
      ),
      msg(
        'profissional',
        'Nurse Rodrigo Mendes',
        'Good morning, Renato. That tingling with cold is expected with oxaliplatin. Avoid cold drinks and cold surfaces for the next few days. We will see you for the removal.',
        minutosAtras(318)
      ),
      msg(
        'paciente',
        'Renato Oliveira Santos',
        "I won't be able to make it to cycle 5 that day, I have a work commitment.",
        minutosAtras(300)
      ),
      msg(
        'lia',
        'Lia',
        'I logged your rescheduling request for your cycle 5 chemotherapy. The team will review it and you will see the answer here.',
        minutosAtras(299),
        { status: 'registrado' }
      ),
    ],
  };

  const ana: Paciente = {
    id: 'pac-003',
    nome: 'Ana Silva',
    idade: 42,
    diagnosticoResumido: 'Invasive breast carcinoma, cT2N1M0, Luminal B HER2-.',
    esquemaResumido: 'Dose-dense AC every 14 days + Filgrastim SC D2-D7.',
    cicloAtual: 'D5 of cycle 3',
    ecog: 'ECOG 1',
    ultimaInteracao: 'Hoje',
    planoAtualizadoEm: '08/25/2026 09:00',
    planoTerapeuticoTexto: PLANOS_IRIS['pac-003'],
    modoConversa: 'lia',
    jornada: [
      { id: 'et-a1', titulo: 'Diagnosis recorded', descricao: '', estado: 'concluida' },
      { id: 'et-a2', titulo: 'Neoadjuvant therapy · cycle 3', descricao: '', estado: 'em_andamento' },
      { id: 'et-a3', titulo: 'Surgery', descricao: '', estado: 'futura' },
    ],
    agenda: [
      {
        id: 'ag-a1',
        titulo: 'Chemotherapy · cycle 4',
        tipo: 'consulta',
        dataHora: diaRelativo(9, 10),
        local: 'Chemotherapy center',
      },
    ],
    documentos: [],
    lembretes: [],
    checkins: [
      { id: 'ck-a1', em: diaRelativo(-1, 20), opcoes: ['bem'], origem: 'visual' },
    ],
    mensagens: [
      msg(
        'paciente',
        'Ana Silva',
        "Hi! The nausea is much better today. Just some back pain after yesterday's injection, but I took the dipyrone and it helped.",
        minutosAtras(150)
      ),
      msg(
        'profissional',
        'Nurse Rodrigo Mendes',
        'Glad to hear it, Ana. That pain is common with filgrastim and dipyrone is the medication listed in your plan. If you have a fever, go to urgent care.',
        minutosAtras(140)
      ),
    ],
  };

  const pendencias: Pendencia[] = [
    {
      id: 'pend-seed-1',
      pacienteId: 'pac-001',
      tipo: 'checkin',
      origem: 'regra_servico',
      estado: 'aberta',
      titulo: 'Check-in awaiting review',
      falaLiteral: 'Back pain since last night.',
      motivo: CONFIG_SERVICO.regrasRevisao[0].descricao,
      papelDestino: 'enfermagem',
      criadaEm: minutosAtras(26 * 60),
      prazo: somarHoras(minutosAtras(26 * 60), 24),
    },
    {
      id: 'pend-seed-2',
      pacienteId: 'pac-002',
      tipo: 'reagendamento',
      origem: 'solicitacao_paciente',
      estado: 'aberta',
      titulo: 'Rescheduling request · Chemotherapy cycle 5',
      falaLiteral: "I won't be able to make it to cycle 5 that day, I have a work commitment.",
      confirmadaPeloPaciente: true,
      papelDestino: 'navegacao',
      criadaEm: minutosAtras(299),
      prazo: somarHoras(minutosAtras(299), CONFIG_SERVICO.prazoHorasPorTipo.reagendamento),
    },
  ];

  return { pacientes: [maria, jose, renato, ana], pendencias };
}
