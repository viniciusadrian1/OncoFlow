// Detalhe do paciente no OncoFlow Pro, com abas Jornada, Agenda, Exames, Comunicação e Resumo.
// O conteúdo do antigo card do IRIS (diagnóstico, pendências, check-ins, plano) fica em Resumo.

import React, { useState } from 'react';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  FileSearch,
  FileText,
  HeartPulse,
  MessageSquare,
  Pill,
  Stethoscope,
  Smartphone,
  UserCheck,
} from 'lucide-react';
import type { Desfecho, PacientePro, UsuarioEquipe } from '../types';
import { ROTULO_OPCAO_CHECKIN } from '../types';
import type { AcoesPro } from '../api/pro';
import { ChatView } from './ChatView';
import { PendenciaItem, BadgeSituacao } from './Pendencias';
import { PlanoTerapeuticoModal } from './PlanoTerapeuticoModal';
import { UploadPlanoButton } from './UploadPlanoButton';
import { OrbeMini } from './OrbeMini';
import { dataCompromisso, dataHoraCurta, diagnosticoCurto, iniciais } from './proUtil';
import { MobileIntegrationPanel } from './MobileIntegrationPanel';

type Aba = 'jornada' | 'agenda' | 'exames' | 'comunicacao' | 'resumo' | 'aplicativo';

const ABAS: [Aba, string][] = [
  ['jornada', 'Journey'],
  ['agenda', 'Schedule'],
  ['exames', 'Tests'],
  ['comunicacao', 'Messages'],
  ['resumo', 'Summary'],
  ['aplicativo', 'Aplicativo do paciente'],
];

interface DetalhePacienteProps {
  paciente: PacientePro;
  usuarioAtual: UsuarioEquipe;
  acoes: AcoesPro;
  minutosRetornoLia: number;
}

