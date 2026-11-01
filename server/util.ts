// Utilitários de texto e data do servidor. Datas são gravadas em ISO (UTC) e exibidas no fuso
// de São Paulo.

const FUSO = 'America/Sao_Paulo';

let contador = 0;
export function gerarId(prefixo: string): string {
  contador += 1;
  return `${prefixo}-${Date.now().toString(36)}-${contador}`;
}

export function agoraISO(): string {
  return new Date().toISOString();
}

export function horarioDe(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// "Tuesday, November 3, at 2 PM" (ou "at 2:30 PM")
export function dataHoraPorExtenso(iso: string): string {
  const data = new Date(iso);
  const dia = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(data);
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(data);
  const hora = partes.find((p) => p.type === 'hour')?.value ?? '';
  const minuto = partes.find((p) => p.type === 'minute')?.value ?? '00';
  const periodo = partes.find((p) => p.type === 'dayPeriod')?.value ?? '';
  return `${dia}, at ${hora}${minuto === '00' ? '' : `:${minuto}`} ${periodo}`;
}

export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso));
}

export function somarHoras(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3_600_000).toISOString();
}

// Data relativa ao momento do seed (dias a partir de hoje, hora local de São Paulo).
// O offset fixo de -03:00 vale para São Paulo, que não tem horário de verão desde 2019.
export function diaRelativo(dias: number, hora: number, minuto = 0): string {
  const hoje = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const base = new Date(`${hoje}T00:00:00-03:00`);
  base.setUTCDate(base.getUTCDate() + dias);
  const ymd = base.toISOString().slice(0, 10);
  const hh = String(hora).padStart(2, '0');
  const mm = String(minuto).padStart(2, '0');
  return new Date(`${ymd}T${hh}:${mm}:00-03:00`).toISOString();
}

// Próximo dia da semana (0 = domingo) depois de hoje, no horário indicado.
export function proximoDiaDaSemana(diaSemana: number, hora: number, minuto = 0): string {
  const hojeSemana = new Date(diaRelativo(0, 12)).getUTCDay();
  let dias = (diaSemana - hojeSemana + 7) % 7;
  if (dias === 0) dias = 7;
  return diaRelativo(dias, hora, minuto);
}

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Verdadeiro se o texto normalizado contém alguma das expressões como palavras inteiras.
// Uma expressão terminada em "*" casa como prefixo ("cansad*" → cansado, cansada).
export function contemExpressao(textoNormalizado: string, expressoes: string[]): string | undefined {
  for (const expressao of expressoes) {
    const prefixo = expressao.endsWith('*');
    const corpo = escaparRegex(normalizar(prefixo ? expressao.slice(0, -1) : expressao));
    const regex = new RegExp(`(^|\\s)${corpo}${prefixo ? '' : '(?=\\s|$)'}`);
    if (regex.test(textoNormalizado)) return expressao;
  }
  return undefined;
}
