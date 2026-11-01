// Indicadores do topo do Início. Todos calculados dos dados da demo (nada fixo na tela).

import React from 'react';
import { AlertTriangle, CalendarDays, ClipboardList, Users } from 'lucide-react';
import type { PacientePro } from '../types';

interface IndicadoresProps {
  pacientes: PacientePro[];
  onAbrir: (destino: 'pacientes' | 'pendencias' | 'sinais') => void;
}

export const Indicadores: React.FC<IndicadoresProps> = ({ pacientes, onAbrir }) => {
  const agora = Date.now();
  const em7dias = agora + 7 * 86_400_000;
  const compromissosSemana = pacientes.reduce(
    (n, p) => n + p.agenda.filter((c) => {
      const t = new Date(c.dataHora).getTime();
      return t > agora && t <= em7dias;
    }).length,
    0
  );
  const abertas = pacientes.flatMap((p) => p.pendencias.filter((pe) => pe.estado !== 'concluida'));
  const sinais = abertas.filter((pe) => pe.tipo === 'sinal_urgencia').length;

  const cartoes = [
    { valor: pacientes.length, rotulo: 'Active patients', Icone: Users, cor: 'text-teal', destino: 'pacientes' as const },
    { valor: compromissosSemana, rotulo: 'Appointments in 7 days', Icone: CalendarDays, cor: 'text-teal', destino: 'pacientes' as const },
    { valor: abertas.length - sinais, rotulo: 'Awaiting review', Icone: ClipboardList, cor: 'text-teal', destino: 'pendencias' as const },
    { valor: sinais, rotulo: 'Sinais a revisar', Icone: AlertTriangle, cor: sinais > 0 ? 'text-urgente' : 'text-teal', destino: 'sinais' as const },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {cartoes.map(({ valor, rotulo, Icone, cor, destino }) => (
        <button
          key={rotulo}
          type="button"
          data-testid={`indicator-${destino}`}
          aria-label={destino === 'sinais' ? `${valor} sinais aguardando revisão` : undefined}
          onClick={() => onAbrir(destino)}
          className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-2xl border shadow-[0_2px_12px_-6px_rgba(18,59,86,0.15)] px-4 sm:px-6 py-5 text-left cursor-pointer hover:border-verde/50 ${destino === 'sinais' && valor > 0 ? 'bg-urgente-fundo border-urgente-borda' : 'bg-white border-linha/70'}`}
        >
          <Icone className={`w-9 h-9 shrink-0 ${cor}`} strokeWidth={1.6} aria-hidden />
          <span className="min-w-0 break-words" role={destino === 'sinais' ? 'status' : undefined} aria-live={destino === 'sinais' ? 'polite' : undefined} aria-atomic={destino === 'sinais' ? true : undefined}>
            <span data-testid={destino === 'sinais' ? 'signal-count' : undefined} className={`block text-3xl font-bold tabular-nums leading-none ${destino === 'sinais' && valor > 0 ? 'text-urgente' : 'text-azul'}`}>{valor}</span>
            <span className="block mt-1.5 text-tinta-suave">{rotulo}</span>
          </span>
        </button>
      ))}
    </div>
  );
};
