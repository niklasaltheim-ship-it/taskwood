import type { CalEvent } from "./data";
import { iso } from "./dates";

// Kalender-Import aus .ics-Dateien (iCalendar), komplett offline.
// Unterstützt: Einzeltermine, ganztägige Termine, Zeitzonen (TZID, UTC, ohne Zone),
// Wiederholungen (RRULE mit FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE und
// geänderte Einzeltermine (RECURRENCE-ID). Wiederholungen werden in einzelne Termine aufgelöst.

const DAY_MIN = 24 * 60;
const PAST_DAYS = 30; // ältere Termine werden nicht übernommen
const FUTURE_DAYS = 400; // Wiederholungen höchstens so weit in die Zukunft
const MAX_PER_EVENT = 500;
const MAX_DAYS_SPAN = 14; // mehrtägige ganztägige Termine: höchstens so viele Tage

// Uhrzeit in der Zone der Datei (Wandzeit)
type Wall = { y: number; m: number; d: number; h: number; mi: number; allDay: boolean; zone: string | null }; // zone: "UTC", TZID oder null = lokal
type Prop = { value: string; params: Record<string, string> };
type VEvent = Record<string, Prop[]>;

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function unescape(s: string) {
  return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

function parseLine(line: string): [string, Prop] | null {
  // Name;Param=Wert;Param="Wert:mit:Doppelpunkt":Inhalt
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return [name.toUpperCase(), { value: line.slice(colon + 1), params }];
}

function readEvents(text: string): VEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: VEvent[] = [];
  let cur: VEvent | null = null;
  let depth = 0; // verschachtelte Blöcke (z. B. VALARM) im Termin überspringen
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    const [name, prop] = p;
    const v = prop.value.toUpperCase();
    if (name === "BEGIN") {
      if (v === "VEVENT" && !cur) {
        cur = {};
        depth = 0;
      } else if (cur) depth++;
      continue;
    }
    if (name === "END") {
      if (cur && depth > 0) depth--;
      else if (cur && v === "VEVENT") {
        out.push(cur);
        cur = null;
      }
      continue;
    }
    if (cur && depth === 0) (cur[name] ??= []).push(prop);
  }
  return out;
}

function parseWall(p: Prop): Wall | null {
  const m = p.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const allDay = !m[4] || p.params.VALUE === "DATE";
  return {
    y: +m[1],
    m: +m[2],
    d: +m[3],
    h: allDay ? 0 : +m[4],
    mi: allDay ? 0 : +m[5],
    allDay,
    zone: m[7] ? "UTC" : p.params.TZID ?? null,
  };
}

