import React, { useRef, type RefObject } from 'react';
import { LiaOrbArt } from '../components/LiaOrbArt';
import { useNivelVisual } from './useNivelVisual';

export type EstadoOrbe = 'espera' | 'ouvindo' | 'processando' | 'falando' | 'concluido';

export const ROTULO_ORBE: Record<EstadoOrbe, string> = {
  espera: 'Lia available', ouvindo: 'Listening', processando: 'Looking up your information',
  falando: 'Lia speaking', concluido: 'Done',
};

interface OrbeLiaProps {
  estado: EstadoOrbe;
  tamanho?: number;
  mostrarRotulo?: boolean;
  nivel?: RefObject<number>;
}

export const OrbeLia: React.FC<OrbeLiaProps> = ({ estado, tamanho = 160, mostrarRotulo = false, nivel }) => {
  const element = useRef<HTMLDivElement>(null);
  useNivelVisual(element, nivel, tamanho >= 60 && (estado === 'ouvindo' || estado === 'falando'));
  return <div className="lia-orb-wrap">
    <div ref={element} className="lia-orb" data-estado={estado} data-compacto={tamanho < 80}
      role="img" aria-label={ROTULO_ORBE[estado]} style={{ width: tamanho, height: tamanho }}>
      <span className="lia-orb-aura" aria-hidden="true" /><LiaOrbArt />
    </div>
    {mostrarRotulo && <p className="lia-orb-label" aria-live="polite">{ROTULO_ORBE[estado]}</p>}
  </div>;
};
