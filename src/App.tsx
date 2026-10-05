import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ensureOnScreen, fitWindow, forgetHome, shrinkWindow } from "./windowSize";
import Pet from "./pet/Pet";
import { stashName } from "./pet/Pet";
import type { PetEvent } from "./pet/Pet";
import type { MoodState } from "./pet/types";
import PetLab from "./PetLab";
import Timetable from "./Timetable";
import { cliTask, exportWithDialog, importWithDialog, quitApp, readBackupFile, writeBackupFile } from "./backup";
import Calendar from "./Calendar";
import { activeAppointments, countdown, dueReminders, upcomingExams } from "./events";
import { currentOrNext, hm } from "./schedule";
import { ANIMALS, P, THEMES, animalName } from "./sprites";
import type { AnimalKind } from "./sprites";
import { createConfetti } from "./confetti";
import { load, save, uid } from "./data";
import type { Data, Folder, Prio, Project, Repeat, Task, Timer } from "./data";
import { daysUntil, formatDue, formatDueLong, iso, nextDue, parseTask, repeatLabel } from "./dates";
import { PRESETS, chime, clock, ensureNotifyPermission, notify, remaining, tiny, unlockAudio } from "./timer";
import { useDangle } from "./dangle";
import { locale, setLang, t } from "./i18n";
import type { LangSetting } from "./i18n";
import SettingsDialog from "./SettingsDialog";
import "./App.css";
import "./extras.css";

type Dialog = { mode: "new" } | { mode: "edit"; id: string };
type HistRow = { task: Task; subs: Task[]; parent?: string };
type Menu = null | "folders" | "projects";
type Undo = { ids: string[]; text: string; spawned: string[] }; // spawned: Folgeaufgaben wiederkehrender Aufgaben

const win = getCurrentWindow();
// Fenstergrößen (logische Pixel)
const SMALL = { w: 132, h: 150 }; // Tier; Platz für Sprünge und Sprechblasen
const cardSize = (large: boolean, wide: boolean) =>
  wide ? (large ? { w: 760, h: 760 } : { w: 640, h: 560 }) : large ? { w: 560, h: 760 } : { w: 340, h: 480 };
const DAY = 86400000;
const BORED_AFTER = 3 * DAY;
const BUBBLE_GAP = 3 * 60000; // von selbst: höchstens alle drei Minuten eine Sprechblase
const REACT_GAP = 15000; // als Antwort auf eigene Aktionen (abhaken, hinzufügen, Timer): alle 15 s
const BUBBLE_MS = 2800;
const REPLAY_MS = 8000; // so lange nach Feier/Sprechblase spielt das eingeklappte Tier sie noch einmal
const SETTINGS = "taskwood-settings";

// calm: Ruhemodus, die Tiere zeigen nur ein ruhiges Standbild ihrer Stimmung
// large: großes Aufgabenfenster; language: Standard Englisch, "auto" = Systemsprache
type Settings = { bubbles: boolean; calm: boolean; large: boolean; language: LangSetting };
const DEFAULT_SETTINGS: Settings = { bubbles: true, calm: false, large: false, language: "en" };
function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
const STASH_DAYS = 7;
const EXAM_DAYS = 21; // Countdown-Banner ab drei Wochen vorher
const isoToday = () => iso(new Date());
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const CLOSE_MS = 160;

// Namen werden beim Anzeigen übersetzt
const PRIOS: { p: Prio; name: string; color: string }[] = [
  { p: 1, name: "Niedrig", color: P.g2 },
  { p: 2, name: "Mittel", color: P.b4 },
  { p: 3, name: "Hoch", color: P.b2 },
];
const prioColor = (p?: Prio) => PRIOS.find(x => x.p === p)?.color;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));
const byOrder = (a: Task, b: Task) => a.order - b.order;

function dayLabel(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return t("Heute");
  if (diff === 1) return t("Gestern");
  return d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" });
}

const time = (ts: number) => new Date(ts).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

const themeVars = (kind: AnimalKind) => {
  const t = THEMES[kind];
  return { "--head": t.head, "--head-text": t.headText, "--accent": t.accent, "--strong": t.strong, "--soft": t.soft } as CSSProperties;
};

const Icon = ({ d, circle }: { d: string; circle?: boolean }) => (
  <svg viewBox="0 0 16 16">
    {circle && <circle cx="8" cy="8" r="6" />}
    <path d={d} />
  </svg>
);

const FOLDER_D = "M2 4.5h4l1.5 1.5H14v6.5H2z";
const TIMER_D = "M5 2h6M5 14h6M5.5 2c0 3.5 5 4 5 6s-5 2.5-5 6M10.5 2c0 3.5-5 4-5 6s5 2.5 5 6";

