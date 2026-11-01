// Todas as pendências abertas da unidade, ordenadas pelo prazo definido pelo serviço.

import React from 'react';
import type { EstadoPro } from '../types';
import type { AcoesPro } from '../api/pro';
import { PendenciaItem } from './Pendencias';

interface PaginaPendenciasProps {
  estado: EstadoPro;
  acoes: AcoesPro;
  somenteSinais: boolean;
  onAlternarFiltro: (somenteSinais: boolean) => void;
}

export const PaginaPendencias: React.FC<PaginaPendenciasProps> = ({ estado, acoes, somenteSinais, onAlternarFiltro }) => {
  const itens = estado.pacientes
    .flatMap((p) => p.pendencias.filter((pe) => pe.estado !== 'concluida').map((pendencia) => ({ pendencia, paciente: p })))
    .filter(({ pendencia }) => !somenteSinais || pendencia.tipo === 'sinal_urgencia')
    .sort((a, b) => a.pendencia.prazo.localeCompare(b.pendencia.prazo));

  return (
    <section className="rounded-2xl bg-white border border-linha/70 shadow-[0_2px_12px_-6px_rgba(18,59,86,0.15)] p-5 sm:p-7 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-azul">{somenteSinais ? 'Sinais aguardando revisão' : 'Open pending items'}</h2>
        <div role="group" aria-label="Filter" className="flex gap-1 rounded-full bg-gelo p-1 text-sm">
          {[
            [false, 'All'],
            [true, 'Sinais a revisar'],
          ].map(([valor, rotulo]) => (
            <button
              key={String(valor)}
              type="button"
              aria-pressed={somenteSinais === valor}
              onClick={() => onAlternarFiltro(valor as boolean)}
              className={`px-3 py-1.5 rounded-full cursor-pointer ${somenteSinais === valor ? 'bg-white text-azul font-semibold shadow-sm' : 'text-tinta-suave'}`}
            >
              {rotulo as string}
            </button>
          ))}
        </div>
      </div>
      {somenteSinais && <p className="text-sm text-azul">Sinais encaminhados pelas regras do serviço aguardam revisão da equipe. A prioridade clínica depende de avaliação profissional.</p>}
      <p className="text-sm text-tinta-suave">
        Review rules in use (examples, to be defined with the service): {estado.regrasRevisao.map((r) => r.descricao).join(' · ')}.
      </p>
      {itens.length === 0 ? (
        <p className="py-8 text-center text-tinta-suave">{somenteSinais ? 'Nenhum sinal aguardando revisão.' : 'No open pending items.'}</p>
      ) : (
        <div className="space-y-3">
          {itens.map(({ pendencia, paciente }) => (
            <PendenciaItem
              key={pendencia.id}
              pendencia={pendencia}
              nomePaciente={paciente.nome}
              onAssumir={acoes.assumirPendencia}
              onConcluir={acoes.concluirPendencia}
            />
          ))}
        </div>
      )}
    </section>
  );
};
