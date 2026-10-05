import type { CalEvent } from "./data";
import { daysUntil } from "./dates";
import { t } from "./i18n";

const MIN = 60000;
const DAY_MIN = 24 * 60;
const ALL_DAY_REMIND = 8 * 60; // ganztägige Termine: Erinnerung um 8:00

// Beschriftungen werden beim Anzeigen übersetzt
export const REMIND_OPTIONS: { value: number | undefined; label: string }[] = [
  { value: undefined, label: "Keine" },
  { value: 0, label: "Zur Startzeit" },
  { value: 15, label: "15 Min. vorher" },
  { value: 60, label: "1 Std. vorher" },
  { value: DAY_MIN, label: "1 Tag vorher" },
];

const byTime = (a: CalEvent, b: CalEvent) => a.date.localeCompare(b.date) || (a.start ?? -1) - (b.start ?? -1);

export const eventsOn = (events: CalEvent[], date: string) => events.filter(e => e.date === date).sort(byTime);

// Startzeitpunkt (ms); ganztägig = Tagesbeginn
export function startsAt(e: CalEvent) {
  const [y, m, d] = e.date.split("-").map(Number);
  return new Date(y, m - 1, d, 0, e.start ?? 0).getTime();
}

// Ende (ms); ganztägig = Tagesende
export function endsAt(e: CalEvent) {
  const [y, m, d] = e.date.split("-").map(Number);
  const end = e.end ?? (e.start !== undefined ? e.start + 60 : DAY_MIN);
  return new Date(y, m - 1, d, 0, end).getTime();
}

// Wann erinnert wird (ms) oder null. Ganztägig: 8:00 am Tag, bei "1 Tag vorher" 8:00 am Vortag.
export function reminderAt(e: CalEvent): number | null {
  if (e.remind === undefined) return null;
  if (e.start === undefined) {
    const [y, m, d] = e.date.split("-").map(Number);
    const day = new Date(y, m - 1, d, 0, ALL_DAY_REMIND).getTime();
    return e.remind >= DAY_MIN ? day - DAY_MIN * MIN : day;
  }
  return startsAt(e) - e.remind * MIN;
}

// Erinnerungen, die jetzt fällig sind und noch nicht gemeldet wurden.
// Verpasste (App war aus) nur, solange der Termin noch nicht vorbei ist.
export function dueReminders(events: CalEvent[], now = Date.now()) {
  return events.filter(e => {
    const at = reminderAt(e);
    return at !== null && !e.notifiedAt && at <= now && endsAt(e) > now;
  });
}

// Termine mit Uhrzeit, die gerade laufen und noch nicht bestätigt wurden
export const activeAppointments = (events: CalEvent[], now = Date.now()) =>
  events.filter(e => e.start !== undefined && !e.seenAt && startsAt(e) <= now && endsAt(e) > now).sort(byTime);

// Kommende Prüfungen innerhalb von "days" Tagen (heute eingeschlossen), nächste zuerst
export const upcomingExams = (events: CalEvent[], days: number) =>
  events.filter(e => e.exam && daysUntil(e.date) >= 0 && daysUntil(e.date) <= days && endsAt(e) > Date.now()).sort(byTime);

export function countdown(date: string) {
  const n = daysUntil(date);
  return n === 0 ? t("heute") : n === 1 ? t("morgen") : t("noch {n} Tage", { n });
}
