import type { Project, Task } from "./data";
import { daysUntil, iso } from "./dates";
import { lang, t } from "./i18n";
import type { AnimalKind } from "./sprites";

// Logbuch: Aufgaben mit Tag-Stempel (task.log = Tag, an dem sie angelegt wurden).
// Offene Aufgaben vergangener Tage erscheinen einfach am heutigen Tag (Anzeige-Regel, die Daten bleiben),
// erledigte gehören zum Tag, an dem sie erledigt wurden.

export const dayOf = (ts: number) => iso(new Date(ts));
export const isLog = (t: Task) => !!t.log && !t.parentId;

export type LogDay = { created: Task[]; done: Task[] };

// Alle Tage eines Projekts (oder aller Projekte) mit angelegten bzw. erledigten Logbuch-Aufgaben
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

// Projektfarbe fürs Logbuch: je Tier gut unterscheidbar, gedämpft passend zur Waldpalette
const LOG_COLORS: Record<AnimalKind, string> = {
  beaver: "#7F4F24",
  fox: "#C0612F",
  squirrel: "#8A4A63",
  raccoon: "#3E6A8A",
  hedgehog: "#5C7A2E",
  owl: "#5E5490",
  rabbit: "#3F7A68",
};
export const projectColor = (p: Project) => LOG_COLORS[p.animal];

// Punkte für den Hauptkalender: je Tag die Projekte mit Logbuch-Einträgen
export type LogDot = { projectId: string; name: string; color: string; count: number };
export function logDots(tasks: Task[], projects: Project[]): Record<string, LogDot[]> {
  const out: Record<string, LogDot[]> = {};
  for (const p of projects) {
    if (p.logHidden) continue;
    for (const [day, d] of logDays(tasks, p.id)) {
      (out[day] ??= []).push({ projectId: p.id, name: p.name, color: projectColor(p), count: dayCount(d) });
    }
  }
  return out;
}
