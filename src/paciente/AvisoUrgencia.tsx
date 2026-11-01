// Aviso de urgência aprovado pelo hospital. Aparece em toda tela de check-in e da Lia
// (CLAUDE.md, regra 6): o app não é monitoramento em tempo real nem serviço de emergência.

import React, { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { AvisoUrgencia as Aviso } from '../types';

interface Props {
  aviso: Aviso;
  destaque?: boolean;
}

export const AvisoUrgencia: React.FC<Props> = ({ aviso, destaque = false }) => {
  const [aberto, setAberto] = useState(destaque);

  if (destaque) {
    return (
      <div role="alert" className="rounded-2xl border-2 border-urgente-borda bg-urgente-fundo p-4 space-y-2">
        <p className="flex items-center gap-2 font-bold text-urgente">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
          {aviso.titulo}
        </p>
        <p className="text-azul">{aviso.texto}</p>
        <p className="font-semibold text-azul select-all">{aviso.contato}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-urgente-borda bg-urgente-fundo">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-urgente">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          Not an emergency channel
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-azul">
          What to do
          <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden />
        </span>
      </button>
      {aberto && (
        <div className="px-3.5 pb-3 space-y-1.5 text-sm">
          <p className="text-azul">{aviso.texto}</p>
          <p className="font-semibold text-azul select-all">{aviso.contato}</p>
        </div>
      )}
    </div>
  );
};