const JornadaHorizontal: React.FC<{ paciente: PacientePro }> = ({ paciente }) => {
  const etapas = paciente.jornada;
  const atual = etapas.findIndex((e) => e.estado === 'em_andamento');
  return (
    <ol className="flex items-start overflow-x-auto pb-2" aria-label="Journey steps">
      {etapas.map((e, i) => {
        const concluida = e.estado === 'concluida';
        const corrente = i === atual;
        return (
          <li key={e.id} className="flex-1 min-w-[96px] flex flex-col items-center text-center relative">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-[15px] right-1/2 w-full h-[3px] ${i <= atual || concluida ? 'bg-teal' : 'bg-linha'}`}
              />
            )}
            <span
              className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                concluida
                  ? 'bg-teal text-white'
                  : corrente
                  ? 'bg-white border-[3px] border-teal'
                  : 'bg-white border-2 border-linha'
              }`}
            >
              {concluida && <Check className="w-4 h-4" strokeWidth={3} aria-hidden />}
              {corrente && <span className="w-3 h-3 rounded-full bg-teal" />}
            </span>
            <span className={`mt-2 px-1 text-sm leading-tight ${corrente ? 'font-semibold text-azul' : 'text-tinta-suave'}`}>
              {e.titulo}
            </span>
            <span className="sr-only">
              {concluida ? 'done' : corrente ? 'in progress' : e.estado === 'aguardando' ? 'pending' : 'upcoming'}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export const DetalhePaciente: React.FC<DetalhePacienteProps> = ({ paciente, usuarioAtual, acoes, minutosRetornoLia }) => {
  const [aba, setAba] = useState<Aba>('jornada');
  const [planoAberto, setPlanoAberto] = useState(false);

  const agora = Date.now();
  const proximos = [...paciente.agenda]
    .filter((c) => new Date(c.dataHora).getTime() > agora)
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora));
  const proximo = proximos[0];
  const abertas = paciente.pendencias.filter((p) => p.estado !== 'concluida');
  const concluidas = paciente.pendencias.filter((p) => p.estado === 'concluida');
  const checkins = [...paciente.checkins].sort((a, b) => b.em.localeCompare(a.em));
  const etapaSeguinte = paciente.jornada.find((e) => e.estado === 'proxima' || e.estado === 'aguardando');

  const concluir = (id: string, desfecho: Desfecho) => acoes.concluirPendencia(id, desfecho);

  return (
    <section className="rounded-2xl bg-white border border-linha/70 shadow-[0_2px_12px_-6px_rgba(18,59,86,0.15)] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <span className="w-16 h-16 rounded-full bg-gelo text-verde text-xl font-semibold flex items-center justify-center shrink-0">
            {iniciais(paciente.nome)}
          </span>
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold text-azul truncate">{paciente.nome}</h2>
            <p className="text-tinta-suave">
              {paciente.idade} y/o · {diagnosticoCurto(paciente.diagnosticoResumido)}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <BadgeSituacao situacao={paciente.situacao} />
              <span className="inline-flex items-center gap-1.5 text-xs text-tinta-suave">
                {paciente.modoConversa === 'profissional' ? (
                  <>
                    <UserCheck className="w-3.5 h-3.5 text-verde" aria-hidden />
                    Handled by {paciente.profissionalResponsavel}
                  </>
                ) : (
                  <>
                    <OrbeMini className="w-3.5 h-3.5" />
                    Lia is handling
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAba('aplicativo')} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gelo text-sm font-semibold text-verde hover:bg-gelo-forte cursor-pointer">
          <Smartphone className="w-4 h-4" aria-hidden />Aplicativo do paciente
        </button>
        <button
          type="button"
          onClick={() => setPlanoAberto(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-linha text-sm font-medium text-azul hover:bg-gelo cursor-pointer"
        >
          See treatment plan
          <FileSearch className="w-4 h-4" aria-hidden />
        </button>
        </div>
      </div>

      <div role="tablist" aria-label="Patient information" className="mt-6 flex overflow-x-auto overflow-y-hidden border-b border-linha">
        {ABAS.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`shrink-0 px-5 py-3 -mb-px border-b-[3px] text-[15px] cursor-pointer ${
              aba === id ? 'border-teal text-azul font-semibold' : 'border-transparent text-tinta-suave hover:text-azul'
            }`}
          >
            {rotulo}
            {id === 'resumo' && abertas.length > 0 && (
              <span className="ml-1.5 px-1.5 rounded-full bg-atencao text-white text-[11px] font-bold">{abertas.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="pt-6" role="tabpanel">
        {aba === 'aplicativo' && <MobileIntegrationPanel key={`${paciente.id}:${usuarioAtual.id}`} paciente={paciente} usuario={usuarioAtual} />}
        {aba === 'jornada' && (
          <div className="space-y-6">
            <JornadaHorizontal paciente={paciente} />
            {proximo ? (
              <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-gelo/70 px-6 py-5">
                <CalendarDays className="w-9 h-9 text-teal shrink-0" strokeWidth={1.6} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-tinta-suave">Next appointment</p>
                  <p className="text-lg font-semibold text-azul">{proximo.titulo}</p>
                  <p className="text-tinta-suave">
                    {dataCompromisso(proximo.dataHora)} · {proximo.local}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAba('agenda')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-verde bg-white text-sm font-semibold text-verde hover:bg-gelo cursor-pointer"
                >
                  See details
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </button>
              </div>
            ) : (
              <p className="text-tinta-suave">No upcoming appointments on the schedule.</p>
            )}
            {etapaSeguinte && (
              <p className="text-sm text-azul">
                Next journey step: <strong>{etapaSeguinte.titulo}</strong>
                {etapaSeguinte.responsavel ? ` · ${etapaSeguinte.responsavel}` : ''}
              </p>
            )}
            {abertas.length > 0 && (
              <button
                type="button"
                onClick={() => setAba('resumo')}
                className="w-full flex items-center gap-2 rounded-xl border border-atencao-borda bg-atencao-fundo px-4 py-3 text-sm font-semibold text-atencao cursor-pointer"
              >
                <ClipboardList className="w-4 h-4" aria-hidden />
                {abertas.length} {abertas.length === 1 ? 'open pending item' : 'open pending items'} · see Summary
              </button>
            )}
          </div>
        )}

        {aba === 'agenda' && (
          <div className="space-y-3">
            {proximos.length === 0 && <p className="text-tinta-suave">No upcoming appointments.</p>}
            {proximos.map((c) => (
              <div key={c.id} className="rounded-xl border border-linha p-4 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-verde">{c.tipo === 'exame' ? 'Test' : 'Appointment'}</p>
                <p className="font-semibold text-azul">{c.titulo}</p>
                <p className="text-sm text-tinta-suave">
                  {dataCompromisso(c.dataHora)} · {c.local}
                  {c.profissional ? ` · ${c.profissional}` : ''}
                </p>
                {c.preparo && <p className="text-sm text-azul">Prep (institutional instructions): {c.preparo}</p>}
              </div>
            ))}
            {paciente.lembretes.length > 0 && (
              <div className="rounded-xl bg-gelo/60 p-4 text-sm text-azul">
                <p className="font-semibold mb-1">Reminders created by the patient</p>
                {paciente.lembretes.map((l) => (
                  <p key={l.id}>
                    {dataCompromisso(l.dataHora)}: {l.texto}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {aba === 'exames' && (
          <div className="space-y-3">
            {paciente.documentos.length === 0 && proximos.every((c) => c.tipo !== 'exame') && (
              <p className="text-tinta-suave">No tests or documents recorded.</p>
            )}
            {proximos
              .filter((c) => c.tipo === 'exame')
              .map((c) => (
                <div key={c.id} className="rounded-xl border border-linha p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-atencao">Scheduled</p>
                  <p className="font-semibold text-azul">{c.titulo}</p>
                  <p className="text-sm text-tinta-suave">{dataCompromisso(c.dataHora)} · {c.local}</p>
                </div>
              ))}
            {paciente.documentos.map((d) => (
              <div key={d.id} className="rounded-xl border border-linha p-4 space-y-1">
                <p className="flex items-center gap-2 font-semibold text-azul">
                  <FileText className="w-4 h-4 text-verde" aria-hidden />
                  {d.titulo}
                </p>
                <p className="text-sm text-tinta-suave">
                  {d.tipo === 'resultado' ? 'Result' : 'Guidance'} · released to the patient on {dataHoraCurta(d.data)} by {d.liberadoPor}
                </p>
                <p className="text-sm text-azul">{d.texto}</p>
              </div>
            ))}
          </div>
        )}

        {aba === 'comunicacao' && (
          <ChatView paciente={paciente} usuarioAtual={usuarioAtual} acoes={acoes} minutosRetornoLia={minutosRetornoLia} />
        )}

        {aba === 'resumo' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="flex gap-2.5">
                <Stethoscope className="w-5 h-5 text-verde shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold text-azul">Diagnosis</p>
                  <p className="text-azul">{paciente.diagnosticoResumido}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Pill className="w-5 h-5 text-verde shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold text-azul">Regimen</p>
                  <p className="text-azul">{paciente.esquemaResumido}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <CalendarDays className="w-5 h-5 text-verde shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold text-azul">Current cycle</p>
                  <p className="text-azul">{paciente.cicloAtual}</p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <Activity className="w-5 h-5 text-verde shrink-0" aria-hidden />
                <div>
                  <p className="font-semibold text-azul">Performance status</p>
                  <p className="text-azul">{paciente.ecog}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 font-semibold text-azul">
                <ClipboardList className="w-4 h-4 text-verde" aria-hidden />
                Pending items ({abertas.length} open)
              </h3>
              {abertas.length === 0 && <p className="text-sm text-tinta-suave">No open pending items.</p>}
              {abertas.map((p) => (
                <PendenciaItem key={p.id} pendencia={p} onAssumir={acoes.assumirPendencia} onConcluir={concluir} />
              ))}
              {concluidas.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-tinta-suave hover:text-azul">{concluidas.length} reviewed</summary>
                  <div className="space-y-2 mt-2">
                    {concluidas.map((p) => (
                      <PendenciaItem key={p.id} pendencia={p} onAssumir={acoes.assumirPendencia} onConcluir={concluir} />
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-2 font-semibold text-azul">
                <HeartPulse className="w-4 h-4 text-verde" aria-hidden />
                Check-ins
              </h3>
              {checkins.length === 0 && <p className="text-sm text-tinta-suave">No check-ins logged.</p>}
              <ul className="space-y-1.5 text-sm">
                {checkins.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex flex-wrap gap-x-2">
                    <span className="text-tinta-suave tabular-nums">{dataHoraCurta(c.em)}</span>
                    <span className="font-semibold text-azul">{c.opcoes.map((o) => ROTULO_OPCAO_CHECKIN[o]).join(', ') || 'Report'}</span>
                    {c.origem === 'voz' && <span className="text-tinta-suave">· by voice</span>}
                    {c.texto && <span className="text-azul">“{c.texto}”</span>}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gelo/60 p-4 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-verde" aria-hidden />
                <div>
                  <p className="font-semibold text-azul">Treatment plan (team document)</p>
                  <p className="text-xs text-tinta-suave">
                    {paciente.planoAtualizadoEm ? `Updated on ${paciente.planoAtualizadoEm}` : 'Not attached yet'} · not used by Lia
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPlanoAberto(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-linha bg-white text-xs font-semibold text-azul cursor-pointer"
                >
                  <FileSearch className="w-3.5 h-3.5 text-verde" aria-hidden />
                  See plan
                </button>
                <UploadPlanoButton pacienteId={paciente.id} pacienteNome={paciente.nome} onPlanoAtualizado={acoes.atualizarPlano} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAba('comunicacao')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-verde text-white text-sm font-semibold hover:bg-verde-escuro cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" aria-hidden />
              Open conversation
            </button>
          </div>
        )}
      </div>

      {planoAberto && <PlanoTerapeuticoModal paciente={paciente} onFechar={() => setPlanoAberto(false)} />}
    </section>
  );
};
