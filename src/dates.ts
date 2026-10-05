import type { Prio, Repeat } from "./data";
import { lang, locale, t } from "./i18n";

// Datumserkennung versteht Deutsch und Englisch gleichzeitig; die Anzeige folgt der eingestellten Sprache.

const DAY = 86400000;
// Wochentage je Sprache, Index 0 = Sonntag (wie Date.getDay)
const WEEKDAYS_DE = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const WEEKDAYS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SHORT_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const SHORT_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAY_RE = [...WEEKDAYS_DE, ...WEEKDAYS_EN].join("|");
const weekdayIndex = (name: string) => {
  const n = name.toLowerCase();
  const i = WEEKDAYS_DE.indexOf(n);
  return i >= 0 ? i : WEEKDAYS_EN.indexOf(n);
};

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Tage von heute bis zum Datum (negativ = überfällig)
export const daysUntil = (due: string) => Math.round((fromIso(due).getTime() - today().getTime()) / DAY);

// Wortgrenzen ohne \b, damit Umlaute ("übermorgen") funktionieren
const B = "(?:^|\\s)";
const E = "(?=$|\\s|[,;:!?])";
const PRE = "(?:(?:bis|am|ab|zum|by|on|due)\\s+)?";

// Datum ohne Jahr: liegt es in der Vergangenheit, ist das nächste Jahr gemeint
function dayMonth(day: number, month: number, yearText?: string): Date | null {
  const t0 = today();
  let year = yearText ? Number(yearText.length === 2 ? "20" + yearText : yearText) : t0.getFullYear();
  let d = new Date(year, month, day);
  if (!yearText && d < t0) d = new Date(++year, month, day);
  return d.getDate() === day && d.getMonth() === month ? d : null;
}

type Rule = { re: RegExp; date: (m: RegExpMatchArray) => Date | null };

const RELATIVE: Record<string, number> = {
  heute: 0,
  today: 0,
  morgen: 1,
  tomorrow: 1,
  übermorgen: 2,
  "day after tomorrow": 2,
};
const NUMBER_WORDS: Record<string, number> = { einem: 1, einer: 1, zwei: 2, drei: 3, a: 1, one: 1, two: 2, three: 3 };

const RULES: Rule[] = [
  {
    re: new RegExp(`${B}${PRE}(heute|übermorgen|morgen|today|day\\s+after\\s+tomorrow|tomorrow)${E}`, "i"),
    date: m => addDays(today(), RELATIVE[m[1].toLowerCase().replace(/\s+/g, " ")] ?? 0),
  },
  {
    re: new RegExp(`${B}in\\s+(\\d{1,3}|einem|einer|zwei|drei|a|one|two|three)\\s+(tag|tagen|woche|wochen|day|days|week|weeks)${E}`, "i"),
    date: m => {
      const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]);
      return addDays(today(), /^(woche|week)/i.test(m[2]) ? n * 7 : n);
    },
  },
  {
    re: new RegExp(`${B}(nächste\\s+woche|next\\s+week)${E}`, "i"),
    // Montag der nächsten Woche
    date: () => {
      const t0 = today();
      return addDays(t0, ((8 - t0.getDay()) % 7) || 7);
    },
  },
  {
    re: new RegExp(`${B}${PRE}(?:(nächsten|kommenden|next|this)\\s+)?(${WEEKDAY_RE})${E}`, "i"),
    // Nächstes Vorkommen; der heutige Wochentag meint die kommende Woche
    date: m => {
      const t0 = today();
      const diff = (weekdayIndex(m[2]) - t0.getDay() + 7) % 7 || 7;
      return addDays(t0, diff);
    },
  },
  {
    // Deutsch: 12.10. oder 12.10.2026 (Punkt am Ende nötig, damit "2.5 Stunden" kein Datum wird)
    re: new RegExp(`${B}${PRE}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?${E}`),
    date: m => dayMonth(Number(m[1]), Number(m[2]) - 1, m[3]),
  },
  {
    // Englisch: "by 10/12", "on 10/12" oder mit Jahr "10/12/2026" (Monat/Tag).
    // Ohne Vorwort und Jahr kein Datum, damit Brüche wie "Kapitel 1/2" Text bleiben.
    re: new RegExp(`${B}(?:(?:by|on|due|am|bis)\\s+(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?|(\\d{1,2})/(\\d{1,2})/(\\d{4}|\\d{2}))${E}`, "i"),
    date: m => (m[1] ? dayMonth(Number(m[2]), Number(m[1]) - 1, m[3]) : dayMonth(Number(m[5]), Number(m[4]) - 1, m[6])),
  },
  {
    // Englisch: Oct 12 / October 12
    re: new RegExp(`${B}${PRE}(${MONTHS_EN.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`, "i"),
    date: m => dayMonth(Number(m[2]), MONTHS_EN.indexOf(m[1].toLowerCase().slice(0, 3))),
  },
];

