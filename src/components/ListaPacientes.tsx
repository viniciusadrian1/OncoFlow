// Lista "Pacientes em acompanhamento". A situação aparece com ícone e texto, nunca só por cor.

import React from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import type { PacientePro } from '../types';
import { infoSituacao } from './Pendencias';
import { diagnosticoCurto, iniciais } from './proUtil';

interface ListaPacientesProps {
  pacientes: PacientePro[];
  selecionadoId?: string;
  onSelecionar: (id: string) => void;
  onVerTodos?: () => void;
  titulo?: string;
}

export const ListaPacientes: React.FC<ListaPacientesProps> = ({
  pacientes,
  selecionadoId,
  onSelecionar,
  onVerTodos,
  titulo = 'Patients under follow-up',
}) => (
  <section className="rounded-2xl bg-white border border-linha/70 shadow-[0_2px_12px_-6px_rgba(18,59,86,0.15)] p-5 sm:p-6">
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-azul">{titulo}</h2>
      {onVerTodos && (
        <button type="button" onClick={onVerTodos} className="flex items-center gap-1 text-sm font-medium text-verde hover:text-verde-escuro cursor-pointer">
          See all
          <ArrowRight className="w-4 h-4" aria-hidden />
        </button>
      )}
    </div>

    {pacientes.length === 0 ? (
      <p className="py-8 text-center text-sm text-tinta-suave">No patients match this search.</p>
    ) : (
      <ul className="divide-y divide-linha/70">
        {pacientes.map((p) => {
          const selecionado = p.id === selecionadoId;
          const info = infoSituacao(p.situacao);
          return (
            <li key={p.id} className="py-1">
              <button
                type="button"
                data-paciente-id={p.id}
                onClick={() => onSelecionar(p.id)}
                aria-current={selecionado}
                className={`w-full flex items-center gap-4 px-3 py-3 rounded-xl text-left cursor-pointer transition-colors ${
                  selecionado ? 'bg-gelo' : 'hover:bg-gelo/50'
                }`}
              >
                <span className="w-12 h-12 rounded-full bg-gelo text-verde font-semibold flex items-center justify-center shrink-0 border border-white">
                  {iniciais(p.nome)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-azul truncate">{p.nome}</span>
                  <span className="block text-sm text-tinta-suave truncate">
                    {p.idade} y/o · {diagnosticoCurto(p.diagnosticoResumido)}
                  </span>
                  {p.situacao !== 'sem_pendencias' && (
                    <span className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${info.classes}`}>
                      <info.Icone className="w-3 h-3" aria-hidden />
                      {info.rotulo}
                    </span>
                  )}
                </span>
                <ChevronRight className="w-5 h-5 text-azul shrink-0" aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
