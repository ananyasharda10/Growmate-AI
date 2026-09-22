export function id(): string {
  return crypto.randomUUID();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// "Today" must follow the device's local calendar day, not UTC — new Date().toISOString()
// reads the UTC date, which is already tomorrow for anyone west of UTC in the evening.
export function todayISO(): string {
  return toLocalISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

// Extracts the calendar date an ISO timestamp falls on in the device's local timezone.
// Only use this on full timestamps (e.g. a sale/expense's `date`, from nowISO()) — never on
// a value that's already a plain "YYYY-MM-DD" date (e.g. a due date or expiry date), since
// those have no time-of-day and reparsing them as an instant would shift them by a day in
// some timezones.
export function localDateOf(isoString: string): string {
  return toLocalISODate(new Date(isoString));
}

export function daysBetween(a: string, b: string): number {
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export function addDays(dateISO: string, days: number): string {
  // Parsed with an explicit local time-of-day (no "Z"/offset) so it lands on local midnight
  // instead of UTC midnight — otherwise setDate/toLocalISODate below could land on the wrong
  // day depending on the device's timezone.
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}
