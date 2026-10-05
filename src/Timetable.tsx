import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DAY_END, DAY_START, dayNames, days, LECTURE_COLORS, LUNCH, hhmm, hm, lecturesOn, minuteOfDay, toMin, weekday } from "./schedule";
import type { Lecture } from "./schedule";
import { t } from "./i18n";

type Props = {
  lectures: Lecture[];
  onChange: (lectures: Lecture[]) => void;
  week: boolean;
  onWeek: (week: boolean) => void;
  projectFor: (title: string) => string | null; // Name des passenden Projekts
  onOpen: (title: string) => void;
};

type Draft = { id: string | null; day: number; start: string; end: string; title: string; room: string; color: string };

const PX_PER_MIN = 0.72;
const uid = () => Math.random().toString(36).slice(2, 10);

export default function Timetable({ lectures, onChange, week, onWeek, projectFor, onOpen }: Props) {
  const today = weekday();
  const [day, setDay] = useState(today ?? 1);
  const [now, setNow] = useState(minuteOfDay);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Markierung "jetzt" aktuell halten
  useEffect(() => {
    const t = window.setInterval(() => setNow(minuteOfDay()), 30000);
    return () => window.clearInterval(t);
  }, []);

  // ---------- Bearbeiten ----------

  const openEdit = (l: Lecture) => {
    setDraft({ id: l.id, day: l.day, start: hhmm(l.start), end: hhmm(l.end), title: l.title, room: l.room, color: l.color });
    setConfirmDel(false);
  };

  const openNew = (d: number) => {
    // Neue Vorlesung direkt nach der letzten des Tages vorschlagen
    const list = lecturesOn(lectures, d);
    const last = list[list.length - 1];
    const start = last ? Math.min(last.end + 15, 18 * 60) : 8 * 60;
    setDraft({ id: null, day: d, start: hhmm(start), end: hhmm(start + 90), title: "", room: "", color: LECTURE_COLORS[0] });
    setConfirmDel(false);
  };

  const start = draft?.start ? toMin(draft.start) : 0;
  const end = draft?.end ? toMin(draft.end) : 0;
  const valid = !!draft && draft.title.trim() !== "" && end > start;

  const save = () => {
    if (!draft || !valid) return;
    const l: Lecture = { id: draft.id ?? uid(), day: draft.day, start, end, title: draft.title.trim(), room: draft.room.trim(), color: draft.color };
    onChange(draft.id ? lectures.map(x => (x.id === draft.id ? l : x)) : [...lectures, l]);
    if (!week) setDay(l.day);
    setDraft(null);
  };

  const remove = () => {
    if (!draft?.id) return;
    onChange(lectures.filter(x => x.id !== draft.id));
    setDraft(null);
  };

  // ---------- Darstellung ----------

  const card = (l: Lecture, style?: CSSProperties) => {
    const isToday = l.day === today;
    const running = isToday && l.start <= now && now < l.end;
    const past = isToday && now >= l.end;
    const project = projectFor(l.title);
    const clickable = editing || !!project;
    return (
      <button
        key={l.id}
        className={["lec", running && "now", past && !editing && "past", clickable && "linked", editing && "editable"].filter(Boolean).join(" ")}
        style={{ "--lec": l.color, ...style } as CSSProperties}
        onClick={() => (editing ? openEdit(l) : project && onOpen(l.title))}
        title={editing ? t("Bearbeiten") : project ? t("Zu Projekt „{name}“ wechseln", { name: project }) : undefined}
        disabled={!clickable}
      >
        <span className="lec-title">{l.title}</span>
        <span className="lec-meta">
          {l.room ? `${l.room} · ` : ""}
          {hm(l.start)}–{hm(l.end)}
        </span>
        {running && !editing && <span className="lec-now">{t("jetzt")}</span>}
        {editing && (
          <svg className="lec-edit" viewBox="0 0 16 16"><path d="M10.5 3.5l2 2L6 12H4v-2z" /></svg>
        )}
      </button>
    );
  };

  const head = (
    <div className="tt-head">
      {!week &&
        days().map((d, i) => (
          <button key={d} className={["tt-day", day === i + 1 && "on", today === i + 1 && "today"].filter(Boolean).join(" ")} onClick={() => setDay(i + 1)}>
            {d}
          </button>
        ))}
      {week && <strong className="tt-label">{t("Woche")}</strong>}
      <span className="spacer" />
      <button className={editing ? "tt-toggle on" : "tt-toggle"} onClick={() => setEditing(e => !e)} title={t("Vorlesungen bearbeiten")}>
        {t(editing ? "Fertig" : "Bearbeiten")}
      </button>
      <button className="tt-toggle" onClick={() => onWeek(!week)}>{t(week ? "Tag" : "Woche")}</button>
    </div>
  );

  const dialog = draft && (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setDraft(null)}>
      <form
        className="dialog"
        onSubmit={e => {
          e.preventDefault();
          save();
        }}
        onKeyDown={e => e.key === "Escape" && setDraft(null)}
      >
        <h2>{t(draft.id ? "Vorlesung bearbeiten" : "Neue Vorlesung")}</h2>
        <label className="field">
          {t("Name")}
          <input autoFocus value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={t("z. B. Mathe")} />
        </label>
        <div className="field-row">
          <label className="field">
            {t("Raum")}
            <input value={draft.room} onChange={e => setDraft({ ...draft, room: e.target.value })} placeholder={t("z. B. Raum 101")} />
          </label>
          <label className="field">
            {t("Tag|Feld")}
            <select value={draft.day} onChange={e => setDraft({ ...draft, day: Number(e.target.value) })}>
              {dayNames().map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </label>
        </div>
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
        {draft.title.trim() !== "" && end <= start && <p className="field-error">{t("Das Ende muss nach dem Beginn liegen.")}</p>}
        <div className="field">
          {t("Farbe")}
          <div className="swatches">
            {LECTURE_COLORS.map(c => (
              <button
                type="button"
                key={c}
                className={draft.color === c ? "swatch on" : "swatch"}
                style={{ background: c }}
                onClick={() => setDraft({ ...draft, color: c })}
                aria-label={t("Farbe {c}", { c })}
                aria-pressed={draft.color === c}
              />
            ))}
          </div>
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
  );

  if (!week) {
    const list = lecturesOn(lectures, day);
    const rows: ReactNode[] = [];
    let lunchShown = false;
    list.forEach(l => {
      if (!lunchShown && l.start >= LUNCH.end) {
        rows.push(<div key="lunch" className="tt-lunch">{t("Mittagspause {from}–{to}", { from: hm(LUNCH.start), to: hm(LUNCH.end) })}</div>);
        lunchShown = true;
      }
      rows.push(card(l));
    });
    return (
      <main className="body timetable">
        {head}
        {today === null && day === 1 && !editing && <p className="tt-note">{t("Wochenende. Hier ist schon mal der Montag:")}</p>}
        {list.length ? <div className="tt-list">{rows}</div> : <p className="empty">{t("Keine Vorlesungen. Freier Tag!")}</p>}
        {editing && (
          <button className="m-add tt-add" onClick={() => openNew(day)}>{t("+ Vorlesung am {day}", { day: dayNames()[day - 1] })}</button>
        )}
        {dialog}
      </main>
    );
  }

  // Wochenraster: Zeitachse links, eine Spalte je Tag; wächst mit, wenn Vorlesungen früher oder später liegen
  const first = Math.min(DAY_START, ...lectures.map(l => Math.floor(l.start / 60) * 60));
  const last = Math.max(DAY_END, ...lectures.map(l => l.end));
  const height = (last - first) * PX_PER_MIN;
  const y = (min: number) => (min - first) * PX_PER_MIN;
  const hours = Array.from({ length: Math.floor((last - first) / 60) + 1 }, (_, i) => first + i * 60);
  return (
    <main className="body timetable week">
      {head}
      <div className="tt-grid">
        <div className="tt-days">
          <span />
          {days().map((d, i) => (
            <span key={d} className={today === i + 1 ? "today" : undefined}>
              {d}
              {editing && (
                <button className="tt-plus" onClick={() => openNew(i + 1)} title={t("Vorlesung am {day} hinzufügen", { day: dayNames()[i] })} aria-label={t("Vorlesung am {day} hinzufügen", { day: dayNames()[i] })}>+</button>
              )}
            </span>
          ))}
        </div>
        <div className="tt-cols" style={{ height }}>
          <div className="tt-axis">
            {hours.map(h => (
              <span key={h} style={{ top: y(h) }}>{hm(h)}</span>
            ))}
          </div>
          {days().map((d, i) => (
            <div key={d} className={today === i + 1 ? "tt-col today" : "tt-col"}>
              {hours.map(h => (
                <i key={h} className="tt-line" style={{ top: y(h) }} />
              ))}
              <div className="tt-lunchband" style={{ top: y(LUNCH.start), height: (LUNCH.end - LUNCH.start) * PX_PER_MIN }} />
              {lecturesOn(lectures, i + 1).map(l => card(l, { position: "absolute", top: y(l.start) + 1, height: (l.end - l.start) * PX_PER_MIN - 3 }))}
              {today === i + 1 && now >= first && now <= last && <i className="tt-nowline" style={{ top: y(now) }} />}
            </div>
          ))}
        </div>
      </div>
      {dialog}
    </main>
  );
}
