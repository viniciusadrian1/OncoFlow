import React, { useRef, type RefObject } from 'react';
import type { EstadoOrbe } from './OrbeLia';
import { useNivelVisual } from './useNivelVisual';

const BARRAS = [8, 15, 23, 14, 30, 19, 35, 25, 40, 30, 44, 33, 38, 27, 43, 31, 38, 25, 34, 20, 29, 17, 23, 12, 18, 9, 14];

export function OndaVoz({ estado, nivel }: { estado: EstadoOrbe; nivel?: RefObject<number> }) {
  const element = useRef<HTMLDivElement>(null);
  useNivelVisual(element, nivel, estado === 'ouvindo' || estado === 'falando');
  return <div ref={element} className="lia-waveform" data-estado={estado} aria-hidden="true">
    {BARRAS.map((altura, index) => <span key={index} style={{ height: altura, animationDelay: (index * 45) + 'ms' }} />)}
  </div>;
}
