import { useMemo, useState } from "react";
import type { Data } from "./data";
import { formatDue, repeatLabel } from "./dates";
import { t } from "./i18n";
import { countDups, findProject, normText, parseList, plan } from "./markdownList";
import type { ListItem, PlanGroup, Target } from "./markdownList";

// Liste einfügen: Text (aus der Zwischenablage oder einer Datei) prüfen, Projekte zuordnen, dann übernehmen

type Props = {
  data: Data;
  text: string; // leer: erst ein Feld zum Einfügen zeigen
  file?: string; // Dateiname bei Drag & Drop
  onApply: (plan: PlanGroup[], skipDups: boolean) => void;
  onClose: () => void;
};

const EXAMPLE = "# Einkauf\n- [ ] Milch morgen\n- [ ] Brot !\n\n# Mathe\n- [ ] Blatt 3 bis Freitag !!\n  - [ ] Aufgabe 1\n  - [x] Aufgabe 2";

export default function ListImport({ data, text: initial, file, onApply, onClose }: Props) {
  const [text, setText] = useState(initial);
  const [editing, setEditing] = useState(!initial.trim());
  const [choice, setChoice] = useState<Record<string, string>>({}); // Überschrift -> "new" | "skip" | Projekt-id
  const [addDups, setAddDups] = useState(false);

  const parsed = useMemo(() => parseList(text), [text]);
  const projectIds = new Set(data.projects.map(p => p.id));
  const keyOf = (heading: string | null) => (heading === null ? "" : normText(heading));
  const newName = (heading: string | null) => heading ?? t("Importierte Liste");
  // Vorschlag: gleichnamiges Projekt, ohne Überschrift das aktuelle; sonst neu anlegen
  const suggest = (heading: string | null) =>
    heading === null ? (projectIds.has(data.activeProject) ? data.activeProject : "new") : findProject(data.projects, heading)?.id ?? "new";
  const targets: Target[] = parsed.groups.map(g => {
    const c = choice[keyOf(g.heading)];
    const v = c && (c === "new" || c === "skip" || projectIds.has(c)) ? c : suggest(g.heading);
    return v === "new" ? { kind: "new", name: newName(g.heading) } : v === "skip" ? { kind: "skip" } : { kind: "project", id: v };
  });
  const pl = useMemo(() => plan(parsed.groups, targets, data.tasks), [parsed, JSON.stringify(targets), data.tasks]);
  const dups = countDups(pl);
  const used = pl.filter(g => g.target.kind !== "skip");
  const total = used.reduce((n, g) => n + g.entries.reduce((m, e) => m + 1 + e.subs.length, 0), 0);
  const adding = addDups ? total : total - dups;
  const created = new Set(used.flatMap(g => (g.target.kind === "new" ? [normText(g.target.name)] : []))).size;

  const valueOf = (target: Target) => (target.kind === "project" ? target.id : target.kind);
  const hidden = (dup: unknown) => !!dup && !addDups;

  const row = (it: ListItem, dup: unknown, sub: boolean, key: string) => (
    <li key={key} className={["imp-item", sub && "sub", it.done && "done", hidden(dup) && "dup"].filter(Boolean).join(" ")}>
      <span className="imp-mark">{it.done ? "✓" : "○"}</span>
      <span className="imp-text">{it.text}</span>
      {it.prio && <span className="imp-prio">{"!".repeat(it.prio)}</span>}
      {it.due && <span className="due">{formatDue(it.due)}</span>}
      {it.repeat && <span className="repeat">↻ {repeatLabel(it.repeat)}</span>}
      {hidden(dup) && <span className="imp-tag">{t("schon da")}</span>}
    </li>
  );

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog imp" role="dialog" aria-label={t("Liste einfügen")} onKeyDown={e => e.key === "Escape" && onClose()}>
        <h2>{t("Liste einfügen")}</h2>
        {editing ? (
          <>
            <p className="imp-hint">
              {t("Füge eine Aufgabenliste ein (Strg+V). „# Name“ wird zum Projekt, „- [ ] Text“ zur Aufgabe, eingerückt zur Unteraufgabe, „- [x]“ gilt als erledigt.")}
            </p>
            <textarea
              className="imp-input"
              autoFocus
              value={text}
              spellCheck={false}
              placeholder={t(EXAMPLE)}
              onChange={e => setText(e.target.value)}
              onPaste={e => {
                // Eingefügte Liste: gleich zur Vorschau
                const s = e.clipboardData.getData("text");
                if (!text.trim() && parseList(s).count) {
                  e.preventDefault();
                  setText(s);
                  setEditing(false);
                }
              }}
            />
          </>
        ) : (
          <>
            {file && <div className="imp-file">{file}</div>}
            {!parsed.count && <p className="imp-hint">{t("In diesem Text wurden keine Aufgaben gefunden.")}</p>}
            {pl.map(g => (
              <section key={keyOf(g.group.heading)} className={g.target.kind === "skip" ? "imp-group off" : "imp-group"}>
                <div className="imp-head">
                  <span className="imp-from" title={g.group.heading ?? undefined}>{g.group.heading ?? t("Ohne Überschrift")}</span>
                  <span className="imp-arrow" aria-hidden>→</span>
                  <select
                    className="d-select"
                    value={valueOf(g.target)}
                    onChange={e => setChoice(c => ({ ...c, [keyOf(g.group.heading)]: e.target.value }))}
                    aria-label={t("Ziel für {name}", { name: g.group.heading ?? t("Ohne Überschrift") })}
                  >
                    <option value="new">{g.group.heading === null ? t("Neues Projekt „{name}“", { name: newName(null) }) : t("Als neues Projekt")}</option>
                    {data.folders.map(f => (
                      <optgroup key={f.id} label={f.name}>
                        {data.projects
                          .filter(p => p.folderId === f.id)
                          .map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                      </optgroup>
                    ))}
                    <option value="skip">{t("Nicht übernehmen")}</option>
                  </select>
                </div>
                {g.target.kind !== "skip" && (
                  <ul className="imp-list">
                    {g.entries.flatMap((e, i) => [row(e.item, e.dup, false, `${i}`), ...e.subs.map((s, j) => row(s.item, s.dup, true, `${i}.${j}`))])}
                  </ul>
                )}
              </section>
            ))}
            {dups > 0 && (
              <div className="imp-dups">
                <strong>{t(dups === 1 ? "1 Aufgabe gibt es schon." : "{n} Aufgaben gibt es schon.", { n: dups })}</strong>
                <label className="check-row">
                  <input type="radio" name="imp-dups" checked={!addDups} onChange={() => setAddDups(false)} />
                  <span>{t("Überspringen, nur Neues übernehmen")}</span>
                </label>
                <label className="check-row">
                  <input type="radio" name="imp-dups" checked={addDups} onChange={() => setAddDups(true)} />
                  <span>{t("Trotzdem noch einmal anlegen")}</span>
                </label>
              </div>
            )}
            {parsed.skipped > 0 && (
              <p className="imp-hint">{t(parsed.skipped === 1 ? "1 Textzeile ohne Aufgabe wird übersprungen." : "{n} Textzeilen ohne Aufgabe werden übersprungen.", { n: parsed.skipped })}</p>
            )}
          </>
        )}
        <div className="actions">
          {!editing && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>{t("Text ändern")}</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>{t("Abbrechen")}</button>
          {editing ? (
            <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => setEditing(false)}>{t("Vorschau")}</button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!adding}
              onClick={() => onApply(pl, !addDups)}
              title={created ? t(created === 1 ? "Legt 1 neues Projekt an" : "Legt {n} neue Projekte an", { n: created }) : undefined}
            >
              {!adding ? t("Nichts Neues") : t(adding === 1 ? "1 Aufgabe übernehmen" : "{n} Aufgaben übernehmen", { n: adding })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
