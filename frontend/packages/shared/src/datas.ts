/** Datas sempre exibidas no fuso da instituição (America/Sao_Paulo), vindas da API em UTC/ISO. */

const FUSO = "America/Sao_Paulo";

export function formatarDataHora(iso: string): string {
  // "quinta-feira, 6 de novembro · 10h30"
  const data = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long" }).format(data);
  const [h, m] = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
    .format(data)
    .split(":");
  return `${dia} · ${h}h${m}`;
}

export function formatarData(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

export function formatarRelativo(iso: string, agora = new Date()): string {
  const minutos = Math.round((agora.getTime() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(minutos) < 60) return rtf.format(-minutos, "minute");
  const horas = Math.round(minutos / 60);
  if (Math.abs(horas) < 24) return rtf.format(-horas, "hour");
  return rtf.format(-Math.round(horas / 24), "day");
}
