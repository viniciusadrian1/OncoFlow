// Pendências da equipe: tudo o que espera revisão aparece com origem, status, responsável e prazo
// (princípio 3). Hipótese do sistema nunca aparece como fato, e o estado nunca depende só de cor.

import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  ClipboardList,
  UserCheck,
  Quote,
} from 'lucide-react';
import type {
  Desfecho,
  OrigemPendencia,
  PapelEquipe,
  Pendencia,
  SituacaoPaciente,
  TipoPendencia,
} from '../types';
import { ROTULO_DESFECHO } from '../types';

export const ROTULO_TIPO: Record<TipoPendencia, string> = {
  sinal_urgencia: 'Possible urgency sign',
  checkin: 'Check-in',
  contato_equipe: 'Contact request',
  reagendamento: 'Rescheduling',
  duvida: 'Patient question',
};

export const ROTULO_PAPEL: Record<PapelEquipe, string> = {
  medico: 'Physician',
  enfermagem: 'Nursing',
  navegacao: 'Navigation',
};

const ROTULO_ORIGEM: Record<OrigemPendencia, string> = {
  hipotese_sistema: 'System hypothesis · awaiting review',
  solicitacao_paciente: 'Request confirmed by the patient',
  regra_servico: 'Service rule',
};

export function infoSituacao(situacao: SituacaoPaciente) {
  switch (situacao) {
    case 'sinal_a_revisar':
      return {
        rotulo: 'Sinal a revisar',
        Icone: AlertTriangle,
        classes: 'bg-urgente-fundo border-urgente-borda text-urgente',
        ponto: 'bg-urgente',
      };
    case 'aguardando_revisao':
      return {
        rotulo: 'Awaiting review',
        Icone: Clock,
        classes: 'bg-atencao-fundo border-atencao-borda text-atencao',
        ponto: 'bg-atencao',
      };
    default:
      return {
        rotulo: 'No pending items',
        Icone: CheckCircle2,
        classes: 'bg-gelo border-linha text-azul',
        ponto: 'bg-verde',
      };
  }
}

