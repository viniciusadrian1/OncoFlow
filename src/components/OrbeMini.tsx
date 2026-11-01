import React from 'react';
import { LiaOrbArt } from './LiaOrbArt';

// Static version: readable in compact team labels, without continuous decorative animation.
export const OrbeMini: React.FC<{ className?: string }> = ({ className }) => (
  <span aria-hidden="true" className={`inline-block shrink-0 ${className ?? ''}`}><LiaOrbArt /></span>
);
