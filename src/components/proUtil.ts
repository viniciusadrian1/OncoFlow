// Utilitários de apresentação do OncoFlow Pro.

const FUSO = 'America/Sao_Paulo';

export function iniciais(nome: string): string {
  const partes = nome.replace(/^(Dra?\.|Nurse)\s*/, '').split(' ').filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

// "Dr. Camila Ribeiro" -> "Dr. Ribeiro"; "Nurse Rodrigo Mendes" -> "Rodrigo"; "Carla Menezes" -> "Carla"
export function nomeCurto(nome: string): string {
  if (/^Dra?\.\s/.test(nome)) return `Dr. ${nome.split(' ').slice(-1)[0]}`;
  return nome.replace(/^Nurse\s+/, '').split(' ')[0];
}

// "Non-small cell lung carcinoma, stage IV..." -> "Non-small cell lung carcinoma"
export function diagnosticoCurto(diagnostico: string): string {
  return diagnostico.split(/[,.]/)[0].trim();
}

export function saudacao(agora = new Date()): string {
  const hora = Number(new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: 'numeric', hourCycle: 'h23' }).format(agora));
  if (hora < 12) return 'Good morning';
  if (hora < 18) return 'Good afternoon';
  return 'Good evening';
}

// "Tue, Nov 3 · 2 PM"
export function dataCompromisso(iso: string): string {
  const d = new Date(iso);
  const semana = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, weekday: 'short' }).format(d);
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, day: 'numeric', month: 'short' }).format(d);
  const p = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d);
  const h = p.find((x) => x.type === 'hour')?.value ?? '';
  const m = p.find((x) => x.type === 'minute')?.value ?? '00';
  const periodo = p.find((x) => x.type === 'dayPeriod')?.value ?? '';
  return `${semana}, ${dia} · ${h}${m === '00' ? '' : `:${m}`} ${periodo}`;
}

export function dataHoraCurta(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
