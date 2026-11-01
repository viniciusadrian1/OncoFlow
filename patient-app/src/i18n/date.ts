import { DEMO_TIMEZONE } from "../demo/fixtures";
import { getLocale, type AppLocale } from "./index";

export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long" },
  locale: AppLocale = getLocale(),
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: DEMO_TIMEZONE,
  }).format(new Date(iso));
}
