// Configuração do serviço (instituição fictícia). Tudo aqui é DADO definido pelo hospital, não
// regra clínica do código (CLAUDE.md, regra 6). Os valores marcados `exemplo` são ilustrativos e
// precisam ser definidos com o serviço antes de qualquer uso real.

import { DEMO_ATTENTION_TERMS } from '../patient-app/shared/symptomTerms';

import type { AvisoUrgencia, OpcaoCheckin, PapelEquipe, TipoPendencia } from '../src/types';

export interface RegraRevisaoCheckin {
  id: string;
  descricao: string;
  exemplo: boolean;
  // Dispara quando o check-in tem alguma destas opções...
  seAlgumaOpcao: OpcaoCheckin[];
  // ...em N check-ins seguidos (1 = só o atual).
  emSeguida: number;
  papelDestino: PapelEquipe;
  prazoHoras: number;
}

export interface ConfigServico {
  instituicao: string;
  assistenteNome: string;
  // Termos que mostram o aviso de urgência ao paciente e abrem uma hipótese para a equipe revisar.
  // Comparação por palavra inteira, sem acento, ignorando negações simples ("sem febre").
  termosUrgencia: string[];
  termosUrgenciaExemplo: boolean;
  relatoAutomaticoDemo: {
    exemplo: true;
    fontes: string[];
    orientacao: Record<'pt-BR' | 'en-US', string>;
    orientacaoFebre: Record<'pt-BR' | 'en-US', string>;
  };
  avisoUrgencia: AvisoUrgencia;
  quemVe: string;
  prazoHorasPorTipo: Record<TipoPendencia, number>;
  papelPorTipo: Record<TipoPendencia, PapelEquipe>;
  regrasRevisao: RegraRevisaoCheckin[];
  minutosRetornoLia: number;
  minutosValidadeConfirmacao: number;
  horaPadraoLembrete: number;
}

export const CONFIG_SERVICO: ConfigServico = {
  instituicao: 'Fictional Oncology Center',
  assistenteNome: 'Lia',
  termosUrgencia: [...DEMO_ATTENTION_TERMS],
  termosUrgenciaExemplo: true,
  // Texto de demonstração, não protocolo aprovado de um serviço real. Sem limiar clínico
  // no código. A lista só produz hipótese para revisão humana, nunca diagnóstico/prioridade.
  // Fontes verificadas em 01/11/2026: febre no tratamento oncológico requer avaliação rápida.
  relatoAutomaticoDemo: {
    exemplo: true,
    fontes: ['https://www.cdc.gov/cancer-preventing-infections/patients/fever.html', 'https://www.cancer.gov/about-cancer/treatment/side-effects/infection'],
    orientacao: {
      'pt-BR': 'Seu relato foi registrado e há uma pendência para revisão da equipe. Sintomas como esses durante o acompanhamento oncológico precisam de avaliação profissional. Procure avaliação agora pelo seu serviço de oncologia. Se não conseguir contato, procure pronto atendimento. Não espere uma resposta pelo aplicativo.',
      'en-US': 'Your report was recorded and a team review is pending. Symptoms like these during cancer care need professional assessment. Seek assessment now from your oncology service. If you cannot reach them, seek urgent care. Do not wait for an app reply.',
    },
    orientacaoFebre: {
      'pt-BR': 'Seu relato foi registrado e há uma pendência para revisão da equipe. Febre durante o tratamento oncológico pode ser sinal de infecção e precisa de avaliação imediata. Procure avaliação agora pelo seu serviço de oncologia. Se não conseguir contato, procure pronto atendimento. Não espere uma resposta pelo aplicativo.',
      'en-US': 'Your report was recorded and a team review is pending. Fever during cancer treatment can be a sign of infection and needs prompt assessment. Seek assessment now from your oncology service. If you cannot reach them, seek urgent care. Do not wait for an app reply.',
    },
  },
  avisoUrgencia: {
    titulo: 'This channel is not for emergencies',
    texto:
      'If you have severe symptoms or symptoms that get worse quickly, go to the hospital oncology urgent care unit or call emergency services.',
    contato: 'Oncology urgent care · (000) 000-0000 (fictional number) · Emergency: 911',
  },
  quemVe:
    'Your care team (doctor, nursing and navigation) can see this conversation and your check-ins to organize your follow-up. The team replies within the service hours and response times.',
  prazoHorasPorTipo: {
    sinal_urgencia: 4,
    checkin: 24,
    contato_equipe: 24,
    reagendamento: 48,
    duvida: 48,
  },
  papelPorTipo: {
    sinal_urgencia: 'enfermagem',
    checkin: 'enfermagem',
    contato_equipe: 'enfermagem',
    reagendamento: 'navegacao',
    duvida: 'enfermagem',
  },
  regrasRevisao: [
    {
      id: 'regra-dor-nausea',
      descricao: 'Check-in with pain or nausea → nursing reviews within 24 h',
      exemplo: true,
      seAlgumaOpcao: ['dor', 'nausea'],
      emSeguida: 1,
      papelDestino: 'enfermagem',
      prazoHoras: 24,
    },
    {
      id: 'regra-cansaco-ansiedade',
      descricao: 'Tiredness or anxiety in 2 check-ins in a row → navigation reviews within 48 h',
      exemplo: true,
      seAlgumaOpcao: ['cansaco', 'ansiedade'],
      emSeguida: 2,
      papelDestino: 'navegacao',
      prazoHoras: 48,
    },
  ],
  minutosRetornoLia: 20,
  minutosValidadeConfirmacao: 2,
  horaPadraoLembrete: 9,
};
