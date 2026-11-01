const FUSO = 'America/Sao_Paulo';

function partes(iso: string) {
  const data = new Date(iso);
  const semana = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'long' }).format(data);
  const diaMes = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, day: 'numeric', month: 'long' }).format(data);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(data);
  const hora = p.find((x) => x.type === 'hour')?.value ?? '';
  const minuto = p.find((x) => x.type === 'minute')?.value ?? '00';
  const periodo = p.find((x) => x.type === 'dayPeriod')?.value ?? '';
  return { semana, diaMes, hora: `${hora}${minuto === '00' ? '' : `:${minuto}`} ${periodo}` };
}

// "Tuesday"
export function diaDaSemana(iso: string): string {
  return partes(iso).semana;
}

// "November 3, at 2 PM"
export function diaEHora(iso: string): string {
  const { diaMes, hora } = partes(iso);
  return `${diaMes}, at ${hora}`;
}

// "Tuesday, November 3, at 2 PM"
export function porExtenso(iso: string): string {
  const { semana, diaMes, hora } = partes(iso);
  return `${semana}, ${diaMes}, at ${hora}`;
}

export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: FUSO, month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
