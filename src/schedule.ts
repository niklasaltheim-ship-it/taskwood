import { lang } from "./i18n";

// Stundenplan. Zeiten in Minuten ab Mitternacht, Tage 1 = Montag … 5 = Freitag.
// Die Vorlesungen liegen in den gespeicherten Daten.

export type Lecture = { id: string; day: number; start: number; end: number; title: string; room: string; color: string };

export const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

// Gedämpfte Kursfarben, passend zur Waldpalette
export const LECTURE_COLORS = ["#3E6A8A", "#8A4A63", "#9A6A2E", "#3F7A68", "#5E5490", "#5C7A2E", "#8E3B34", "#6B6B6B"];
// Neue Nutzer starten mit leerem Stundenplan
export const DEFAULT_LECTURES: Lecture[] = [];

export const LUNCH = { start: toMin("13:00"), end: toMin("14:00") };
// Wochentage Mo–Fr in der eingestellten Sprache (kurz bzw. lang)
export const days = () => (lang() === "de" ? ["Mo", "Di", "Mi", "Do", "Fr"] : ["Mon", "Tue", "Wed", "Thu", "Fri"]);
export const dayNames = () =>
  lang() === "de" ? ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"] : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const DAY_START = toMin("8:00");
export const DAY_END = toMin("17:30");

export const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
// Für <input type="time">: immer zweistellig
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Gespeicherte Vorlesungen prüfen; Ungültiges fliegt raus
export function sanitizeLectures(v: unknown): Lecture[] {
  if (!Array.isArray(v)) return DEFAULT_LECTURES.map(l => ({ ...l }));
  return v.filter(
    (l): l is Lecture =>
      l && typeof l.title === "string" && l.day >= 1 && l.day <= 5 && typeof l.start === "number" && typeof l.end === "number" && l.end > l.start
  );
}

export const lecturesOn = (all: Lecture[], day: number) => all.filter(l => l.day === day).sort((a, b) => a.start - b.start);

// Heute als 1–5, am Wochenende null
export function weekday(d = new Date()) {
  const n = d.getDay();
  return n >= 1 && n <= 5 ? n : null;
}

export const minuteOfDay = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

// Laufende oder nächste Vorlesung heute
export function currentOrNext(all: Lecture[], d = new Date()): { lecture: Lecture; now: boolean } | null {
  const day = weekday(d);
  if (!day) return null;
  const m = minuteOfDay(d);
  const today = lecturesOn(all, day);
  const now = today.find(l => l.start <= m && m < l.end);
  if (now) return { lecture: now, now: true };
  const next = today.find(l => l.start > m);
  return next ? { lecture: next, now: false } : null;
}
