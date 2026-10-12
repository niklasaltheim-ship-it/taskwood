import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { CalEvent, Project, Task } from "./data";
import { daysUntil, iso, repeatLabel } from "./dates";
import { countdown, eventsOn, REMIND_OPTIONS } from "./events";
import { hhmm, hm, lecturesOn, toMin } from "./schedule";
import type { Lecture } from "./schedule";
import { lang, locale, t } from "./i18n";

type Props = {
  events: CalEvent[];
  onEvents: (events: CalEvent[]) => void;
  tasks: Task[]; // offene Aufgaben mit Fälligkeit
  projects: Project[];
  lectures: Lecture[];
  focus?: string | null; // Tag, der beim Öffnen gewählt sein soll
  onOpenTask: (task: Task) => void;
  onImport?: () => void; // Kalender-Import (.ics), falls eingeschaltet
  importMsg?: string | null;
};

type Draft = {
  id: string | null;
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  place: string;
  exam: boolean;
  projectId: string;
  remind: string; // "" = keine
};


const EXAM = "#8E3B34";
const uid = () => Math.random().toString(36).slice(2, 10);

const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export default function Calendar({ events, onEvents, tasks, projects, lectures, focus, onOpenTask, onImport, importMsg }: Props) {
  const todayIso = iso(new Date());
  const [selected, setSelected] = useState(focus ?? todayIso);
  const [month, setMonth] = useState(() => {
    const d = fromIso(focus ?? todayIso);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!focus) return;
    setSelected(focus);
    const d = fromIso(focus);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [focus]);

  const tasksOn = (date: string) => tasks.filter(t => t.due === date);
  const projectName = (id?: string) => projects.find(p => p.id === id)?.name;

  // ---------- Monatsraster ----------

  const first = month;
  const offset = (first.getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + daysInMonth) / 7) * 7;
  const shiftMonth = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    setSelected(todayIso);
    const d = new Date();
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const cell = (i: number) => {
    const d = new Date(first.getFullYear(), first.getMonth(), i - offset + 1);
    const date = iso(d);
    const inMonth = d.getMonth() === first.getMonth();
    const dayTasks = tasksOn(date);
    const dayEvents = eventsOn(events, date);
    const exams = dayEvents.filter(e => e.exam);
    const late = dayTasks.length > 0 && daysUntil(date) < 0;
    const cls = ["cal-cell", !inMonth && "out", date === todayIso && "today", date === selected && "on", d.getDay() % 6 === 0 && "weekend"]
      .filter(Boolean)
      .join(" ");
    return (
      <button key={date} className={cls} onClick={() => setSelected(date)} onDoubleClick={() => openNew(date)}>
        <span className="cal-num">{d.getDate()}</span>
        {exams.length > 0 && <span className="cal-exam" title={exams.map(e => e.title).join(", ")} />}
        <span className="cal-dots">
          {dayEvents.filter(e => !e.exam).slice(0, 2).map(e => <i key={e.id} className="dot dot-ev" />)}
          {dayTasks.slice(0, 3).map(t => <i key={t.id} className={late ? "dot dot-late" : "dot dot-task"} />)}
        </span>
      </button>
    );
  };

  // ---------- Termine bearbeiten ----------

  const openNew = (date: string) => {
    setSelected(date);
    setDraft({ id: null, title: "", date, allDay: false, start: "10:00", end: "11:00", place: "", exam: false, projectId: "", remind: "15" });
    setConfirmDel(false);
  };

  const openEdit = (e: CalEvent) => {
    setDraft({
      id: e.id,
      title: e.title,
      date: e.date,
      allDay: e.start === undefined,
      start: hhmm(e.start ?? 600),
      end: hhmm(e.end ?? (e.start ?? 600) + 60),
      place: e.place ?? "",
      exam: e.exam,
      projectId: e.projectId ?? "",
      remind: e.remind === undefined ? "" : String(e.remind),
    });
    setConfirmDel(false);
  };

  const start = draft?.start ? toMin(draft.start) : 0;
  const end = draft?.end ? toMin(draft.end) : 0;
  const timeOk = !!draft && (draft.allDay || end > start);
  const valid = !!draft && draft.title.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && timeOk;

  const save = () => {
    if (!draft || !valid) return;
    const old = draft.id ? events.find(x => x.id === draft.id) : undefined;
    const e: CalEvent = {
      id: draft.id ?? uid(),
      title: draft.title.trim(),
      date: draft.date,
      start: draft.allDay ? undefined : start,
      end: draft.allDay ? undefined : end,
      place: draft.place.trim() || undefined,
      exam: draft.exam,
      projectId: draft.projectId || undefined,
      remind: draft.remind === "" ? undefined : Number(draft.remind),
    };
    // Erneut erinnern, wenn sich Zeitpunkt oder Erinnerung geändert haben
    if (old && old.date === e.date && old.start === e.start && old.remind === e.remind) e.notifiedAt = old.notifiedAt;
    if (old && old.date === e.date && old.start === e.start) e.seenAt = old.seenAt;
    onEvents(draft.id ? events.map(x => (x.id === draft.id ? e : x)) : [...events, e]);
    setSelected(e.date);
    setDraft(null);
  };

  const remove = () => {
    if (!draft?.id) return;
    onEvents(events.filter(x => x.id !== draft.id));
    setDraft(null);
  };

  // ---------- Tagesliste ----------

  const sel = fromIso(selected);
  const weekday = sel.getDay();
  const dayEvents = eventsOn(events, selected);
  const dayTasks = tasksOn(selected);
  const dayLectures = weekday >= 1 && weekday <= 5 ? lecturesOn(lectures, weekday) : [];
  const selLabel = sel.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
  const week = lang() === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const empty = !dayEvents.length && !dayTasks.length && !dayLectures.length;

  return (
    <main className="body calendar">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shiftMonth(-1)} aria-label={t("Vorheriger Monat")}>‹</button>
        <strong className="cal-month">{first.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</strong>
        <button className="cal-nav" onClick={() => shiftMonth(1)} aria-label={t("Nächster Monat")}>›</button>
        <span className="spacer" />
        {onImport && (
          <button className="tt-toggle" onClick={onImport} title={t("Termine aus einer .ics-Datei übernehmen")}>
            {t("Import")}
          </button>
        )}
        <button className="tt-toggle" onClick={goToday}>{t("Heute")}</button>
      </div>
      {importMsg && <p className="cal-note">{importMsg}</p>}

      <div className="cal-grid">
        {week.map(w => (
          <span key={w} className="cal-wd">{w}</span>
        ))}
        {Array.from({ length: cells }, (_, i) => cell(i))}
      </div>

      <section className="cal-day">
        <div className="cal-day-head">
          <strong>{selLabel}</strong>
          <span className="spacer" />
          <button className="m-add" onClick={() => openNew(selected)}>{t("+ Termin")}</button>
        </div>
        {empty && <p className="cal-empty">{t("Nichts eingetragen. Doppelklick auf einen Tag legt direkt einen Termin an.")}</p>}
        {dayEvents.map(e => (
          <button
            key={e.id}
            className={e.exam ? "cal-item exam" : "cal-item"}
            style={{ "--lec": e.exam ? EXAM : "var(--accent)" } as CSSProperties}
            onClick={() => openEdit(e)}
            title={t("Bearbeiten")}
          >
            <span className="cal-time">{e.start === undefined ? t("ganztägig") : `${hm(e.start)}–${hm(e.end ?? e.start + 60)}`}</span>
            <span className="cal-title">
              {e.exam && <b className="cal-badge">{t("Prüfung")}</b>}
              {e.title}
            </span>
            <span className="cal-sub">
              {[e.place, projectName(e.projectId), e.exam && daysUntil(e.date) >= 0 ? countdown(e.date) : null, e.remind !== undefined ? t("mit Erinnerung") : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        ))}
        {dayTasks.map(task => (
          <button key={task.id} className={daysUntil(task.due!) < 0 ? "cal-item cal-task cal-late" : "cal-item cal-task"} onClick={() => onOpenTask(task)} title={t("Zur Aufgabe")}>
            <span className="cal-time">{t("fällig")}</span>
            <span className="cal-title">{task.text}</span>
            <span className="cal-sub">
              {[projectName(task.projectId), task.repeat ? `↻ ${repeatLabel(task.repeat)}` : null].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {dayLectures.map(l => (
          <div key={l.id} className="cal-item lecture" style={{ "--lec": l.color } as CSSProperties}>
            <span className="cal-time">{hm(l.start)}–{hm(l.end)}</span>
            <span className="cal-title">{l.title}</span>
            <span className="cal-sub">{l.room}</span>
          </div>
        ))}
      </section>

      {draft && (
        <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setDraft(null)}>
          <form
            className="dialog"
            onSubmit={e => {
              e.preventDefault();
              save();
            }}
            onKeyDown={e => e.key === "Escape" && setDraft(null)}
          >
            <h2>{t(draft.id ? "Termin bearbeiten" : "Neuer Termin")}</h2>
            <label className="field">
              {t("Titel")}
              <input autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={t("z. B. Prüfung Mathe")} />
            </label>
            <div className="field-row">
              <label className="field">
                {t("Datum")}
                <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
              </label>
              <label className="field">
                {t("Ort")}
                <input value={draft.place} onChange={e => setDraft({ ...draft, place: e.target.value })} placeholder={t("optional")} />
              </label>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={draft.allDay} onChange={e => setDraft({ ...draft, allDay: e.target.checked })} />
              {t("Ganztägig")}
            </label>
            {!draft.allDay && (
              <div className="field-row">
                <label className="field">
                  {t("Beginn")}
                  <input type="time" value={draft.start} onChange={e => setDraft({ ...draft, start: e.target.value })} />
                </label>
                <label className="field">
                  {t("Ende")}
                  <input type="time" value={draft.end} onChange={e => setDraft({ ...draft, end: e.target.value })} />
                </label>
              </div>
            )}
            {!timeOk && <p className="field-error">{t("Das Ende muss nach dem Beginn liegen.")}</p>}
            <label className="check-row">
              <input type="checkbox" checked={draft.exam} onChange={e => setDraft({ ...draft, exam: e.target.checked })} />
              {t("Prüfung (erscheint im Countdown)")}
            </label>
            <div className="field-row">
              <label className="field">
                {t("Projekt")}
                <select value={draft.projectId} onChange={e => setDraft({ ...draft, projectId: e.target.value })}>
                  <option value="">{t("Keins")}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                {t("Erinnerung")}
                <select value={draft.remind} onChange={e => setDraft({ ...draft, remind: e.target.value })}>
                  {REMIND_OPTIONS.map(o => (
                    <option key={o.label} value={o.value === undefined ? "" : String(o.value)}>{t(o.label)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="actions">
              {draft.id && (
                <button type="button" className={confirmDel ? "btn danger sure" : "btn danger"} onClick={() => (confirmDel ? remove() : setConfirmDel(true))}>
                  {t(confirmDel ? "Wirklich löschen?" : "Löschen")}
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setDraft(null)}>{t("Abbrechen")}</button>
              <button type="submit" className="btn primary" disabled={!valid}>{t(draft.id ? "Speichern" : "Anlegen")}</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
