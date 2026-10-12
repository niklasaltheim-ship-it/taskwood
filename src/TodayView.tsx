import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import Pet from "./pet/Pet";
import type { Wear } from "./pet/wear";
import type { CalEvent, Project, Task } from "./data";
import { daysUntil, formatDue, iso, repeatLabel } from "./dates";
import { eventsOn } from "./events";
import { hm, lecturesOn } from "./schedule";
import type { Lecture } from "./schedule";
import { THEMES } from "./sprites";
import { locale, t } from "./i18n";

// Heute-Ansicht: alles Fällige (heute und überfällig) aus allen Projekten, dazu die Termine des Tages

type Props = {
  tasks: Task[];
  projects: Project[];
  events: CalEvent[];
  lectures: Lecture[];
  leaving: string[];
  wearFor: (p: Project) => Wear | undefined;
  onComplete: (task: Task, e: ReactMouseEvent<HTMLButtonElement>) => void;
  onOpen: (task: Task) => void;
  onOpenDay: (date: string) => void;
};

// Offene Aufgaben mit Fälligkeit heute oder früher; Überfälliges zuerst, dann nach Priorität
export const dueToday = (tasks: Task[]) =>
  tasks
    .filter(t => !t.doneAt && t.due && daysUntil(t.due) <= 0)
    .sort((a, b) => a.due!.localeCompare(b.due!) || (b.prio ?? 0) - (a.prio ?? 0) || a.order - b.order);

export default function TodayView({ tasks, projects, events, lectures, leaving, wearFor, onComplete, onOpen, onOpenDay }: Props) {
  const today = iso(new Date());
  const due = dueToday(tasks).filter(t => projects.some(p => p.id === t.projectId));
  const late = due.filter(t => daysUntil(t.due!) < 0);
  const now = due.filter(t => daysUntil(t.due!) === 0);
  const dayEvents = eventsOn(events, today);
  const weekday = new Date().getDay();
  const dayLectures = weekday >= 1 && weekday <= 5 ? lecturesOn(lectures, weekday) : [];
  const label = new Date().toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

  const row = (task: Task) => {
    const p = projects.find(pp => pp.id === task.projectId)!;
    const parent = task.parentId ? tasks.find(x => x.id === task.parentId) : undefined;
    const th = THEMES[p.animal];
    return (
      <li
        key={task.id}
        className={leaving.includes(task.id) ? "task today-task leaving" : "task today-task"}
        style={{ "--accent": th.accent, "--strong": th.strong } as CSSProperties}
      >
        <div className="row" data-prio={task.prio}>
          <button className="check" onClick={e => onComplete(task, e)} aria-label={t("Als erledigt markieren")}>
            <svg viewBox="0 0 16 16"><path d="M4 8.5l2.5 2.5L12 5.5" /></svg>
          </button>
          <button className="main today-main" onClick={() => onOpen(task)} title={t("Zur Aufgabe")}>
            <span className="text">
              {parent && <span className="parent">{parent.text} › </span>}
              {task.text}
            </span>
            <span className="meta">
              <span className="today-project">
                <Pet kind={p.animal} mood="relaxed" still crop="head" wear={wearFor(p)} />
                {p.name}
              </span>
              {daysUntil(task.due!) < 0 && <span className="due late">{formatDue(task.due!)}</span>}
              {task.repeat && <span className="repeat">↻ {repeatLabel(task.repeat)}</span>}
            </span>
          </button>
        </div>
      </li>
    );
  };

  return (
    <main className="body today">
      <div className="today-head">
        <strong>{label}</strong>
        <span className="spacer" />
        <span className="m-sub">{t(due.length === 1 ? "1 fällig" : "{n} fällig", { n: due.length })}</span>
      </div>

      {(dayEvents.length > 0 || dayLectures.length > 0) && (
        <section className="today-sec">
          <h3>{t("Termine")}</h3>
          {dayEvents.map(e => (
            <button key={e.id} className={e.exam ? "cal-item exam" : "cal-item"} onClick={() => onOpenDay(today)}>
              <span className="cal-time">{e.start === undefined ? t("ganztägig") : `${hm(e.start)}–${hm(e.end ?? e.start + 60)}`}</span>
              <span className="cal-title">{e.title}</span>
              {e.place && <span className="cal-sub">{e.place}</span>}
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
      )}

      {late.length > 0 && (
        <section className="today-sec">
          <h3 className="late-head">{t("Überfällig")}</h3>
          <ul className="list">{late.map(row)}</ul>
        </section>
      )}
      <section className="today-sec">
        <h3>{t("Heute fällig")}</h3>
        {now.length ? <ul className="list">{now.map(row)}</ul> : <p className="empty small">{t("Für heute ist nichts fällig. Schönen Tag!")}</p>}
      </section>
    </main>
  );
}
