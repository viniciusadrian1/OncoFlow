// Cabeçalho do OncoFlow Pro: saudação, busca de pacientes, pendências e menu do usuário.

import React, { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut, RotateCcw, Search, Smartphone } from 'lucide-react';
import type { UsuarioEquipe } from '../types';
import { iniciais, nomeCurto, saudacao } from './proUtil';

interface TopoProps {
  usuario: UsuarioEquipe;
  busca: string;
  onBuscar: (texto: string) => void;
  totalPendencias: number;
  onAbrirPendencias: () => void;
  onResetarDemo: () => void;
  onLogout: () => void;
}

export const Topo: React.FC<TopoProps> = ({
  usuario,
  busca,
  onBuscar,
  totalPendencias,
  onAbrirPendencias,
  onResetarDemo,
  onLogout,
}) => {
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    const fechar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [menuAberto]);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-azul tracking-tight">
          {saudacao()}, {nomeCurto(usuario.nome)}
        </h1>
        <p className="text-tinta-suave">Follow-up for your oncology unit.</p>
      </div>

      <div className="flex items-center gap-3 flex-1 justify-end min-w-[260px]">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-tinta-suave" aria-hidden />
          <label htmlFor="busca-paciente" className="sr-only">
            Search patient
          </label>
          <input
            id="busca-paciente"
            type="search"
            value={busca}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Search patient…"
            className="w-full pl-11 pr-4 py-2.5 rounded-full border border-linha bg-white text-sm text-azul focus:outline-none focus:ring-2 focus:ring-verde"
          />
        </div>

        <button
          type="button"
          onClick={onAbrirPendencias}
          aria-label={`${totalPendencias} open pending items`}
          className="relative w-11 h-11 rounded-full flex items-center justify-center text-azul hover:bg-gelo cursor-pointer"
        >
          <Bell className="w-6 h-6" aria-hidden />
          {totalPendencias > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-teal border-2 border-white" />
          )}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuAberto(!menuAberto)}
            aria-expanded={menuAberto}
            aria-label="User menu"
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <span className="w-11 h-11 rounded-full bg-ardosia text-white flex items-center justify-center font-semibold">
              {iniciais(usuario.nome)}
            </span>
            <ChevronDown className={`w-5 h-5 text-azul transition-transform ${menuAberto ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {menuAberto && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-linha shadow-lg p-2 z-40 text-sm">
              <div className="px-3 py-2 border-b border-linha mb-1">
                <p className="font-semibold text-azul">{usuario.nome}</p>
                <p className="text-xs text-tinta-suave">{usuario.cargo}</p>
              </div>
              <a
                href="/app/"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-azul hover:bg-gelo"
              >
                <Smartphone className="w-4 h-4 text-verde" aria-hidden />
                Open patient app (demo)
              </a>
              <button
                type="button"
                onClick={() => {
                  setMenuAberto(false);
                  onResetarDemo();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-azul hover:bg-gelo cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-verde" aria-hidden />
                Reset demo data
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-urgente hover:bg-urgente-fundo cursor-pointer"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