export default function App() {
  const [data, setData] = useState<Data>(load);
  const [collapsed, setCollapsed] = useState(true);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"list" | "history" | "plan">("list");
  const [planTab, setPlanTab] = useState<"month" | "timetable">("month");
  const [calFocus, setCalFocus] = useState<string | null>(null);
  const [week, setWeek] = useState(false);
  const [input, setInput] = useState("");
  const [leaving, setLeaving] = useState<string[]>([]);
  const [hop, setHop] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dlgName, setDlgName] = useState("");
  const [dlgAnimal, setDlgAnimal] = useState<AnimalKind>("beaver");
  const [dlgFolder, setDlgFolder] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subInput, setSubInput] = useState("");
  const [menu, setMenu] = useState<Menu>(null);
  const [folderEdit, setFolderEdit] = useState<{ id: string | null; name: string } | null>(null);
  const [folderDel, setFolderDel] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [now, setNow] = useState(Date.now);
  const [timerOpen, setTimerOpen] = useState(false);
  const [customMin, setCustomMin] = useState("");
  const [alarm, setAlarm] = useState<string | null>(null); // Projekt, dessen Timer abgelaufen ist
  const [held, setHeld] = useState(false);
  const [petEvent, setPetEvent] = useState<PetEvent | null>(null);
  const [bubble, setBubble] = useState<{ text: string; at: number } | null>(null);
  const [lab, setLab] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastBubble = useRef(0);
  // Zuletzt gezeigte Sprechblase und Tier-Ereignis, damit das kleine Tier sie nach dem Einklappen wiederholt
  const lastShown = useRef<{ text: string; at: number } | null>(null);
  const lastEvent = useRef<PetEvent | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;
  const undoTimer = useRef(0);

  const fx = useRef<ReturnType<typeof createConfetti> | null>(null);
  const confettiRef = useCallback((el: HTMLCanvasElement | null) => {
    fx.current?.stop();
    fx.current = el ? createConfetti(el) : null;
  }, []);

  const [settings, setSettings] = useState<Settings>(loadSettings);
  // Sprache vor dem Rendern setzen, damit alle t()-Aufrufe die richtige erwischen
  setLang(settings.language);
  const dangle = useDangle(setHeld, !settings.calm);

  useEffect(() => save(data), [data]);

  // Importierte Einstellungen: nur bekannte Schlüssel übernehmen
  const applySettings = (s: Record<string, unknown>) =>
    setSettings(cur => {
      const next = { ...cur };
      (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).forEach(k => {
        if (typeof s[k] === typeof DEFAULT_SETTINGS[k]) (next as Record<string, unknown>)[k] = s[k];
      });
      return next;
    });

  // Fenster nie unerreichbar außerhalb der Bildschirme: beim Start und nach jedem Verschieben prüfen
  useEffect(() => {
    ensureOnScreen();
    let settle = 0;
    const off = win.onMoved(() => {
      window.clearTimeout(settle);
      settle = window.setTimeout(ensureOnScreen, 600);
    });
    return () => {
      window.clearTimeout(settle);
      off.then(f => f());
    };
  }, []);

  // Startparameter --export <datei> / --import <datei> (Umzug und Tests ohne Klicks)
  const cliDone = useRef(false);
  useEffect(() => {
    if (cliDone.current) return;
    cliDone.current = true;
    cliTask().then(async task => {
      if (!task) return;
      const [kind, path] = task;
      try {
        if (kind === "export") {
          await writeBackupFile(path, dataRef.current, loadSettings());
          await quitApp();
        } else {
          const b = await readBackupFile(path);
          setData(b.data);
          applySettings(b.settings);
        }
      } catch (e) {
        console.error("Sicherung fehlgeschlagen", e);
        if (kind === "export") await quitApp();
      }
    });
  }, []);

  const doExport = async () => {
    try {
      const path = await exportWithDialog(data, settings);
      if (path) setBackupMsg(t("Gesichert."));
    } catch {
      setBackupMsg(t("Export fehlgeschlagen."));
    }
  };

  const doImport = async () => {
    setConfirmImport(false);
    try {
      const b = await importWithDialog();
      if (!b) return;
      setData(b.data);
      applySettings(b.settings);
      setBackupMsg(t("Daten übernommen."));
    } catch {
      setBackupMsg(t("Diese Datei ist keine gültige Sicherung."));
    }
  };

  const folder = data.folders.find(f => f.id === data.activeFolder) ?? data.folders[0];
  const project = data.projects.find(p => p.id === data.activeProject && p.folderId === folder.id) ?? null;
  const projectsIn = (folderId: string) => data.projects.filter(p => p.folderId === folderId);
  const openIn = (projectId: string) =>
    data.tasks.filter(t => t.projectId === projectId && !t.parentId && !t.doneAt).sort(byOrder);
  const subsOf = (id: string) => data.tasks.filter(t => t.parentId === id && !t.doneAt).sort(byOrder);
  const open = project ? openIn(project.id) : [];
  const count = open.length;
  const theme: AnimalKind = project?.animal ?? "beaver";

  // Vorrat: erledigte Aufgaben der letzten Tage
  const stashOf = (p: Project | null) => {
    if (!p) return 0;
    const since = Date.now() - STASH_DAYS * DAY;
    return data.tasks.filter(t => t.projectId === p.id && t.doneAt && t.doneAt > since).length;
  };

  const stashText = (p: Project) => {
    const s = stashName(p.animal, stashOf(p));
    return s && stashOf(p) > 0 ? "\n" + t("Vorrat diese Woche: {s}", { s }) : "";
  };

  // Termin, der gerade beginnt bzw. läuft und noch nicht mit OK bestätigt wurde
  const appt = activeAppointments(data.events, now)[0] ?? null;
  const apptFor = (p: Project | null) => !!appt && !!p && (!appt.projectId || appt.projectId === p.id);

  const moodOf = (p: Project | null): MoodState => {
    if (!p) return "sleep";
    if (alarm === p.id) return "alarm";
    if (apptFor(p)) return "event";
    if (timers[p.id]?.endsAt) return "focus";
    const top = openIn(p.id);
    const examSoon = upcomingExams(data.events, 3).some(e => e.projectId === p.id);
    if (!top.length) return examSoon ? "busy" : "sleep";
    const all = data.tasks.filter(t => t.projectId === p.id);
    const openAll = all.filter(t => !t.doneAt);
    if (top.length >= 8 || openAll.some(t => t.due && daysUntil(t.due) < 0)) return "stress";
    const lastDone = all.reduce((m, t) => Math.max(m, t.doneAt ?? 0), 0);
    const since = lastDone || Math.min(...openAll.map(t => t.createdAt));
    if (Date.now() - since > BORED_AFTER && !examSoon) return "bored";
    return top.length >= 4 || examSoon ? "busy" : "relaxed";
  };

  // ---------- Timer ----------

  const timers = data.timers;
  const timer: Timer | undefined = project ? timers[project.id] : undefined;

  useEffect(() => {
    const running = Object.values(timers).filter(t => t.endsAt);
    if (!running.length) return;
    // Sekundentakt nur, solange ein Timer läuft
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const next = Math.min(...running.map(t => t.endsAt!));
    const fire = window.setTimeout(() => {
      const d = dataRef.current;
      const firedAt = Date.now();
      const done = Object.entries(d.timers).filter(([, x]) => x.endsAt && x.endsAt <= firedAt + 50);
      if (!done.length) return;
      setData(cur => {
        const rest = { ...cur.timers };
        done.forEach(([id]) => delete rest[id]);
        return { ...cur, timers: rest };
      });
      setNow(Date.now());
      const [last] = done[done.length - 1];
      setAlarm(last);
      chime();
      say(t("Zeit ist um!"), true);
      done.forEach(([id, x]) => {
        const p = d.projects.find(pp => pp.id === id);
        const late = firedAt - x.endsAt! > 60000;
        const n = Math.round(x.duration / 60000);
        notify(
          t("Zeit um: {name}", { name: p?.name ?? t("Projekt") }),
          late ? t("Dein {n}-Minuten-Timer ist abgelaufen, während die App geschlossen war.", { n }) : t("Dein {n}-Minuten-Timer ist abgelaufen.", { n })
        );
      });
    }, Math.max(0, next - Date.now()));
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(fire);
    };
  }, [timers]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Kurze Sprechblase, abschaltbar. gap: Mindestabstand zur letzten (true = immer, z. B. Timer-Ende)
  const showBubble = (text: string) => {
    const at = Date.now();
    lastShown.current = { text, at };
    setBubble({ text, at });
    window.setTimeout(() => setBubble(b => (b?.at === at ? null : b)), BUBBLE_MS);
  };
  const say = (text: string, gap: number | boolean = BUBBLE_GAP) => {
    if (!settings.bubbles) return;
    const at = Date.now();
    const min = gap === true ? 0 : gap === false ? BUBBLE_GAP : gap;
    if (at - lastBubble.current < min) return;
    lastBubble.current = at;
    showBubble(text);
  };
  const petDo = (type: string) => {
    const ev = { type, at: Date.now() };
    lastEvent.current = ev;
    setPetEvent(ev);
  };

  const setTimer = (id: string, t: Timer | null) =>
    setData(d => {
      const rest = { ...d.timers };
      if (t) rest[id] = t;
      else delete rest[id];
      return { ...d, timers: rest };
    });

  const startTimer = (minutes: number) => {
    if (!project || !(minutes > 0)) return;
    unlockAudio();
    ensureNotifyPermission();
    const duration = Math.round(minutes * 60000);
    setNow(Date.now());
    setTimer(project.id, { duration, endsAt: Date.now() + duration });
    setCustomMin("");
    if (alarm === project.id) setAlarm(null);
    say(t(pick(["Fokus an!", "Du schaffst das!", "Ich bin ganz leise."])), REACT_GAP);
  };

  const pauseTimer = () => {
    if (!project || !timer?.endsAt) return;
    setTimer(project.id, { duration: timer.duration, left: remaining(timer, Date.now()) });
  };

  const resumeTimer = () => {
    if (!project || !timer || timer.endsAt) return;
    unlockAudio();
    setNow(Date.now());
    setTimer(project.id, { duration: timer.duration, endsAt: Date.now() + (timer.left ?? 0) });
  };

  // ---------- Verlauf ----------

  const done = project ? data.tasks.filter(t => t.projectId === project.id && t.doneAt) : [];
  const doneIds = new Set(done.map(t => t.id));
  const rows: HistRow[] = [];
  done.forEach(task => {
    if (!task.parentId) {
      rows.push({ task, subs: done.filter(s => s.parentId === task.id).sort((a, b) => a.doneAt! - b.doneAt!) });
    } else if (!doneIds.has(task.parentId)) {
      rows.push({ task, subs: [], parent: data.tasks.find(p => p.id === task.parentId)?.text ?? t("Gelöschte Aufgabe") });
    }
  });
  rows.sort((a, b) => b.task.doneAt! - a.task.doneAt!);
  const groups: [string, HistRow[]][] = [];
  rows.forEach(r => {
    const label = dayLabel(r.task.doneAt!);
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(r);
    else groups.push([label, [r]]);
  });

  // ---------- Fenster ----------

  const collapse = async () => {
    setMenu(null);
    setDialog(null);
    if (!reducedMotion()) {
      setClosing(true);
      await sleep(CLOSE_MS);
    }
    setCollapsed(true);
    setClosing(false);
    // Gerade gefeiert oder etwas gesagt: im kleinen Tier noch einmal von vorn, damit man es ganz sieht
    const t0 = Date.now();
    const ev = lastEvent.current;
    if (ev && t0 - ev.at < REPLAY_MS && ["done", "allDone", "added"].includes(ev.type)) petDo(ev.type);
    const b = lastShown.current;
    if (settings.bubbles && b && t0 - b.at < REPLAY_MS) showBubble(b.text);
    await shrinkWindow(SMALL.w, SMALL.h);
  };

  const expand = async () => {
    if (alarm) {
      // zum Projekt springen, dessen Timer abgelaufen ist
      const p = data.projects.find(pp => pp.id === alarm);
      if (p) selectProject(p);
      setAlarm(null);
    }
    const size = cardSize(settings.large, view === "plan" && planTab === "timetable" && week);
    await fitWindow(size.w, size.h);
    setCollapsed(false);
    petDo("wave");
    if (Math.random() < 0.3) say(t(pick(["Hallo!", "Da bin ich!", "Los geht's!", "Schön, dich zu sehen!", "Was steht an?"])));
  };

  const wide = !collapsed && view === "plan" && planTab === "timetable" && week;
  useEffect(() => {
    if (collapsed) return;
    const size = cardSize(settings.large, wide);
    fitWindow(size.w, size.h);
  }, [wide, settings.large]);

  // Stundenplan: passendes Projekt zu einer Vorlesung (gleicher Name, oder einer enthält den anderen)
  const projectForLecture = (title: string) => {
    const t = title.toLowerCase();
    return (
      data.projects.find(p => p.name.toLowerCase() === t) ??
      data.projects.find(p => p.name.toLowerCase().includes(t) || t.includes(p.name.toLowerCase()))
    );
  };

  // Kopfzeile: ziehen, aber Buttons und Eingabefelder ausnehmen
  const dragHeader = (e: ReactMouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return;
    forgetHome();
    win.startDragging();
  };

  // Tier: kurzer Klick öffnet, Ziehen verschiebt
  const onPetDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const sx = e.screenX;
    const sy = e.screenY;
    const move = (ev: MouseEvent) => {
      if (Math.abs(ev.screenX - sx) + Math.abs(ev.screenY - sy) > 4) {
        cleanup();
        win.startDragging();
      }
    };
    const up = () => {
      cleanup();
      expand();
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ---------- Aufgaben ----------

  const nextOrder = () => data.tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1;
  const parsed = input.trim() ? parseTask(input) : null;

  const addTask = () => {
    if (!project || !parsed) return;
    const { text, due, prio, repeat } = parsed;
    const order = nextOrder();
    setData(d => ({ ...d, tasks: [...d.tasks, { id: uid(), projectId: project.id, text, createdAt: Date.now(), order, due, prio, repeat }] }));
    setInput("");
    petDo("added");
    if (Math.random() < 0.5) say(t(pick(["Oh, was Neues!", "Notiert!", "Machen wir!", "Kommt auf die Liste!", "Klingt gut!"])), REACT_GAP);
  };

  const addSub = (parent: Task) => {
    if (!subInput.trim()) return;
    const { text, due, prio, repeat } = parseTask(subInput);
    const order = nextOrder();
    setData(d => ({
      ...d,
      tasks: [...d.tasks, { id: uid(), projectId: parent.projectId, text, createdAt: Date.now(), order, parentId: parent.id, due, prio, repeat }],
    }));
    setSubInput("");
  };

  const openSub = (id: string) => {
    setSubFor(id);
    setSubInput("");
  };

  const patch = (id: string, p: Partial<Task>) =>
    setData(d => ({ ...d, tasks: d.tasks.map(t => (t.id === id ? { ...t, ...p } : t)) }));

  const complete = (task: Task, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (leaving.includes(task.id)) return;
    fx.current?.burst(e.currentTarget, !!task.parentId);
    setLeaving(l => [...l, task.id]);
    setHop(true);
    window.setTimeout(() => setHop(false), 450);
    // Hauptaufgabe erledigt: offene Unteraufgaben gelten ebenfalls als erledigt
    const ids = [task.id, ...data.tasks.filter(t => t.parentId === task.id && !t.doneAt).map(t => t.id)];
    // Tier freut sich mit; letzte offene Aufgabe = große Feier, danach schläft es zufrieden ein
    const left = task.parentId ? open.length : open.length - 1;
    petDo(left === 0 ? "allDone" : "done");
    if (left === 0) say(t(pick(["Geschafft!", "Alles erledigt!", "Feierabend!"])), true);
    else if (left === 1) say(t("Nur noch eine!"), REACT_GAP);
    else if (left <= 3) say(t("Noch {n}!", { n: left }), REACT_GAP);
    else say(t(pick(["Super!", "Weiter so!", "Eins weniger!", "Stark!", "Gut gemacht!", "Abgehakt!", "Läuft bei dir!"])), REACT_GAP);
    // Wiederkehrend: Kopie mit nächstem Datum (offene Unteraufgaben kommen mit)
    const spawned: Task[] = [];
    if (task.repeat && task.due) {
      const copyId = uid();
      const base = nextOrder();
      spawned.push({ ...task, id: copyId, due: nextDue(task.due, task.repeat), createdAt: Date.now(), doneAt: undefined });
      data.tasks
        .filter(t => t.parentId === task.id && !t.doneAt)
        .forEach((s, i) => spawned.push({ ...s, id: uid(), parentId: copyId, createdAt: Date.now(), order: base + i + 1 }));
    }
    window.setTimeout(() => {
      const at = Date.now();
      setData(d => ({ ...d, tasks: [...d.tasks.map(t => (ids.includes(t.id) ? { ...t, doneAt: at } : t)), ...spawned] }));
      setLeaving(l => l.filter(x => x !== task.id));
      if (subFor === task.id) setSubFor(null);
      if (detailsId === task.id) setDetailsId(null);
      window.clearTimeout(undoTimer.current);
      setUndo({ ids, text: task.text, spawned: spawned.map(t => t.id) });
      undoTimer.current = window.setTimeout(() => setUndo(null), 6000);
    }, 380);
  };

  const undoComplete = () => {
    if (!undo) return;
    setData(d => ({
      ...d,
      tasks: d.tasks.filter(t => !undo.spawned.includes(t.id)).map(t => (undo.ids.includes(t.id) ? { ...t, doneAt: undefined } : t)),
    }));
    window.clearTimeout(undoTimer.current);
    setUndo(null);
  };

  const remove = (id: string) => setData(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id && t.parentId !== id) }));

  const clearHistory = () => {
    if (!project) return;
    setData(d => ({ ...d, tasks: d.tasks.filter(t => !(t.projectId === project.id && t.doneAt)) }));
    setConfirmClear(false);
  };

  const startEdit = (t: Task) => {
    setEditId(t.id);
    setEditText(t.text);
  };

  const saveEdit = () => {
    if (!editId) return;
    const value = editText.trim();
    if (value) {
      const { text, due, prio, repeat } = parseTask(value);
      patch(editId, { text, ...(due && { due }), ...(prio && { prio }), ...(repeat && { repeat }) });
    }
    setEditId(null);
  };

  const toggleNote = (id: string) => setNotesOpen(n => (n.includes(id) ? n.filter(x => x !== id) : [...n, id]));

  // Reihenfolge per Ziehen: die Zeile wandert live an die Stelle unter dem Mauszeiger
  const moveTo = (task: Task, index: number) =>
    setData(d => {
      const sibs = d.tasks
        .filter(t => t.projectId === task.projectId && t.parentId === task.parentId && !t.doneAt && t.id !== task.id)
        .sort(byOrder);
      sibs.splice(index, 0, task);
      const orders = sibs.map(t => d.tasks.find(x => x.id === t.id)!.order).sort((a, b) => a - b);
      const map = new Map(sibs.map((t, i) => [t.id, orders[i]]));
      return { ...d, tasks: d.tasks.map(t => (map.has(t.id) ? { ...t, order: map.get(t.id)! } : t)) };
    });

  const onRowPointerDown = (e: ReactPointerEvent<HTMLLIElement>, task: Task) => {
    if (e.button !== 0 || editId === task.id) return;
    if ((e.target as HTMLElement).closest("button, input, textarea, .details, .note")) return;
    e.stopPropagation();
    const li = e.currentTarget;
    const startY = e.clientY;
    let active = false;
    let lastIndex = -1;
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.abs(ev.clientY - startY) < 5) return;
        active = true;
        setDragId(task.id);
        window.getSelection()?.removeAllRanges();
      }
      const others = [...li.parentElement!.children].filter(
        (c): c is HTMLElement => c instanceof HTMLElement && !!c.dataset.id && c !== li
      );
      const index = others.filter(c => {
        const r = c.getBoundingClientRect();
        return r.top + r.height / 2 < ev.clientY;
      }).length;
      if (index !== lastIndex) {
        lastIndex = index;
        moveTo(task, index);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (active) setDragId(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---------- Ordner und Projekte ----------

  const selectProject = (p: Project) => {
    setData(d => ({
      ...d,
      activeFolder: p.folderId,
      activeProject: p.id,
      folders: d.folders.map(f => (f.id === p.folderId ? { ...f, last: p.id } : f)),
    }));
    setConfirmClear(false);
    setSubFor(null);
    setDetailsId(null);
    setEditId(null);
    setMenu(null);
  };

  const selectFolder = (f: Folder) => {
    setData(d => {
      const inF = d.projects.filter(p => p.folderId === f.id);
      const last = inF.find(p => p.id === f.last) ?? inF[0];
      return { ...d, activeFolder: f.id, activeProject: last?.id ?? "" };
    });
    setMenu(null);
    setSubFor(null);
    setDetailsId(null);
  };

  const saveFolder = () => {
    if (!folderEdit) return;
    const name = folderEdit.name.trim();
    if (folderEdit.id === null) {
      if (name) {
        const f: Folder = { id: uid(), name };
        setData(d => ({ ...d, folders: [...d.folders, f], activeFolder: f.id, activeProject: "" }));
        setMenu(null);
        openNew();
      }
    } else if (name) {
      const id = folderEdit.id;
      setData(d => ({ ...d, folders: d.folders.map(f => (f.id === id ? { ...f, name } : f)) }));
    }
    setFolderEdit(null);
  };

  const deleteFolder = (id: string) => {
    setData(d => {
      const folders = d.folders.filter(f => f.id !== id);
      const gone = new Set(d.projects.filter(p => p.folderId === id).map(p => p.id));
      const projects = d.projects.filter(p => !gone.has(p.id));
      const timers = Object.fromEntries(Object.entries(d.timers).filter(([pid]) => !gone.has(pid)));
      let { activeFolder, activeProject } = d;
      if (activeFolder === id) {
        activeFolder = folders[0].id;
        const f = folders[0];
        const inF = projects.filter(p => p.folderId === f.id);
        activeProject = (inF.find(p => p.id === f.last) ?? inF[0])?.id ?? "";
      }
      return { ...d, folders, projects, timers, activeFolder, activeProject, tasks: d.tasks.filter(t => !gone.has(t.projectId)) };
    });
    setFolderDel(null);
  };

  const openNew = () => {
    setDialog({ mode: "new" });
    setDlgName("");
    setDlgAnimal("beaver");
    setConfirmDel(false);
    setMenu(null);
  };

  const openEdit = (p: Project) => {
    setDialog({ mode: "edit", id: p.id });
    setDlgName(p.name);
    setDlgAnimal(p.animal);
    setDlgFolder(p.folderId);
    setConfirmDel(false);
    setMenu(null);
  };

  const saveDialog = () => {
    if (!dialog) return;
    const name = dlgName.trim();
    if (dialog.mode === "new") {
      const p: Project = { id: uid(), folderId: folder.id, name: name || t("Neues Projekt"), animal: dlgAnimal };
      setData(d => ({
        ...d,
        projects: [...d.projects, p],
        activeProject: p.id,
        folders: d.folders.map(f => (f.id === p.folderId ? { ...f, last: p.id } : f)),
      }));
    } else {
      const id = dialog.id;
      setData(d => {
        const projects = d.projects.map(p =>
          p.id === id ? { ...p, name: name || p.name, animal: dlgAnimal, folderId: dlgFolder || p.folderId } : p
        );
        // Projekt in anderen Ordner verschoben: dorthin mitgehen
        const moved = projects.find(p => p.id === id)!;
        return { ...d, projects, activeFolder: moved.folderId, activeProject: moved.id };
      });
    }
    setDialog(null);
  };

  const deleteProject = (id: string) => {
    setData(d => {
      const projects = d.projects.filter(p => p.id !== id);
      const timers = { ...d.timers };
      delete timers[id];
      const inF = projects.filter(p => p.folderId === d.activeFolder);
      return {
        ...d,
        projects,
        timers,
        tasks: d.tasks.filter(t => t.projectId !== id),
        activeProject: d.activeProject === id ? inF[0]?.id ?? "" : d.activeProject,
      };
    });
    setDialog(null);
  };

  // Menüs per Klick daneben oder Escape schließen
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".menu, .path")) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  useEffect(() => {
    setFolderEdit(null);
    setFolderDel(null);
    setConfirmImport(false);
    setBackupMsg(null);
  }, [menu]);

  // Stimmung ändert sich auch ohne Klick (Fälligkeiten, Langeweile): einmal pro Minute neu bewerten
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);

  // Erinnerungen: läuft mit dem Minutentakt (und beim Start), nach Neustart nichts doppelt
  useEffect(() => {
    const due = dueReminders(data.events);
    if (!due.length) return;
    const at = Date.now();
    setData(d => ({ ...d, events: d.events.map(e => (due.some(x => x.id === e.id) ? { ...e, notifiedAt: at } : e)) }));
    chime();
    due.forEach(e => {
      const when = e.start === undefined ? t(e.date === isoToday() ? "heute" : "morgen") : t("um {time}", { time: hm(e.start) });
      notify(e.exam ? t("Prüfung: {title}", { title: e.title }) : e.title, [when, e.place].filter(Boolean).join(" · "));
    });
    say(due[0].exam ? t("Prüfung bald!") : t("Gleich: {title}", { title: due[0].title }), true);
  }, [now]);

  const announced = useRef(new Set<string>());
  useEffect(() => {
    if (!appt || announced.current.has(appt.id)) return;
    announced.current.add(appt.id);
    petDo("appointment");
    chime();
    // Bei "Erinnerung zur Startzeit" kam die Benachrichtigung schon
    if (appt.remind !== 0) notify(t("Jetzt: {title}", { title: appt.title }), [`${hm(appt.start!)}–${hm(appt.end ?? appt.start! + 60)}`, appt.place].filter(Boolean).join(" · "));
    say(t("Jetzt: {title}", { title: appt.title }), true);
  }, [appt?.id]);

  const ackAppt = () => {
    if (!appt) return;
    const at = Date.now();
    setData(d => ({ ...d, events: d.events.map(e => (e.id === appt.id ? { ...e, seenAt: at } : e)) }));
  };

  const curMood = moodOf(project);
  const prevMood = useRef(curMood);
  useEffect(() => {
    if (prevMood.current === curMood) return;
    if (curMood === "stress") say(t(pick(["Puh, ganz schön viel!", "Uff, viel los!", "Eins nach dem anderen."])));
    if (curMood === "bored") say(t(pick(["Wie wär's mit was Kleinem?", "Eine kurze Aufgabe?", "Ein kleiner Schritt?"])));
    prevMood.current = curMood;
  }, [curMood]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (collapsed) expand();
        setLab(l => !l);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---------- Ansicht: eingeklappt ----------

  if (collapsed) {
    const apptProject = appt?.projectId ? data.projects.find(p => p.id === appt.projectId) : undefined;
    const shown = (alarm && data.projects.find(p => p.id === alarm)) || apptProject || project;
    const shownCount = shown ? openIn(shown.id).length : 0;
    const tm = shown ? timers[shown.id] : undefined;
    const left = tm ? remaining(tm, now) : 0;
    const mood = moodOf(shown);
    const label = !shown
      ? t("{folder}: noch kein Projekt", { folder: folder.name })
      : apptFor(shown) && appt
        ? `${t("Jetzt: {title}", { title: appt.title })}, ${hm(appt.start!)}–${hm(appt.end ?? appt.start! + 60)}${appt.place ? `, ${appt.place}` : ""}`
        : alarm === shown.id
        ? t("{name}: Zeit um!", { name: shown.name })
        : `${shown.name}: ${shownCount ? t("{n} offen", { n: shownCount }) : t("alles erledigt")}${tm ? `, ${t("Timer")} ${clock(left)}${tm.endsAt ? "" : t(" (Pause)")}` : ""}${stashText(shown)}`;
    const lec = currentOrNext(data.lectures);
    const exam = upcomingExams(data.events, EXAM_DAYS)[0];
    const lecText = lec ? `
${t(lec.now ? "Jetzt" : "Als Nächstes")}: ${lec.lecture.title}, ${lec.lecture.room}, ${hm(lec.lecture.start)}–${hm(lec.lecture.end)}` : "";
    return (
      <div
        className="mini"
        style={themeVars(shown?.animal ?? "beaver")}
        onMouseDown={onPetDown}
        title={label + lecText + (exam ? "\n" + t("Prüfung {title}: {cd}", { title: exam.title, cd: countdown(exam.date) }) : "")}
      >
        {bubble && <span className="bubble" key={bubble.at}>{bubble.text}</span>}
        <div className="pet" ref={n => void (dangle.current = n)}>
          <Pet kind={shown?.animal ?? "beaver"} mood={mood} stash={stashOf(shown)} scale={3} event={petEvent} held={held} reduced={settings.calm} interactive />
          {shownCount > 0 && <span className="badge big">{shownCount > 99 ? "99+" : shownCount}</span>}
          {tm && (
            <span className={tm.endsAt ? "ring" : "ring paused"}>
              <svg viewBox="0 0 26 26">
                <circle cx="13" cy="13" r="10.5" className="ring-bg" />
                <circle
                  cx="13"
                  cy="13"
                  r="10.5"
                  className="ring-fg"
                  pathLength={100}
                  strokeDasharray={`${(left / tm.duration) * 100} 100`}
                />
              </svg>
              <b>{tiny(left)}</b>
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---------- Ansicht: Aufgabenfenster ----------

  const renderTask = (task: Task, sub: boolean) => {
    const editing = editId === task.id;
    const n = task.due ? daysUntil(task.due) : 0;
    const noteShown = notesOpen.includes(task.id) && detailsId !== task.id;
    return (
      <>
        <div className="row" style={task.prio ? ({ "--prio": prioColor(task.prio) } as CSSProperties) : undefined} data-prio={task.prio}>
          <button className="check" onClick={e => complete(task, e)} aria-label={t("Als erledigt markieren")}>
            <svg viewBox="0 0 16 16"><path d="M4 8.5l2.5 2.5L12 5.5" /></svg>
          </button>
          <div className="main" onDoubleClick={e => !editing && !(e.target as HTMLElement).closest("button") && startEdit(task)} title={editing ? undefined : t("Doppelklick zum Bearbeiten, ziehen zum Sortieren")}>
            {editing ? (
              <input
                className="edit"
                autoFocus
                value={editText}
                onFocus={e => e.target.select()}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") saveEdit();
                  if (e.key === "Escape") setEditId(null);
                }}
                onBlur={saveEdit}
              />
            ) : (
              <span className="text">{task.text}</span>
            )}
            {!editing && (task.due || task.note) && (
              <span className="meta">
                {task.due && (
                  <span className={n < 0 ? "due late" : n === 0 ? "due today" : "due"} title={t(n < 0 ? "Überfällig seit " : "Fällig: ") + formatDueLong(task.due)}>
                    {formatDue(task.due)}
                  </span>
                )}
                {task.repeat && <span className="repeat" title={t("Wiederholt sich {r}", { r: repeatLabel(task.repeat) })}>↻ {repeatLabel(task.repeat)}</span>}
                {task.note && (
                  <button className={noteShown ? "note-toggle on" : "note-toggle"} onClick={() => toggleNote(task.id)}>
                    {t("Notiz")}
                  </button>
                )}
              </span>
            )}
          </div>
          {!sub && (
            <button className="add-sub" onClick={() => openSub(task.id)} title={t("Unteraufgabe hinzufügen")} aria-label={t("Unteraufgabe hinzufügen")}>+</button>
          )}
          <button
            className={detailsId === task.id ? "more on" : "more"}
            onClick={() => setDetailsId(id => (id === task.id ? null : task.id))}
            title={t("Datum, Priorität, Notiz")}
            aria-label="Details"
          >
            <svg viewBox="0 0 16 16"><circle cx="4" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12" cy="8" r="1" /></svg>
          </button>
          <button className="remove" onClick={() => remove(task.id)} title={t("Löschen ohne Erledigen")} aria-label={t("Aufgabe löschen")}>×</button>
        </div>
        {noteShown && task.note && <p className="note">{task.note}</p>}
        {detailsId === task.id && (
          <div className="details" onKeyDown={e => e.key === "Escape" && setDetailsId(null)}>
            <label className="d-row">
              <span>{t("Fällig")}</span>
              <input type="date" value={task.due ?? ""} onChange={e => patch(task.id, { due: e.target.value || undefined })} />
              {task.due && (
                <button className="d-clear" onClick={() => patch(task.id, { due: undefined })} title={t("Datum entfernen")}>×</button>
              )}
            </label>
            <label className="d-row">
              <span>{t("Wiederholen")}</span>
              <select
                className="d-select"
                value={task.repeat ?? ""}
                onChange={e => {
                  const repeat = (e.target.value || undefined) as Repeat | undefined;
                  // Wiederholung braucht ein Datum: ohne Datum ab heute
                  patch(task.id, { repeat, ...(repeat && !task.due && { due: isoToday() }) });
                }}
              >
                <option value="">{t("Nie")}</option>
                <option value="daily">{t("Täglich")}</option>
                <option value="weekly">{t("Wöchentlich")}</option>
                <option value="monthly">{t("Monatlich")}</option>
              </select>
            </label>
            <div className="d-row">
              <span>{t("Priorität")}</span>
              <div className="prios">
                <button className={!task.prio ? "prio-btn on" : "prio-btn"} onClick={() => patch(task.id, { prio: undefined })} title={t("Keine")}>–</button>
                {PRIOS.map(x => (
                  <button
                    key={x.p}
                    className={task.prio === x.p ? "prio-btn on" : "prio-btn"}
                    onClick={() => patch(task.id, { prio: x.p })}
                    title={t(x.name)}
                    aria-label={t("Priorität {name}", { name: t(x.name) })}
                  >
                    <i style={{ background: x.color }} />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="d-note"
              rows={2}
              placeholder={t("Notiz")}
              value={task.note ?? ""}
              onChange={e => patch(task.id, { note: e.target.value || undefined })}
            />
          </div>
        )}
      </>
    );
  };

  const editingProject = dialog?.mode === "edit" ? dialog.id : null;
  const exams = upcomingExams(data.events, EXAM_DAYS);
  const apptProjectBig = appt?.projectId ? data.projects.find(p => p.id === appt.projectId) : undefined;
  const left = timer ? remaining(timer, now) : 0;
  const cardClass = ["card", closing && "closing", dragId && "sorting"].filter(Boolean).join(" ");
  const alarmProject = alarm ? data.projects.find(p => p.id === alarm) : undefined;
  const hint = parsed && (parsed.due || parsed.prio) ? parsed : null;

  return (
    <div className={cardClass} style={themeVars(theme)}>
      <header className="bar" onMouseDown={dragHeader}>
        <span
          className={hop ? "bar-pet hop" : "bar-pet"}
          ref={n => void (dangle.current = n)}
        >
          <Pet kind={theme} mood={moodOf(project)} scale={1} event={petEvent} held={held} reduced={settings.calm} interactive />
          {count > 0 && <span className="badge">{count > 99 ? "99+" : count}</span>}
        </span>
        <span className="bar-title">{t(view === "list" ? "Aufgaben" : view === "history" ? "Verlauf" : planTab === "month" ? "Kalender" : "Stundenplan")}</span>
        {project && (
          <button
            className={timerOpen ? "icon on" + (timer ? " wide" : "") : "icon" + (timer ? " wide" : "")}
            onClick={() => setTimerOpen(o => !o)}
            title={t("Timer")}
            aria-label={t("Timer")}
          >
            <Icon d={TIMER_D} />
            {timer && <span className={timer.endsAt ? "bar-clock" : "bar-clock paused"}>{clock(left)}</span>}
          </button>
        )}
        <button
          className={view === "plan" ? "icon on" : "icon"}
          onClick={() => setView(v => (v === "plan" ? "list" : "plan"))}
          title={t(view === "plan" ? "Zurück zu den Aufgaben" : "Kalender und Stundenplan")}
          aria-label={t("Kalender und Stundenplan")}
        >
          <Icon d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5 9h2M9 9h2M5 11h2" />
        </button>
        <button
          className={view === "history" ? "icon on" : "icon"}
          onClick={() => setView(v => (v === "history" ? "list" : "history"))}
          title={t(view === "history" ? "Zurück zu den Aufgaben" : "Verlauf anzeigen")}
          aria-label={t("Verlauf")}
        >
          <Icon circle d="M8 4.5V8l2.5 1.5" />
        </button>
        <button
          className="icon"
          onClick={() => setSettings(st => ({ ...st, large: !st.large }))}
          title={t(settings.large ? "Fenster verkleinern" : "Fenster vergrößern")}
          aria-label={t(settings.large ? "Fenster verkleinern" : "Fenster vergrößern")}
        >
          <Icon d={settings.large ? "M13.5 2.5L9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M6.5 13V9.5H3" : "M9.5 6.5l4-4M10 2.5h3.5V6M6.5 9.5l-4 4M6 13.5H2.5V10"} />
        </button>
        <button className="icon" onClick={collapse} title={t("Einklappen")} aria-label={t("Einklappen")}>
          <Icon d="M4 8h8" />
        </button>
        <button className="icon" onClick={() => win.close()} title={t("Schließen")} aria-label={t("Schließen")}>
          <Icon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </button>
      </header>

      <nav className="path">
        <button className={menu === "folders" ? "crumb on" : "crumb"} onClick={() => setMenu(m => (m === "folders" ? null : "folders"))} title={t("Ordner wechseln")}>
          <span className="crumb-name">{folder.name}</span>
        </button>
        <span className="sep">›</span>
        <button
          className={menu === "projects" ? "crumb project on" : "crumb project"}
          onClick={() => setMenu(m => (m === "projects" ? null : "projects"))}
          onDoubleClick={() => project && openEdit(project)}
          title={t("Projekt wechseln (Doppelklick zum Bearbeiten)")}
        >
          {project && <Pet kind={project.animal} mood="relaxed" still crop="head" />}
          <span className="crumb-name">{project ? project.name : t("Kein Projekt")}</span>
          <svg className="caret" viewBox="0 0 16 16"><path d="M5 6.5l3 3 3-3" /></svg>
        </button>
        <span className="spacer" />
        <button className={menu === "folders" ? "icon-s on" : "icon-s"} onClick={() => setMenu(m => (m === "folders" ? null : "folders"))} title={t("Ordner wechseln")} aria-label={t("Ordner wechseln")}>
          <Icon d={FOLDER_D} />
        </button>
      {menu === "projects" && (
        <div className="menu">
          <div className="menu-head">{t("Projekte in {folder}", { folder: folder.name })}</div>
          <ul>
            {projectsIn(folder.id).map(p => {
              const c = openIn(p.id).length;
              return (
                <li key={p.id} className={p.id === project?.id ? "m-item on" : "m-item"} style={themeVars(p.animal)}>
                  <button className="m-main" onClick={() => selectProject(p)} onDoubleClick={() => openEdit(p)}>
                    <Pet kind={p.animal} mood="relaxed" still crop="head" />
                    <span className="m-name">{p.name}</span>
                    {timers[p.id] && <span className="m-timer" title={t("Timer läuft")}><Icon d={TIMER_D} /></span>}
                    {c > 0 && <span className="count">{c}</span>}
                  </button>
                  <button className="m-act" onClick={() => openEdit(p)} title={t("Bearbeiten")} aria-label={t("{name} bearbeiten", { name: p.name })}>
                    <Icon d="M10.5 3.5l2 2L6 12H4v-2z" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="m-add" onClick={openNew}>{t("+ Neues Projekt")}</button>
        </div>
      )}

      {menu === "folders" && (
        <div className="menu">
          <div className="menu-head">{t("Ordner")}</div>
          <ul>
            {data.folders.map(f => {
              const n = projectsIn(f.id).length;
              if (folderEdit?.id === f.id) {
                return (
                  <li key={f.id} className="m-item">
                    <input
                      className="m-input"
                      autoFocus
                      value={folderEdit.name}
                      onFocus={e => e.target.select()}
                      onChange={e => setFolderEdit({ id: f.id, name: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === "Enter") saveFolder();
                        if (e.key === "Escape") setFolderEdit(null);
                        e.stopPropagation();
                      }}
                      onBlur={saveFolder}
                    />
                  </li>
                );
              }
              if (folderDel === f.id) {
                return (
                  <li key={f.id} className="m-item confirm">
                    <span className="m-name">{t(n === 0 ? "„{name}“ löschen?" : n === 1 ? "„{name}“ mit 1 Projekt löschen?" : "„{name}“ mit {n} Projekten löschen?", { name: f.name, n })}</span>
                    <button className="btn danger sure" onClick={() => deleteFolder(f.id)}>{t("Löschen")}</button>
                    <button className="btn" onClick={() => setFolderDel(null)}>{t("Nein")}</button>
                  </li>
                );
              }
              return (
                <li key={f.id} className={f.id === folder.id ? "m-item on" : "m-item"}>
                  <button className="m-main" onClick={() => selectFolder(f)} onDoubleClick={() => setFolderEdit({ id: f.id, name: f.name })}>
                    <span className="m-folder"><Icon d={FOLDER_D} /></span>
                    <span className="m-name">{f.name}</span>
                    <span className="m-sub">{t(n === 1 ? "1 Projekt" : "{n} Projekte", { n })}</span>
                  </button>
                  <button className="m-act" onClick={() => setFolderEdit({ id: f.id, name: f.name })} title={t("Umbenennen")} aria-label={t("{name} umbenennen", { name: f.name })}>
                    <Icon d="M10.5 3.5l2 2L6 12H4v-2z" />
                  </button>
                  {data.folders.length > 1 && (
                    <button className="m-act del" onClick={() => setFolderDel(f.id)} title={t("Löschen")} aria-label={t("{name} löschen", { name: f.name })}>
                      <Icon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {folderEdit?.id === null ? (
            <input
              className="m-input new-folder"
              autoFocus
              value={folderEdit.name}
              placeholder={t("Name, z. B. Arbeit")}
              onChange={e => setFolderEdit({ id: null, name: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter") saveFolder();
                if (e.key === "Escape") setFolderEdit(null);
                e.stopPropagation();
              }}
              onBlur={() => setFolderEdit(null)}
            />
          ) : (
            <button className="m-add" onClick={() => setFolderEdit({ id: null, name: "" })}>{t("+ Neuer Ordner")}</button>
          )}
          <button
            className="m-add m-settings"
            onClick={() => {
              setMenu(null);
              setSettingsOpen(true);
            }}
          >
            {t("Einstellungen…")}
          </button>
        </div>
      )}
      </nav>

      {project && timerOpen && (
        <section className="timer">
          {timer ? (
            <>
              <div className="t-track">
                <div className="t-fill" style={{ width: `${(left / timer.duration) * 100}%` }} />
              </div>
              <span className={timer.endsAt ? "t-clock" : "t-clock paused"}>{clock(left)}</span>
              <span className="spacer" />
              {timer.endsAt ? (
                <button className="btn" onClick={pauseTimer}>{t("Pause")}</button>
              ) : (
                <button className="btn primary" onClick={resumeTimer}>{t("Weiter")}</button>
              )}
              <button className="btn" onClick={() => setTimer(project.id, null)}>{t("Abbrechen")}</button>
            </>
          ) : (
            <form
              className="t-start"
              onSubmit={e => {
                e.preventDefault();
                startTimer(parseFloat(customMin.replace(",", ".")));
              }}
            >
              {PRESETS.map(m => (
                <button type="button" key={m} className="chip" onClick={() => startTimer(m)}>{m}</button>
              ))}
              <input
                className="t-custom"
                inputMode="decimal"
                value={customMin}
                onChange={e => setCustomMin(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder={t("Min.")}
                aria-label={t("Eigene Dauer in Minuten")}
              />
              <button type="submit" className="btn primary" disabled={!(parseFloat(customMin.replace(",", ".")) > 0)}>{t("Start")}</button>
            </form>
          )}
        </section>
      )}

      {appt && (
        <div className="appt" style={themeVars((apptProjectBig ?? project)?.animal ?? theme)}>
          <Pet kind={(apptProjectBig ?? project)?.animal ?? theme} mood="event" scale={1} reduced={settings.calm} />
          <span className="appt-text">
            <b>{t("Jetzt: {title}", { title: appt.title })}</b>
            <span>
              {hm(appt.start!)}–{hm(appt.end ?? appt.start! + 60)}
              {appt.place ? ` · ${appt.place}` : ""}
            </span>
          </span>
          <button
            className="btn"
            onClick={() => {
              setCalFocus(appt.date);
              setPlanTab("month");
              setView("plan");
            }}
          >
            {t("Kalender")}
          </button>
          <button className="btn primary" onClick={ackAppt}>OK</button>
        </div>
      )}

      {alarmProject && (
        <div className="alarm" style={themeVars(alarmProject.animal)}>
          <Pet kind={alarmProject.animal} mood="alarm" scale={1} reduced={settings.calm} />
          <span className="alarm-text">{alarmProject.id !== project?.id ? t("Zeit um in {name}!", { name: alarmProject.name }) : t("Zeit um!")}</span>
          {alarmProject.id !== project?.id && (
            <button className="btn" onClick={() => { selectProject(alarmProject); setAlarm(null); }}>{t("Hin")}</button>
          )}
          <button className="btn primary" onClick={() => setAlarm(null)}>OK</button>
        </div>
      )}

      {view !== "plan" && exams.length > 0 && (
        <button
          className={daysUntil(exams[0].date) <= 3 ? "exam-banner soon" : "exam-banner"}
          onClick={() => {
            setCalFocus(exams[0].date);
            setPlanTab("month");
            setView("plan");
          }}
          title={t("Im Kalender zeigen")}
        >
          <svg viewBox="0 0 16 16"><path d="M3.5 2.5h7l2 2v9h-9zM5.5 6.5h5M5.5 9h5M5.5 11.5h3" /></svg>
          <span className="exam-text">
            {t("Prüfung {title} · {date}", { title: exams[0].title, date: formatDue(exams[0].date) })}
          </span>
          <b className="exam-count">{countdown(exams[0].date)}</b>
          {exams.length > 1 && <span className="exam-more">+{exams.length - 1}</span>}
        </button>
      )}

      {view === "plan" && (
        <div className="plan-tabs">
          <button className={planTab === "month" ? "on" : undefined} onClick={() => setPlanTab("month")}>{t("Monat")}</button>
          <button className={planTab === "timetable" ? "on" : undefined} onClick={() => setPlanTab("timetable")}>{t("Stundenplan")}</button>
        </div>
      )}

      {view === "plan" && planTab === "month" ? (
        <Calendar
          events={data.events}
          onEvents={events => setData(d => ({ ...d, events }))}
          tasks={data.tasks.filter(t => !t.doneAt && t.due)}
          projects={data.projects}
          lectures={data.lectures}
          focus={calFocus}
          onOpenTask={t => {
            const p = data.projects.find(pp => pp.id === t.projectId);
            if (p) selectProject(p);
            setView("list");
          }}
        />
      ) : view === "plan" ? (
        <Timetable
          lectures={data.lectures}
          onChange={lectures => setData(d => ({ ...d, lectures }))}
          week={week}
          onWeek={setWeek}
          projectFor={title => projectForLecture(title)?.name ?? null}
          onOpen={title => {
            const p = projectForLecture(title);
            if (!p) return;
            selectProject(p);
            setWeek(false);
            setView("list");
          }}
        />
      ) : !project ? (
        <main className="body">
          <p className="empty">{t("In „{folder}“ gibt es noch kein Projekt.", { folder: folder.name })}</p>
          <button className="btn primary center" onClick={openNew}>{t("Projekt anlegen")}</button>
        </main>
      ) : view === "list" ? (
        <main className="body">
          <input
            className="new"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addTask()}
            placeholder={t("Neue Aufgabe in {name}", { name: project.name })}
          />
          {hint && (
            <div className="hint">
              {hint.due && <span className="due">{formatDueLong(hint.due)}</span>}
              {hint.prio && (
                <span className="hint-prio">
                  <i style={{ background: prioColor(hint.prio) }} />
                  {t(PRIOS[hint.prio - 1].name)}
                </span>
              )}
            </div>
          )}
          {open.length === 0 ? (
            <p className="empty">{t("Nichts offen. Neue Aufgabe oben eintippen und Enter drücken. Datum geht direkt mit, z. B. „morgen“ oder „Freitag“.")}</p>
          ) : (
            <ul className="list">
              {open.map(task => {
                const subs = subsOf(task.id);
                const cls = ["task", leaving.includes(task.id) && "leaving", dragId === task.id && "dragging", task.due && daysUntil(task.due) < 0 && "late"].filter(Boolean).join(" ");
                return (
                  <li key={task.id} data-id={task.id} className={cls} onPointerDown={e => onRowPointerDown(e, task)}>
                    {renderTask(task, false)}
                    {(subs.length > 0 || subFor === task.id) && (
                      <ul className="subs">
                        {subs.map(s => (
                          <li
                            key={s.id}
                            data-id={s.id}
                            className={["sub", leaving.includes(s.id) && "leaving", dragId === s.id && "dragging"].filter(Boolean).join(" ")}
                            onPointerDown={e => onRowPointerDown(e, s)}
                          >
                            {renderTask(s, true)}
                          </li>
                        ))}
                        {subFor === task.id && (
                          <li className="sub">
                            <input
                              className="sub-new"
                              autoFocus
                              value={subInput}
                              onChange={e => setSubInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") addSub(task);
                                if (e.key === "Escape") setSubFor(null);
                              }}
                              onBlur={() => setSubFor(null)}
                              placeholder={t("Unteraufgabe, Enter zum Hinzufügen")}
                            />
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      ) : (
        <main className="body history">
          {groups.length === 0 ? (
            <p className="empty">{t("Erledigte Aufgaben aus {name} erscheinen hier, sortiert nach Tag.", { name: project.name })}</p>
          ) : (
            <>
              {groups.map(([label, items]) => (
                <section key={label}>
                  <h3>{label}</h3>
                  <ul>
                    {items.map(({ task, subs, parent }) => (
                      <li key={task.id}>
                        <div className="entry">
                          <span className="time">{time(task.doneAt!)}</span>
                          <span className="text">
                            {parent && <span className="parent">{parent} › </span>}
                            {task.text}
                          </span>
                        </div>
                        {subs.length > 0 && (
                          <ul className="hist-subs">
                            {subs.map(s => (
                              <li key={s.id} className="entry">
                                <span className="text">{s.text}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              <button
                className={confirmClear ? "clear sure" : "clear"}
                onClick={() => (confirmClear ? clearHistory() : setConfirmClear(true))}
              >
                {t(confirmClear ? "Wirklich leeren?" : "Verlauf leeren")}
              </button>
            </>
          )}
        </main>
      )}

      {undo && (
        <div className="toast" role="status">
          <span className="toast-text">{t("„{text}“ erledigt", { text: undo.text })}</span>
          <button onClick={undoComplete}>{t("Rückgängig")}</button>
        </div>
      )}

      {dialog && (
        <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setDialog(null)}>
          <form
            className="dialog"
            style={themeVars(dlgAnimal)}
            onSubmit={e => {
              e.preventDefault();
              saveDialog();
            }}
            onKeyDown={e => e.key === "Escape" && setDialog(null)}
          >
            <h2>{dialog.mode === "new" ? t("Neues Projekt in {folder}", { folder: folder.name }) : t("Projekt bearbeiten")}</h2>
            <label className="field">
              {t("Name")}
              <input
                autoFocus
                value={dlgName}
                onFocus={e => e.target.select()}
                onChange={e => setDlgName(e.target.value)}
                placeholder={t("z. B. Mathe, Abschlussarbeit, Einkauf")}
              />
            </label>
            {editingProject && data.folders.length > 1 && (
              <label className="field">
                {t("Ordner|Feld")}
                <select value={dlgFolder} onChange={e => setDlgFolder(e.target.value)}>
                  {data.folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="field">
              {t("Tier")}
              <div className="pick">
                {ANIMALS.map(a => (
                  <button
                    type="button"
                    key={a.kind}
                    className={a.kind === dlgAnimal ? "pick-one on" : "pick-one"}
                    style={themeVars(a.kind)}
                    onClick={() => setDlgAnimal(a.kind)}
                    aria-pressed={a.kind === dlgAnimal}
                  >
                    <Pet kind={a.kind} mood="relaxed" still />
                    <span>{animalName(a.kind)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="actions">
              {editingProject && (
                <button
                  type="button"
                  className={confirmDel ? "btn danger sure" : "btn danger"}
                  onClick={() => (confirmDel ? deleteProject(editingProject) : setConfirmDel(true))}
                >
                  {t(confirmDel ? "Wirklich löschen?" : "Löschen")}
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn" onClick={() => setDialog(null)}>{t("Abbrechen")}</button>
              <button type="submit" className="btn primary">{t(dialog.mode === "new" ? "Anlegen" : "Speichern")}</button>
            </div>
          </form>
        </div>
      )}

      {bubble && <span className="bubble in-bar" key={bubble.at}>{bubble.text}</span>}
      {lab && <PetLab kind={theme} onClose={() => setLab(false)} />}
      {settingsOpen && (
        <SettingsDialog
          language={settings.language}
          calm={settings.calm}
          bubbles={settings.bubbles}
          onChange={patch => setSettings(st => ({ ...st, ...patch }))}
          onExport={doExport}
          onImport={doImport}
          confirmImport={confirmImport}
          onConfirmImport={() => setConfirmImport(true)}
          message={backupMsg}
          onClose={() => {
            setSettingsOpen(false);
            setConfirmImport(false);
            setBackupMsg(null);
          }}
        />
      )}

      <canvas ref={confettiRef} className="confetti" aria-hidden />
    </div>
  );
}
