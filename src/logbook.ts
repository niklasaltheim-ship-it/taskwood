import type { Task } from "./data";
import { daysUntil, iso } from "./dates";
import { lang, t } from "./i18n";

// Logbuch: Aufgaben mit Tag-Stempel (task.log = Tag, an dem sie angelegt wurden).
// Offene Aufgaben vergangener Tage erscheinen einfach am heutigen Tag (Anzeige-Regel, die Daten bleiben),
// erledigte gehören zum Tag, an dem sie erledigt wurden.

export const dayOf = (ts: number) => iso(new Date(ts));
export const isLog = (t: Task) => !!t.log && !t.parentId;

export type LogDay = { created: Task[]; done: Task[] };

// Alle Tage mit angelegten bzw. erledigten Logbuch-Aufgaben (optional nur eines Projekts)
export function logDays(tasks: Task[], projectId?: string) {
  const days = new Map<string, LogDay>();
  const at = (d: string) => {
    let x = days.get(d);
    if (!x) days.set(d, (x = { created: [], done: [] }));
    return x;
  };
  for (const task of tasks) {
    if (!isLog(task) || (projectId && task.projectId !== projectId)) continue;
    at(task.log!).created.push(task);
    if (task.doneAt) at(dayOf(task.doneAt)).done.push(task);
  }
  return days;
}

// Anzahl Einträge eines Tages (angelegt + erledigt, eine Aufgabe zählt einmal)
export const dayCount = (d?: LogDay) => (d ? new Set([...d.created, ...d.done].map(x => x.id)).size : 0);

// "seit Mo" bzw. "seit 3.10." für übernommene Aufgaben
export function sinceLabel(day: string) {
  const n = daysUntil(day);
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (n >= -6) {
    const wd = (lang() === "de" ? ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])[date.getDay()];
    return n === -1 ? t("seit gestern") : t("seit {d}", { d: wd });
  }
  return t("seit {d}", { d: lang() === "de" ? `${d}.${m}.` : `${m}/${d}` });
}

// Farbe des Logbuchs (eins für alle Projekte), gedämpftes Blau passend zur Waldpalette
export const LOG_COLOR = "#3E6A8A";

// Für den Hauptkalender: Anzahl Logbuch-Einträge je Tag
export function logDots(tasks: Task[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [day, d] of logDays(tasks)) out[day] = dayCount(d);
  return out;
}