export const BadgeSituacao: React.FC<{ situacao: SituacaoPaciente }> = ({ situacao }) => {
  const info = infoSituacao(situacao);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${info.classes}`}>
      <info.Icone className="w-3.5 h-3.5" aria-hidden />
      <span>{info.rotulo}</span>
    </span>
  );
};

export function descreverPrazo(prazoISO: string, agora = Date.now(), locale: 'pt-BR' | 'en-US' = 'en-US'): { texto: string; atrasada: boolean } {
  const diferenca = new Date(prazoISO).getTime() - agora;
  const horas = Math.round(Math.abs(diferenca) / 3_600_000);
  const quanto = horas >= 1 ? `${horas} h` : `${Math.max(1, Math.round(Math.abs(diferenca) / 60_000))} min`;
  return diferenca >= 0 ? { texto: `${locale === 'pt-BR' ? 'em' : 'due in'} ${quanto}`, atrasada: false } : { texto: `${locale === 'pt-BR' ? 'vencido há' : 'overdue by'} ${quanto}`, atrasada: true };
}

function quando(iso: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface PendenciaItemProps {
  pendencia: Pendencia;
  nomePaciente?: string;
  onAssumir: (id: string) => void | Promise<void>;
  onConcluir: (id: string, desfecho: Desfecho) => void | Promise<void>;
}

export const PendenciaItem: React.FC<PendenciaItemProps> = ({ pendencia, nomePaciente, onAssumir, onConcluir }) => {
  const [desfecho, setDesfecho] = useState<Desfecho | ''>('');
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState('');
  const bloqueio = useRef(false);
  const concluida = pendencia.estado === 'concluida';
  const ehSinal = pendencia.tipo === 'sinal_urgencia';
  const prazo = descreverPrazo(pendencia.prazo, Date.now(), ehSinal ? 'pt-BR' : 'en-US');
  const ehHipotese = pendencia.origem === 'hipotese_sistema';
  const seloSinal = concluida ? 'Hipótese do sistema · revisada pela equipe' : pendencia.estado === 'em_andamento' ? 'Hipótese do sistema · em revisão' : 'Hipótese do sistema · aguardando revisão';
  const papelPt = { medico: 'Medicina', enfermagem: 'Enfermagem', navegacao: 'Navegação' };
  const desfechoPt: Record<Desfecho, string> = { sem_acao_necessaria: 'Sem ação necessária', contato_realizado: 'Contato realizado', encaminhado: 'Encaminhado' };
  const estadoPt = { aberta: 'Aberta', em_andamento: 'Em revisão', concluida: 'Revisão concluída' };
  const Icone = pendencia.tipo === 'sinal_urgencia' ? AlertTriangle : pendencia.tipo === 'duvida' ? HelpCircle : ClipboardList;
  const executar = async (trabalho: () => void | Promise<void>) => {
    if (bloqueio.current) return;
    bloqueio.current = true; setExecutando(true); setErro('');
    try { await trabalho(); }
    catch (error) { setErro((error as Error).message || (ehSinal ? 'Não foi possível salvar a revisão. Tente novamente.' : 'The review could not be saved. Please try again.')); }
    finally { bloqueio.current = false; setExecutando(false); }
  };

  return (
    <article
      data-pendencia-id={pendencia.id}
      data-paciente-id={pendencia.pacienteId}
      lang={ehSinal ? 'pt-BR' : undefined}
      className={`review-item border p-3.5 text-xs space-y-2.5 ${
        concluida ? 'bg-fundo border-linha opacity-80' : ehSinal ? 'bg-urgente-fundo/40 border-dashed border-urgente-borda' : ehHipotese ? 'bg-white border-dashed border-urgente-borda' : 'bg-white border-linha'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${pendencia.tipo === 'sinal_urgencia' ? 'text-urgente' : 'text-verde'}`} aria-hidden />
          <div className="min-w-0">
            <div className="font-semibold text-azul text-sm">
              {ehSinal ? 'Sinal a revisar' : ROTULO_TIPO[pendencia.tipo]}
              {nomePaciente && <span className="font-normal text-tinta-suave"> · {nomePaciente}</span>}
            </div>
            <div className="text-tinta-suave">{pendencia.titulo}</div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold ${
            ehHipotese ? 'border-dashed border-urgente-borda text-urgente bg-urgente-fundo' : 'border-linha text-azul bg-gelo'
          }`}
        >
          {ehHipotese && <HelpCircle className="w-3 h-3" aria-hidden />}
          {ehSinal && ehHipotese ? seloSinal : ROTULO_ORIGEM[pendencia.origem]}
        </span>
      </div>

      {pendencia.falaLiteral && (
        <blockquote className="flex gap-2 border-l-4 border-turquesa pl-2.5 py-1 text-azul">
          <Quote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-tinta-suave" aria-hidden />
          <span>
            <span className="block text-[10px] uppercase tracking-wider font-semibold text-tinta-suave">{ehSinal ? 'Fala literal do paciente' : "Patient's words"}</span>
            {pendencia.falaLiteral}
          </span>
        </blockquote>
      )}

      {pendencia.motivo && <p className="text-tinta-suave">{pendencia.motivo}</p>}
      {pendencia.tipo === 'sinal_urgencia' && (
        <p className="text-tinta-suave">
          {pendencia.confirmadaPeloPaciente ? 'Relato encaminhado com confirmação do paciente.' : 'Encaminhado automaticamente pelas regras do serviço para revisão da equipe.'} A prioridade clínica depende de avaliação profissional.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-tinta-suave">
        <span>{ehSinal ? 'Encaminhado para: ' : 'Routed to: '}<strong className="text-azul">{ehSinal ? papelPt[pendencia.papelDestino] : ROTULO_PAPEL[pendencia.papelDestino]}</strong></span>
        <span>{ehSinal ? 'Registrado em ' : 'Created '}{quando(pendencia.criadaEm, ehSinal ? 'pt-BR' : 'en-US')}</span>
        {ehSinal && <span>Estado: <strong className="text-azul">{estadoPt[pendencia.estado]}</strong></span>}
        {!concluida && (
          <span className={`inline-flex items-center gap-1 font-semibold ${prazo.atrasada ? 'text-urgente' : 'text-azul'}`}>
            <Clock className="w-3 h-3" aria-hidden />
            {ehSinal ? 'Prazo do serviço: ' : 'Service deadline: '}{prazo.texto}
          </span>
        )}
        <span>
          {ehSinal ? 'Responsável: ' : 'Owner: '}<strong className="text-azul">{pendencia.responsavel ?? (ehSinal ? 'A definir' : 'unassigned')}</strong>
        </span>
      </div>

      {concluida ? (
        <div className="flex items-center gap-1.5 text-azul font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5 text-verde" aria-hidden />
          {ehSinal ? 'Revisado por ' : 'Reviewed by '}{pendencia.concluidaPor} · {quando(pendencia.concluidaEm!, ehSinal ? 'pt-BR' : 'en-US')} ·{' '}
          {pendencia.desfecho ? (ehSinal ? desfechoPt[pendencia.desfecho] : ROTULO_DESFECHO[pendencia.desfecho]) : ''}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {pendencia.estado === 'aberta' && (
            <button
              type="button"
              disabled={executando}
              onClick={() => void executar(() => onAssumir(pendencia.id))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-verde hover:bg-verde-escuro text-white font-semibold cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5" aria-hidden />
              {ehSinal ? 'Assumir revisão' : 'Take on'}
            </button>
          )}
          <label className="sr-only" htmlFor={`desfecho-${pendencia.id}`}>
            {ehSinal ? 'Desfecho da revisão' : 'Review outcome'}
          </label>
          <select
            id={`desfecho-${pendencia.id}`}
            value={desfecho}
            disabled={executando}
            onChange={(e) => setDesfecho(e.target.value as Desfecho)}
            className="px-2 py-1.5 rounded-lg border border-linha bg-white text-azul"
          >
            <option value="">{ehSinal ? 'Escolha o desfecho…' : 'Review outcome…'}</option>
            {(Object.keys(ROTULO_DESFECHO) as Desfecho[]).map((d) => (
              <option key={d} value={d}>
                {ehSinal ? desfechoPt[d] : ROTULO_DESFECHO[d]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!desfecho || executando}
            onClick={() => desfecho && void executar(() => onConcluir(pendencia.id, desfecho))}
            className="px-3 py-1.5 rounded-lg border border-verde text-verde font-semibold hover:bg-gelo disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {ehSinal ? 'Concluir revisão' : 'Complete review'}
          </button>
        </div>
      )}
      {erro && <p role="alert" className="text-urgente">{erro}</p>}
    </article>
  );
};
