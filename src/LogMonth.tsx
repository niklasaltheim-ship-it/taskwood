import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Task } from "./data";
import { iso } from "./dates";
import { dayCount, logDays } from "./logbook";
import { lang, locale, t } from "./i18n";

// Monatsansicht eines Logbuchs: Punkt je Tag (Größe nach Anzahl), darunter die Aufgaben des gewählten Tages

type Props = {
  tasks: Task[]; // alle Aufgaben
  projectId?: string; // nur dieses Projekt (sonst das gemeinsame Logbuch)
  projectName?: (id: string) => string | undefined; // Projekt klein am Eintrag anzeigen
  color: string;
  focus?: string | null; // Tag, der beim Öffnen gewählt sein soll
  onOpenTask?: (task: Task) => void;
};

const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const time = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

export default function LogMonth({ tasks, projectId, projectName, color, focus, onOpenTask }: Props) {
  const todayIso = iso(new Date());
  const [selected, setSelected] = useState(focus ?? todayIso);
  const [month, setMonth] = useState(() => {
    const d = fromIso(focus ?? todayIso);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  useEffect(() => {
    if (!focus) return;
    setSelected(focus);
    const d = fromIso(focus);
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [focus]);

  const days = logDays(tasks, projectId);
  const max = Math.max(1, ...[...days.values()].map(dayCount));
  const offset = (month.getDay() + 6) % 7;
  const len = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((offset + len) / 7) * 7;
  const week = lang() === "de" ? ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const goToday = () => {
    setSelected(todayIso);
    const d = new Date();
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const day = days.get(selected);
  const created = day?.created ?? [];
  const done = day?.done ?? [];
  const label = fromIso(selected).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });

  const row = (task: Task, kind: "created" | "done") => (
    <button key={kind + task.id} className={task.doneAt ? "log-entry done" : "log-entry"} onClick={() => onOpenTask?.(task)} disabled={!onOpenTask}>
      <span className="log-mark">{task.doneAt ? "✓" : "○"}</span>
      <span className="log-text">
        {task.text}
        {projectName?.(task.projectId) && <small className="log-project">{projectName(task.projectId)}</small>}
      </span>
      <span className="log-when">
        {kind === "done" ? time(task.doneAt!) : task.doneAt ? t("erledigt {date}", { date: fromIso(iso(new Date(task.doneAt))).toLocaleDateString(locale(), { day: "numeric", month: "short" }) }) : t("offen")}
      </span>
    </button>
  );

  return (
    <div className="log-month" style={{ "--log": color } as CSSProperties}>
      {!projectId && <strong className="log-title">{t("Logbuch")}</strong>}
      <div className="cal-head">
        <button className="cal-nav" onClick={() => shift(-1)} aria-label={t("Vorheriger Monat")}>‹</button>
        <strong className="cal-month">{month.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</strong>
        <button className="cal-nav" onClick={() => shift(1)} aria-label={t("Nächster Monat")}>›</button>
        <span className="spacer" />
        <button className="tt-toggle" onClick={goToday}>{t("Heute")}</button>
      </div>
      <div className="cal-grid">
        {week.map(w => (
          <span key={w} className="cal-wd">{w}</span>
        ))}
        {Array.from({ length: cells }, (_, i) => {
          const d = new Date(month.getFullYear(), month.getMonth(), i - offset + 1);
          const date = iso(d);
          const n = dayCount(days.get(date));
          const cls = ["cal-cell", d.getMonth() !== month.getMonth() && "out", date === todayIso && "today", date === selected && "on"].filter(Boolean).join(" ");
          // Punktgröße und Deckkraft nach Anzahl
          const k = n / max;
          return (
            <button key={date} className={cls} onClick={() => setSelected(date)} title={n ? t(n === 1 ? "1 Eintrag" : "{n} Einträge", { n }) : undefined}>
              <span className="cal-num">{d.getDate()}</span>
              {n > 0 && <i className="log-dot" style={{ width: 5 + Math.round(k * 7), height: 5 + Math.round(k * 7), opacity: 0.45 + k * 0.55 }} />}
            </button>
          );
        })}
      </div>
      <section className="cal-day">
        <div className="cal-day-head">
          <strong>{label}</strong>
        </div>
        {!created.length && !done.length && <p className="cal-empty">{t("An diesem Tag gibt es keine Einträge.")}</p>}
        {created.length > 0 && (
          <>
            <h4 className="log-sub">{t("Angelegt")}</h4>
            {created.map(x => row(x, "created"))}
          </>
        )}
        {done.length > 0 && (
          <>
            <h4 className="log-sub">{t("Erledigt")}</h4>
            {done.map(x => row(x, "done"))}
          </>
        )}
      </section>
    </div>
  );
}
