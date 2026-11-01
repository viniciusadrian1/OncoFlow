import React, { useId } from 'react';

/** Layered, transparent glass form shared by the full and compact Lia symbols. */
export function LiaOrbArt() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 256 256" fill="none" aria-hidden="true" className="lia-orb-art">
      <defs>
        <radialGradient id={id + '-body'} cx=".29" cy=".22" r=".85">
          <stop stopColor="var(--lia-glass-light)" /><stop offset=".42" stopColor="var(--lia-aqua)" />
          <stop offset=".77" stopColor="var(--lia-cyan)" /><stop offset="1" stopColor="var(--lia-blue)" />
        </radialGradient>
        <linearGradient id={id + '-ribbon'} x1="42" y1="58" x2="199" y2="207" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--lia-glass-light)" stopOpacity=".95" /><stop offset=".45" stopColor="var(--lia-cyan)" stopOpacity=".75" />
          <stop offset="1" stopColor="var(--lia-blue)" stopOpacity=".92" />
        </linearGradient>
        <linearGradient id={id + '-fold'} x1="208" y1="71" x2="67" y2="223" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--lia-glass-light)" stopOpacity=".92" /><stop offset=".45" stopColor="var(--lia-aqua)" stopOpacity=".7" />
          <stop offset="1" stopColor="var(--lia-teal)" stopOpacity=".9" />
        </linearGradient>
        <radialGradient id={id + '-light'} cx=".3" cy=".18" r=".8">
          <stop stopColor="white" stopOpacity=".8" /><stop offset=".54" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor="white" stopOpacity=".22" />
        </radialGradient>
        <clipPath id={id + '-clip'}><circle cx="128" cy="128" r="104" /></clipPath>
      </defs>
      <g className="lia-orb-volume">
        <circle cx="128" cy="128" r="106" fill="white" fillOpacity=".55" />
        <g clipPath={'url(#' + id + '-clip)'}>
          <circle cx="128" cy="128" r="104" fill={'url(#' + id + '-body)'} />
          <g className="lia-orb-fold lia-orb-fold-back">
            <path d="M15 157C27 106 57 67 96 77C140 88 140 145 176 147C201 150 223 129 246 105L245 236H10Z" fill={'url(#' + id + '-ribbon)'} />
            <path d="M25 153C55 100 79 114 108 145C145 184 183 178 232 140" stroke="white" strokeOpacity=".35" strokeWidth="1.5" />
          </g>
          <g className="lia-orb-fold lia-orb-fold-front">
            <path d="M16 100C42 61 82 72 114 118C141 158 173 174 199 148C227 121 244 144 240 181C232 232 176 255 123 232C79 213 90 159 56 143C37 135 19 143 16 100Z" fill={'url(#' + id + '-fold)'} />
            <path d="M21 99C58 70 87 91 115 127C142 162 169 175 193 153" stroke="white" strokeOpacity=".5" strokeWidth="1.6" />
          </g>
          <ellipse cx="86" cy="62" rx="57" ry="32" transform="rotate(-32 86 62)" fill="white" fillOpacity=".18" />
          <circle cx="128" cy="128" r="104" fill={'url(#' + id + '-light)'} />
        </g>
        <circle cx="128" cy="128" r="105" stroke="white" strokeOpacity=".65" strokeWidth="2" />
        <path d="M39 107C46 64 79 34 120 28" stroke="white" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
