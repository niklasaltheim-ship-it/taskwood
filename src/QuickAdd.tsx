import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import Pet from "./pet/Pet";
import { load } from "./data";
import type { Data } from "./data";
import { formatDueLong, parseTask } from "./dates";
import { setLang, t } from "./i18n";
import { loadSettings } from "./settings";
import { THEMES } from "./sprites";
import type { AnimalKind } from "./sprites";
import "./App.css";
import "./extras.css";

// Schnelleingabe: eigenes kleines Fenster, per Tastenkürzel aus jedem Programm geöffnet.
// Liest die Projekte aus dem gemeinsamen Speicher und schickt die neue Aufgabe ans Hauptfenster,
// das sie anlegt und speichert. "#Name" im Text wählt ein Projekt.

const win = getCurrentWindow();

const themeVars = (kind: AnimalKind) => {
  const th = THEMES[kind];
  return { "--head": th.head, "--head-text": th.headText, "--accent": th.accent, "--strong": th.strong, "--soft": th.soft } as CSSProperties;
};

// "#mathe" am Anfang oder Ende: passendes Projekt (Namensanfang, ohne Groß/klein)
function hashProject(text: string, data: Data) {
  const m = text.match(/(?:^|\s)#(\S+)/);
  if (!m) return null;
  const q = m[1].toLowerCase();
  const p = data.projects.find(p => p.name.toLowerCase().replace(/\s+/g, "").startsWith(q));
  return p ? { project: p, rest: (text.slice(0, m.index) + " " + text.slice(m.index! + m[0].length)).trim() } : null;
}

export default function QuickAdd() {
  const [data, setData] = useState<Data>(load);
  const [projectId, setProjectId] = useState(data.activeProject);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const refresh = () => {
    setLang(loadSettings().language);
    const d = load();
    setData(d);
    setProjectId(d.activeProject || d.projects[0]?.id || "");
    setText("");
    window.setTimeout(() => input.current?.focus(), 30);
  };

  useEffect(() => {
    const offOpen = listen("quick-open", refresh);
    // Klick woandershin: Fenster verschwindet wieder (nicht, solange die Projektauswahl offen ist)
    const offFocus = win.onFocusChanged(({ payload: focused }) => {
      if (!focused && document.activeElement?.tagName !== "SELECT") win.hide();
    });
    return () => {
      offOpen.then(f => f());
      offFocus.then(f => f());
    };
  }, []);

  const hash = hashProject(text, data);
  const project = hash?.project ?? data.projects.find(p => p.id === projectId) ?? data.projects[0];
  const body = hash ? hash.rest : text;
  const parsed = body.trim() ? parseTask(body) : null;

  const submit = async () => {
    if (!project || !body.trim()) return;
    await emitTo("main", "quick-add", { projectId: project.id, text: body.trim() });
    setText("");
    win.hide();
  };

  return (
    <div className="quick" style={themeVars(project?.animal ?? "beaver")} onMouseDown={e => e.target === e.currentTarget && win.hide()}>
      <div className="quick-card" onMouseDown={e => !(e.target as HTMLElement).closest("input, select") && (e.preventDefault(), win.startDragging())}>
        <div className="quick-row">
          {project && <Pet kind={project.animal} mood="relaxed" still crop="head" wear={project.wear && loadSettings().accessories ? { accessory: project.wear } : undefined} />}
          <input
            ref={input}
            className="quick-input"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") win.hide();
            }}
            placeholder={project ? t("Neue Aufgabe in {name}", { name: project.name }) : t("Erst ein Projekt anlegen")}
            disabled={!project}
          />
        </div>
        <div className="quick-foot">
          <select className="quick-project" value={project?.id ?? ""} onChange={e => {
              setProjectId(e.target.value);
              input.current?.focus();
            }} disabled={!!hash} aria-label={t("Projekt")}>
            {data.folders.map(f => (
              <optgroup key={f.id} label={f.name}>
                {data.projects
                  .filter(p => p.folderId === f.id)
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
          {parsed?.due && <span className="due">{formatDueLong(parsed.due)}</span>}
          <span className="spacer" />
          <span className="quick-help">{t("Enter speichert · Esc schließt")}</span>
        </div>
      </div>
    </div>
  );
}