const PRIO_RE = new RegExp(`${B}(!{1,3})${E}`);

export type Parsed = { text: string; due?: string; prio?: Prio; repeat?: Repeat };

// Wiederholungen: "täglich", "jede Woche", "jeden Donnerstag", "monatlich", "daily", "every Monday" …
const REPEAT_RE = new RegExp(
  `${B}(täglich|jeden\\s+tag|wöchentlich|jede\\s+woche|monatlich|jeden\\s+monat|daily|every\\s+day|weekly|every\\s+week|monthly|every\\s+month|(?:jeden|every)\\s+(${WEEKDAY_RE}))${E}`,
  "i"
);

function parseRepeat(m: RegExpMatchArray): { repeat: Repeat; due: Date } {
  const word = m[1].toLowerCase();
  if (m[2]) {
    // jeden Donnerstag: nächster Donnerstag, heute zählt mit
    const t0 = today();
    return { repeat: "weekly", due: addDays(t0, (weekdayIndex(m[2]) - t0.getDay() + 7) % 7) };
  }
  if (/täglich|tag$|daily|day$/.test(word)) return { repeat: "daily", due: today() };
  if (/monat|month/.test(word)) return { repeat: "monthly", due: today() };
  return { repeat: "weekly", due: today() };
}

// Nächster Termin einer wiederkehrenden Aufgabe; liegt er in der Vergangenheit, bis heute weiterzählen
export function nextDue(due: string, repeat: Repeat): string {
  const base = fromIso(due);
  const day = base.getDate();
  const t0 = today();
  let d = base;
  let i = 0;
  do {
    i++;
    if (repeat === "daily") d = addDays(base, i);
    else if (repeat === "weekly") d = addDays(base, 7 * i);
    else {
      // gleicher Tag im Folgemonat, am Monatsende begrenzt (31.1. -> 28.2.)
      const y = base.getFullYear();
      const mo = base.getMonth() + i;
      const last = new Date(y, mo + 1, 0).getDate();
      d = new Date(y, mo, Math.min(day, last));
    }
  } while (d < t0);
  return iso(d);
}

export const repeatLabel = (r: Repeat) => t({ daily: "täglich", weekly: "wöchentlich", monthly: "monatlich" }[r]);

// Erkennt Fälligkeit, Wiederholung und Priorität ("!", "!!", "!!!") im Text und entfernt sie daraus
export function parseTask(input: string): Parsed {
  let text = input;
  let due: string | undefined;
  let prio: Prio | undefined;
  let repeat: Repeat | undefined;
  let repeatDue: Date | undefined;
  const rm = text.match(REPEAT_RE);
  if (rm) {
    ({ repeat, due: repeatDue } = parseRepeat(rm));
    text = text.slice(0, rm.index) + " " + text.slice(rm.index! + rm[0].length);
  }
  for (const r of RULES) {
    const m = text.match(r.re);
    const d = m && r.date(m);
    if (m && d) {
      due = iso(d);
      text = text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length);
      break;
    }
  }
  const p = text.match(PRIO_RE);
  if (p) {
    prio = p[1].length as Prio;
    text = text.slice(0, p.index) + " " + text.slice(p.index! + p[0].length);
  }
  text = text.replace(/\s+/g, " ").trim();
  // Nur Datum eingegeben: dann ist es wohl doch der Aufgabentext
  if (!text) return { text: input.trim() };
  if (repeat && !due) due = iso(repeatDue!);
  return { text, due, prio, repeat };
}

// Tag und Monat kurz: 12.10. bzw. 10/12
const shortDate = (d: Date) => (lang() === "de" ? `${d.getDate()}.${d.getMonth() + 1}.` : `${d.getMonth() + 1}/${d.getDate()}`);

// Kurzform für die Liste: Heute, Morgen, Fr, 12.10.
export function formatDue(due: string) {
  const n = daysUntil(due);
  const d = fromIso(due);
  if (n === 0) return t("Heute");
  if (n === 1) return t("Morgen");
  if (n === -1) return t("Gestern");
  if (n > 1 && n < 7) return (lang() === "de" ? SHORT_DE : SHORT_EN)[d.getDay()];
  const short = shortDate(d);
  if (d.getFullYear() === new Date().getFullYear()) return short;
  return lang() === "de" ? short + d.getFullYear() : `${short}/${d.getFullYear()}`;
}

// Lange Form für Hinweise: Freitag, 3.10.
export function formatDueLong(due: string) {
  const d = fromIso(due);
  const n = daysUntil(due);
  const day = n === 0 ? t("Heute") : n === 1 ? t("Morgen") : d.toLocaleDateString(locale(), { weekday: "long" });
  return `${day}, ${shortDate(d)}`;
}
