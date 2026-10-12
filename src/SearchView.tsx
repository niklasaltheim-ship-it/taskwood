import { useState } from "react";
import Pet from "./pet/Pet";
import type { CalEvent, Data, Task } from "./data";
import { formatDue } from "./dates";
import { hm } from "./schedule";
import { locale, t } from "./i18n";

// Suche über alle Projekte: Aufgaben (offen und erledigt, auch Notizen) und Kalendertermine

const MAX = 60;
// Groß/klein und Akzente ignorieren ("Prufung" findet "Prüfung")
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Mark({ text, q }: { text: string; q: string }) {
  const i = fold(text).indexOf(q);
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

type Props = { data: Data; onOpenTask: (task: Task) => void; onOpenEvent: (e: CalEvent) => void };

export default function SearchView({ data, onOpenTask, onOpenEvent }: Props) {
  const [query, setQuery] = useState("");
  const q = fold(query.trim());
  const projectOf = (id: string) => data.projects.find(p => p.id === id);

  const hit = (...parts: (string | undefined)[]) => parts.some(p => p && fold(p).includes(q));
  const tasks = q
    ? data.tasks.filter(task => projectOf(task.projectId) && hit(task.text, task.note))
    : [];
  const open = tasks.filter(task => !task.doneAt).sort((a, b) => a.order - b.order);
  const done = tasks.filter(task => task.doneAt).sort((a, b) => b.doneAt! - a.doneAt!);
  const events = q ? data.events.filter(e => hit(e.title, e.place)).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const total = open.length + done.length + events.length;

  const taskRow = (task: Task) => {
    const p = projectOf(task.projectId)!;
    const noteHit = !fold(task.text).includes(q) && task.note;
    return (
      <li key={task.id}>
        <button className={task.doneAt ? "hit done" : "hit"} onClick={() => onOpenTask(task)}>
          <Pet kind={p.animal} mood="relaxed" still crop="head" />
          <span className="hit-main">
            <span className="hit-text"><Mark text={task.text} q={q} /></span>
            {noteHit && <span className="hit-note"><Mark text={task.note!} q={q} /></span>}
            <span className="hit-sub">
              {[p.name, task.doneAt ? t("erledigt {date}", { date: new Date(task.doneAt).toLocaleDateString(locale()) }) : task.due ? formatDue(task.due) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <main className="body search">
      <input
        className="new"
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => e.key === "Escape" && setQuery("")}
        placeholder={t("Aufgaben, Notizen und Termine durchsuchen")}
        aria-label={t("Suche")}
      />
      {!q ? (
        <p className="empty">{t("Sucht in allen Ordnern und Projekten.")}</p>
      ) : total === 0 ? (
        <p className="empty">{t("Nichts gefunden.")}</p>
      ) : (
        <>
          {open.length > 0 && (
            <section className="today-sec">
              <h3>{t("Offen")}</h3>
              <ul className="hits">{open.slice(0, MAX).map(taskRow)}</ul>
            </section>
          )}
          {events.length > 0 && (
            <section className="today-sec">
              <h3>{t("Termine")}</h3>
              <ul className="hits">
                {events.slice(0, MAX).map(e => (
                  <li key={e.id}>
                    <button className="hit" onClick={() => onOpenEvent(e)}>
                      <span className="hit-icon">
                        <svg viewBox="0 0 16 16"><path d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
                      </span>
                      <span className="hit-main">
                        <span className="hit-text"><Mark text={e.title} q={q} /></span>
                        <span className="hit-sub">
                          {[formatDue(e.date), e.start !== undefined ? hm(e.start) : null, e.place].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {done.length > 0 && (
            <section className="today-sec">
              <h3>{t("Erledigt")}</h3>
              <ul className="hits">{done.slice(0, MAX).map(taskRow)}</ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