// Abstand der Zone zu UTC in ms zum Zeitpunkt utc (über Intl; unbekannte Zonen -> null)
function zoneOffset(zone: string, utc: number): number | null {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(f.formatToParts(new Date(utc)).map(x => [x.type, x.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return asUtc - utc;
  } catch {
    return null;
  }
}

// Wandzeit der Datei -> Zeitpunkt (ms)
function toInstant(w: Wall): number {
  if (w.allDay || !w.zone) return new Date(w.y, w.m - 1, w.d, w.h, w.mi).getTime();
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  if (w.zone === "UTC") return guess;
  const off = zoneOffset(w.zone, guess);
  if (off === null) return new Date(w.y, w.m - 1, w.d, w.h, w.mi).getTime(); // z. B. Windows-Zonennamen: als Ortszeit lesen
  const first = guess - off;
  const off2 = zoneOffset(w.zone, first) ?? off;
  return guess - off2;
}

const addDays = (w: Wall, n: number): Wall => {
  const d = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { ...w, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const weekday = (w: Wall) => new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayKey = (w: Wall) => `${w.y}${String(w.m).padStart(2, "0")}${String(w.d).padStart(2, "0")}`;
const timeKey = (w: Wall) => `${dayKey(w)}T${String(w.h).padStart(2, "0")}${String(w.mi).padStart(2, "0")}`;

// n-ter Wochentag im Monat (n < 0: vom Ende her)
function nthWeekday(y: number, m: number, wd: number, n: number): number | null {
  const len = daysIn(y, m);
  const days: number[] = [];
  for (let d = 1; d <= len; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === wd) days.push(d);
  const d = n > 0 ? days[n - 1] : days[days.length + n];
  return d ?? null;
}

// Alle Starts einer Wiederholungsregel bis "until" (Wandzeiten)
function expand(start: Wall, rule: string, from: number, limit: number): Wall[] {
  const r: Record<string, string> = Object.fromEntries(
    rule.split(";").map(kv => kv.split("=") as [string, string]).map(([k, v]) => [k.toUpperCase(), (v ?? "").toUpperCase()])
  );
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  let until = Infinity;
  if (r.UNTIL) {
    const u = parseWall({ value: r.UNTIL, params: {} });
    if (u) until = u.allDay ? toInstant(addDays({ ...u, zone: null }, 1)) - 1 : toInstant({ ...u, zone: u.zone ?? start.zone });
  }
  const byDay = r.BYDAY ? r.BYDAY.split(",").map(s => s.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/)).filter(Boolean) as RegExpMatchArray[] : [];
  const byMonthDay = r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number).filter(n => n) : [];
  const out: Wall[] = [];
  let n = 0;
  const push = (w: Wall) => {
    if (n >= count) return false;
    const at = toInstant(w);
    if (at > until || at > limit) return false;
    if (at >= toInstant(start)) {
      n++;
      if (at >= from - 86400000) out.push(w);
    }
    return out.length < MAX_PER_EVENT;
  };

  for (let k = 0; k < 20000; k++) {
    let cands: Wall[] = [];
    if (freq === "DAILY") cands = [addDays(start, k * interval)];
    else if (freq === "WEEKLY") {
      // Woche ab Montag
      const monday = addDays(start, -((weekday(start) + 6) % 7) + k * 7 * interval);
      const days = byDay.length ? byDay.map(m => WEEKDAYS.indexOf(m[2])) : [weekday(start)];
      cands = days.map(wd => addDays(monday, (wd + 6) % 7)).sort((a, b) => dayKey(a).localeCompare(dayKey(b)));
    } else if (freq === "MONTHLY") {
      const mIdx = start.m - 1 + k * interval;
      const y = start.y + Math.floor(mIdx / 12);
      const m = (mIdx % 12) + 1;
      if (byDay.length) {
        cands = byDay
          .map(x => nthWeekday(y, m, WEEKDAYS.indexOf(x[2]), Number(x[1] ?? 1) || 1))
          .filter((d): d is number => d !== null)
          .map(d => ({ ...start, y, m, d }));
      } else {
        const days = byMonthDay.length ? byMonthDay : [start.d];
        cands = days
          .map(d => (d < 0 ? daysIn(y, m) + d + 1 : d))
          .filter(d => d >= 1 && d <= daysIn(y, m))
          .map(d => ({ ...start, y, m, d }));
      }
      cands.sort((a, b) => a.d - b.d);
    } else if (freq === "YEARLY") {
      const y = start.y + k * interval;
      if (start.d <= daysIn(y, start.m)) cands = [{ ...start, y }];
    } else return [start];
    for (const c of cands) if (!push(c)) return out;
  }
  return out;
}

// Eine Termin-Instanz in einen oder mehrere CalEvents umwandeln (lokale Zeit)
function toEvents(start: Wall, durMs: number, allDayDays: number, base: Omit<CalEvent, "id" | "date" | "start" | "end">, key: string): CalEvent[] {
  if (start.allDay) {
    return Array.from({ length: Math.min(MAX_DAYS_SPAN, Math.max(1, allDayDays)) }, (_, i) => {
      const w = addDays(start, i);
      return { ...base, id: "", date: iso(new Date(w.y, w.m - 1, w.d)), source: `${key}+${i}` };
    });
  }
  const s = new Date(toInstant(start));
  const e = new Date(s.getTime() + durMs);
  const startMin = s.getHours() * 60 + s.getMinutes();
  const sameDay = iso(e) === iso(s);
  const endMin = sameDay ? e.getHours() * 60 + e.getMinutes() : DAY_MIN - 1;
  return [{ ...base, id: "", date: iso(s), start: startMin, end: Math.max(endMin, startMin + 1), source: key }];
}

function duration(ev: VEvent, start: Wall): { ms: number; days: number } {
  const end = ev.DTEND?.[0] && parseWall(ev.DTEND[0]);
  if (end) {
    if (start.allDay) {
      const days = Math.round((Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000);
      return { ms: 0, days };
    }
    return { ms: Math.max(0, toInstant(end) - toInstant(start)), days: 1 };
  }
  const d = ev.DURATION?.[0]?.value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
  if (d) {
    const days = Number(d[1] ?? 0) * 7 + Number(d[2] ?? 0);
    return { ms: ((days * 24 + Number(d[3] ?? 0)) * 60 + Number(d[4] ?? 0)) * 60000, days: Math.max(1, days) };
  }
  return { ms: start.allDay ? 0 : 3600000, days: 1 };
}

// Termine aus dem Dateitext. id bleibt leer; source ist stabil, damit erneuter Import nichts verdoppelt.
export function parseIcs(text: string, now = Date.now()): CalEvent[] {
  const events = readEvents(text);
  if (!events.length && !/BEGIN:VCALENDAR/i.test(text)) throw new Error("not ics");
  const from = now - PAST_DAYS * 86400000;
  const limit = now + FUTURE_DAYS * 86400000;
  // Geänderte Einzeltermine ersetzen die passende Wiederholung
  const overridden = new Set<string>();
  for (const ev of events) {
    const rid = ev["RECURRENCE-ID"]?.[0] && parseWall(ev["RECURRENCE-ID"][0]);
    if (rid) overridden.add(`${ev.UID?.[0]?.value}|${dayKey(rid)}`);
  }
  const out: CalEvent[] = [];
  events.forEach((ev, idx) => {
    if (ev.STATUS?.[0]?.value.toUpperCase() === "CANCELLED") return;
    const start = ev.DTSTART?.[0] && parseWall(ev.DTSTART[0]);
    if (!start) return;
    const uid = ev.UID?.[0]?.value ?? `noid-${idx}`;
    const title = unescape(ev.SUMMARY?.[0]?.value ?? "") || "—";
    const place = unescape(ev.LOCATION?.[0]?.value ?? "") || undefined;
    const base = { title, place, exam: false };
    const dur = duration(ev, start);
    const rid = ev["RECURRENCE-ID"]?.[0] && parseWall(ev["RECURRENCE-ID"][0]);
    const rule = !rid && ev.RRULE?.[0]?.value;
    const exdates = new Set<string>();
    for (const x of ev.EXDATE ?? []) {
      for (const v of x.value.split(",")) {
        const w = parseWall({ value: v, params: x.params });
        if (w) exdates.add(w.allDay ? dayKey(w) : timeKey(w));
      }
    }
    const starts = rule ? expand(start, rule, from, limit) : [start];
    for (const s of starts) {
      if (exdates.has(dayKey(s)) || exdates.has(timeKey(s))) continue;
      if (rule && overridden.has(`${uid}|${dayKey(s)}`)) continue;
      const endAt = s.allDay ? toInstant(addDays(s, Math.max(1, dur.days))) : toInstant(s) + dur.ms;
      if (endAt < from) continue;
      out.push(...toEvents(s, dur.ms, dur.days, base, `ics:${uid}:${rid ? dayKey(rid) : timeKey(s)}`));
      if (out.length > 5000) return;
    }
  });
  return out;
}
