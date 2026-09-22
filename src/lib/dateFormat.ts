import type { Language } from "./i18n";

const LOCALE: Record<Language, string> = { en: "en-US", hi: "hi-IN" };

// The one place a date is turned into display text, so every date on screen — the daily
// summary, due dates, expiry dates, transaction rows, stock history — reads consistently and
// matches the app's current language (MM/DD/YYYY for English, DD/MM/YYYY for Hindi), instead
// of some spots showing a raw "YYYY-MM-DD" string and others using the browser's own locale
// via a bare toLocaleDateString() call.
export function formatDate(dateISO: string, language: Language): string {
  if (!dateISO) return "";
  // A bare "YYYY-MM-DD" string parses as UTC midnight; giving it an explicit local
  // time-of-day avoids that shifting the displayed date by a day in some timezones.
  const d = dateISO.includes("T") ? new Date(dateISO) : new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString(LOCALE[language], { year: "numeric", month: "2-digit", day: "2-digit" });
}
