// Navegação lateral do OncoFlow Pro. Só aparecem seções que já funcionam na demo.

import React from 'react';
import { Home, Users, ClipboardList, MessageSquareText, Building2 } from 'lucide-react';
import { LogoOncoFlow } from './LogoOncoFlow';

export type PaginaPro = 'inicio' | 'pacientes' | 'pendencias' | 'comunicacao';

const ITENS: { pagina: PaginaPro; rotulo: string; Icone: React.ElementType }[] = [
  { pagina: 'inicio', rotulo: 'Home', Icone: Home },
  { pagina: 'pacientes', rotulo: 'Patients', Icone: Users },
  { pagina: 'pendencias', rotulo: 'Pending items', Icone: ClipboardList },
  { pagina: 'comunicacao', rotulo: 'Messages', Icone: MessageSquareText },
];

interface SidebarProps {
  pagina: PaginaPro;
  onNavegar: (p: PaginaPro) => void;
  totalPendencias: number;
  comunicacaoAtiva: boolean;
  instituicao: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ pagina, onNavegar, totalPendencias, comunicacaoAtiva, instituicao }) => (
  <aside
    className="hidden md:flex md:w-56 lg:w-64 shrink-0 flex-col justify-between bg-white border-r border-linha px-4 py-7 sticky top-0 h-screen overflow-hidden"
    style={{ backgroundImage: 'radial-gradient(120% 40% at 0% 100%, var(--color-gelo) 0%, transparent 70%)' }}
  >
    <div className="space-y-9">
      <div className="flex items-center gap-2.5 px-2">
        <LogoOncoFlow className="w-40 h-auto" />
        <span className="pro-brand-badge">Pro</span>
      </div>
      <nav aria-label="Sections" className="space-y-1">
        {ITENS.map(({ pagina: p, rotulo, Icone }) => {
          const ativa = pagina === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onNavegar(p)}
              aria-current={ativa ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                ativa ? 'bg-gelo-forte text-azul font-semibold' : 'text-azul/80 hover:bg-gelo/60 hover:text-azul'
              }`}
            >
              <Icone className="w-5 h-5" aria-hidden />
              <span className="flex-1 text-left">{rotulo}</span>
              {p === 'pendencias' && totalPendencias > 0 && (
                <span className="px-1.5 rounded-full bg-atencao text-white text-[11px] font-bold tabular-nums">{totalPendencias}</span>
              )}
              {p === 'comunicacao' && comunicacaoAtiva && (
                <span className="w-2 h-2 rounded-full bg-verde" title="Contact request waiting" />
              )}
            </button>
          );
        })}
      </nav>
    </div>

    <div className="space-y-2">
      <div className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-white border border-linha text-sm text-azul">
        <Building2 className="w-5 h-5 text-verde shrink-0" aria-hidden />
        <span className="leading-tight">{instituicao}</span>
      </div>
      <p className="px-3 text-[11px] text-tinta-suave">Fictional data · demo</p>
    </div>
  </aside>
);

export const NavegacaoCompacta: React.FC<{ pagina: PaginaPro; onNavegar: (p: PaginaPro) => void }> = ({ pagina, onNavegar }) => (
  <nav aria-label="Sections" className="md:hidden flex gap-1 overflow-x-auto bg-white border-b border-linha px-4 py-2">
    {ITENS.map(({ pagina: p, rotulo, Icone }) => (
      <button
        key={p}
        type="button"
        onClick={() => onNavegar(p)}
        aria-current={pagina === p ? 'page' : undefined}
        className={`flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg text-sm cursor-pointer ${
          pagina === p ? 'bg-gelo text-azul font-semibold' : 'text-tinta-suave'
        }`}
      >
        <Icone className="w-4 h-4" aria-hidden />
        {rotulo}
      </button>
    ))}
  </nav>
);
