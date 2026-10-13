import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Window, getCurrentWindow } from "@tauri-apps/api/window";
import { listen, emitTo } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { ensureOnScreen, fitWindow, forgetHome, narrowAfterVisit, shrinkWindow, widenForVisit } from "./windowSize";
import { enable as enableAutostart } from "@tauri-apps/plugin-autostart";
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
import { parseIcs } from "./ics";
import TodayView, { dueToday } from "./TodayView";
import SearchView from "./SearchView";
import { ACCESSORIES, seasonOf, unlocked } from "./pet/wear";
import type { Accessory, Wear } from "./pet/wear";
import { ANIMALS, P, THEMES, animalName } from "./sprites";
import type { AnimalKind } from "./sprites";
import { createConfetti } from "./confetti";
import { load, save, uid } from "./data";
import type { Data, Folder, Prio, Project, Repeat, Task, Timer } from "./data";
import { daysUntil, formatDue, formatDueLong, iso, nextDue, parseTask, repeatLabel } from "./dates";
import { PRESETS, chime, clock, ensureNotifyPermission, notify, remaining, tiny, unlockAudio } from "./timer";
import { useDangle } from "./dangle";
import { locale, setLang, t } from "./i18n";
import { DEFAULT_SETTINGS, QUICK_KEY, SETTINGS, loadSettings } from "./settings";
import type { Settings } from "./settings";
import SettingsDialog from "./SettingsDialog";
import DamGame from "./game/DamGame";
import type { DemoMode } from "./game/DamGame";
import { addScore } from "./game/scores";
import SketchEditor from "./SketchEditor";
import LogMonth from "./LogMonth";
import { dayOf, logDots, projectColor, sinceLabel } from "./logbook";
import "./App.css";
import "./extras.css";

type Dialog = { mode: "new" } | { mode: "edit"; id: string };
type HistRow = { task: Task; subs: Task[]; parent?: string };
type Menu = null | "folders" | "projects" | "main";
type View = "list" | "history" | "plan" | "today" | "search" | "log";
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
const VISIT_FIRST = [30000, 60000]; // erster Besuch nach dem Start (ms, von–bis)
const VISIT_GAP = [4 * 60000, 9 * 60000]; // danach
const VISIT_STAY = 25000;
const VISIT_W = 104; // so viel breiter wird das kleine Fenster für den Gast (Gast gleich groß, leicht überlappend)
const GUEST_BUBBLE_MS = 2400;
type Side = "L" | "R"; // Blickrichtung beim Besuch
const between = ([a, b]: number[]) => a + Math.random() * (b - a);

// Tastenkürzel nacheinander an- und abmelden, sonst überholen sich die Aufrufe (z. B. im StrictMode)
let shortcutChain: Promise<unknown> = Promise.resolve();
const queueShortcut = (f: () => Promise<unknown>) => (shortcutChain = shortcutChain.then(f, f));

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
const LIST_D = "M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.5M3 8h.5M3 11.5h.5";
const TODAY_D = "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M8 8.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z";
const SEARCH_D = "M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.3 10.3L13.5 13.5";
const CAL_D = "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3M5 9h2M9 9h2M5 11h2";
const TABLE_D = "M2.5 3h11v10.5h-11zM2.5 6h11M6.5 3v10.5M2.5 9.5h11";
const HIST_D = "M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 5v3l2 1.5";
const GEAR_D = "M8 5.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2";
const MENU_D = "M3 4.5h10M3 8h10M3 11.5h10";
const BIG_D = "M9.5 6.5l4-4M10 2.5h3.5V6M6.5 9.5l-4 4M6 13.5H2.5V10";
const SMALL_D = "M13.5 2.5L9.5 6.5M9.5 3v3.5H13M2.5 13.5l4-4M6.5 13V9.5H3";

export default function App() {
  const [data, setData] = useState<Data>(load);
  const [collapsed, setCollapsed] = useState(true);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<View>("list");
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
  const [dlgWear, setDlgWear] = useState<Accessory | undefined>(undefined);
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
  const [shortcutFailed, setShortcutFailed] = useState(false);
  const [icsMsg, setIcsMsg] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<{ id: string; at: number; leaving?: boolean } | null>(null);
  const [guestEvent, setGuestEvent] = useState<PetEvent | null>(null);
  const [guestBubble, setGuestBubble] = useState<{ text: string; at: number } | null>(null);
  const [visitSide, setVisitSide] = useState<"left" | "right" | null>(null);
  const [game, setGame] = useState<{ demo: DemoMode | null; key: number } | null>(null);
  const [sketchFor, setSketchFor] = useState<string | null>(null); // Aufgabe, deren Skizzenfeld offen ist
  const [logInput, setLogInput] = useState("");
  const [logFocus, setLogFocus] = useState<string | null>(null); // Tag in der Logbuch-Monatsansicht
  const [dlgLog, setDlgLog] = useState(true); // eingeklappt: Fenster für den Gast verbreitert
  const visitSideRef = useRef<"left" | "right" | null>(null);
  const winChain = useRef<Promise<unknown>>(Promise.resolve());
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
  const allOpen = project ? openIn(project.id) : [];
  const count = allOpen.length; // Logbuch zählt mit (Zähler, Stimmung)
  const open = allOpen.filter(t => !t.log);
  // Logbuch: alle offenen Logbuch-Aufgaben (auch von früheren Tagen) plus heute erledigte
  const logOpen = allOpen.filter(t => t.log);
  const logDoneToday = project ? data.tasks.filter(t => t.projectId === project.id && t.log && !t.parentId && t.doneAt && dayOf(t.doneAt) === isoToday()) : [];
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

  // Accessoire (falls freigeschaltet und eingeschaltet) und Jahreszeit für das Tier eines Projekts
  const season = settings.seasons ? seasonOf(new Date(now)) : undefined;
  const wearFor = (p?: Project | null): Wear | undefined => {
    const accessory = settings.accessories && p?.wear && unlocked(p.wear, data.doneTotal) ? p.wear : undefined;
    return accessory || season ? { accessory, season } : undefined;
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

  // Besuch im eingeklappten Zustand: Fenster verbreitern bzw. zurücksetzen, nacheinander ausgeführt
  const setWide = (want: boolean) =>
    (winChain.current = winChain.current.then(async () => {
      if (want && !visitSideRef.current) {
        const side = await widenForVisit(VISIT_W);
        visitSideRef.current = side;
        setVisitSide(side);
      } else if (!want && visitSideRef.current) {
        const side = visitSideRef.current;
        visitSideRef.current = null;
        await narrowAfterVisit(VISIT_W, side);
        setVisitSide(null);
      }
    }));

  const collapse = async () => {
    setMenu(null);
    setDialog(null);
    setVisitor(null);
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
    await setWide(false);
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

  const logParsed = logInput.trim() ? parseTask(logInput) : null;
  const addLogTask = () => {
    if (!project || !logParsed) return;
    const { text, due, prio, repeat } = logParsed;
    const order = nextOrder();
    setData(d => ({ ...d, tasks: [...d.tasks, { id: uid(), projectId: project.id, text, createdAt: Date.now(), order, due, prio, repeat, log: isoToday() }] }));
    setLogInput("");
    petDo("added");
    if (Math.random() < 0.5) say(t(pick(["Notiert!", "Kommt ins Logbuch!", "Machen wir!"])), REACT_GAP);
  };
  const setProjectFlag = (id: string, patch: Partial<Project>) =>
    setData(d => ({ ...d, projects: d.projects.map(p => (p.id === id ? { ...p, ...patch } : p)) }));
  const openLog = (projectId: string, date: string | null) => {
    const p = data.projects.find(pp => pp.id === projectId);
    if (p) selectProject(p);
    setLogFocus(date ?? isoToday());
    setView("log");
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
    const siblings = openIn(task.projectId).length;
    const left = task.parentId ? siblings : siblings - 1;
    // Neues Accessoire freigeschaltet?
    const before = data.doneTotal;
    const prize = ACCESSORIES.find(a => before < a.need && before + ids.length >= a.need);
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
      spawned.push({ ...task, id: copyId, due: nextDue(task.due, task.repeat), createdAt: Date.now(), doneAt: undefined, ...(task.log && { log: isoToday() }) });
      data.tasks
        .filter(t => t.parentId === task.id && !t.doneAt)
        .forEach((s, i) => spawned.push({ ...s, id: uid(), parentId: copyId, createdAt: Date.now(), order: base + i + 1 }));
    }
    window.setTimeout(() => {
      const at = Date.now();
      setData(d => ({
        ...d,
        tasks: [...d.tasks.map(t => (ids.includes(t.id) ? { ...t, doneAt: at } : t)), ...spawned],
        doneTotal: d.doneTotal + ids.length,
      }));
      if (prize && settings.accessories) say(t("Neu freigeschaltet: {item}!", { item: t(prize.name) }), true);
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
      doneTotal: Math.max(0, d.doneTotal - undo.ids.length),
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
        .filter(t => t.projectId === task.projectId && t.parentId === task.parentId && !t.doneAt && t.id !== task.id && (!!task.parentId || !t.log === !task.log))
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
    setDlgWear(undefined);
    setDlgLog(true);
    setConfirmDel(false);
    setMenu(null);
  };

  const openEdit = (p: Project) => {
    setDialog({ mode: "edit", id: p.id });
    setDlgName(p.name);
    setDlgAnimal(p.animal);
    setDlgFolder(p.folderId);
    setDlgWear(p.wear);
    setDlgLog(!p.logHidden);
    setConfirmDel(false);
    setMenu(null);
  };

  const saveDialog = () => {
    if (!dialog) return;
    const name = dlgName.trim();
    if (dialog.mode === "new") {
      const p: Project = { id: uid(), folderId: folder.id, name: name || t("Neues Projekt"), animal: dlgAnimal, wear: dlgWear, logHidden: !dlgLog || undefined };
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
          p.id === id ? { ...p, name: name || p.name, animal: dlgAnimal, folderId: dlgFolder || p.folderId, wear: dlgWear, logHidden: !dlgLog || undefined } : p
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
      if (!(e.target as HTMLElement).closest(".menu, .path, .menu-toggle")) setMenu(null);
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
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "f" && settings.search && !collapsed) {
        e.preventDefault();
        setMenu(null);
        setView("search");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ---------- Schnelleingabe (eigenes Fenster, Strg+Alt+T) ----------

  const sayRef = useRef(say);
  sayRef.current = say;
  const petDoRef = useRef(petDo);
  petDoRef.current = petDo;

  useEffect(() => {
    const off = listen<{ projectId: string; text: string }>("quick-add", ({ payload }) => {
      const p = dataRef.current.projects.find(x => x.id === payload.projectId);
      if (!p || !payload.text.trim()) return;
      const { text, due, prio, repeat } = parseTask(payload.text);
      setData(d => ({
        ...d,
        tasks: [...d.tasks, { id: uid(), projectId: p.id, text, createdAt: Date.now(), order: d.tasks.reduce((m, t) => Math.max(m, t.order), 0) + 1, due, prio, repeat }],
      }));
      petDoRef.current("added");
      sayRef.current(t("Notiert!"), true);
    });
    return () => {
      off.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (!settings.quickAdd) return;
    const openQuick = async () => {
      const q = await Window.getByLabel("quick");
      if (!q) return;
      await emitTo("quick", "quick-open");
      await q.center();
      await q.show();
      await q.setFocus();
    };
    queueShortcut(async () => {
      try {
        if (await isRegistered(QUICK_KEY)) await unregister(QUICK_KEY);
        await register(QUICK_KEY, e => {
          if (e.state === "Pressed") openQuick();
        });
        setShortcutFailed(false);
      } catch {
        // z. B. von einem anderen Programm belegt
        setShortcutFailed(true);
      }
    });
    return () => {
      queueShortcut(() => unregister(QUICK_KEY).catch(() => {}));
    };
  }, [settings.quickAdd]);

  // ---------- Kalender-Import (.ics) ----------

  const importIcs = async () => {
    setIcsMsg(null);
    try {
      const path = await openDialog({ multiple: false, directory: false, filters: [{ name: "iCalendar", extensions: ["ics"] }] });
      if (!path || Array.isArray(path)) return;
      const found = new Map(parseIcs(await invoke<string>("read_ics", { path })).map(e => [e.source!, e]));
      if (!found.size) {
        setIcsMsg(t("Keine aktuellen Termine in der Datei gefunden."));
        return;
      }
      // Schon einmal importiert: aktualisieren statt verdoppeln
      const cur = dataRef.current.events;
      let updated = 0;
      const events = cur.map(e => {
        const n = e.source ? found.get(e.source) : undefined;
        if (!n) return e;
        found.delete(e.source!);
        updated++;
        return { ...e, title: n.title, place: n.place, date: n.date, start: n.start, end: n.end };
      });
      const added = [...found.values()].map(e => ({ ...e, id: uid() }));
      setData(d => ({ ...d, events: [...events, ...added] }));
      setIcsMsg(t("{n} Termine übernommen.", { n: added.length }) + (updated ? " " + t("{n} aktualisiert.", { n: updated }) : ""));
    } catch {
      setIcsMsg(t("Diese Datei konnte nicht gelesen werden."));
    }
  };

  // ---------- Besuch von Tieren anderer Projekte ----------

  const canVisit = settings.visits && data.projects.length > 1 && !game;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  useEffect(() => {
    if (!canVisit) {
      setVisitor(null);
      return;
    }
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => void timers.push(window.setTimeout(f, ms));
    // Wer schaut wohin: eingeklappt sitzt der Gast meist links, im offenen Fenster rechts neben dem Tier
    const dirs = (): { host: Side; guest: Side } => {
      const guestLeft = collapsedRef.current && visitSideRef.current !== "right";
      return guestLeft ? { host: "L", guest: "R" } : { host: "R", guest: "L" };
    };
    const host = (type: string) => petDoRef.current(type);
    const guest = (type: string) => setGuestEvent({ type, at: Date.now() });
    const hostSay = (text: string) => sayRef.current(text, true);
    const guestSay = (text: string) => {
      if (!settingsRef.current.bubbles) return;
      const at = Date.now();
      setGuestBubble({ text, at });
      window.setTimeout(() => setGuestBubble(b => (b?.at === at ? null : b)), GUEST_BUBBLE_MS);
    };

    // Gemeinsame Aktionen; pro Besuch zwei zufällige
    const acts: Record<string, () => void> = {
      chat: () => {
        const d = dirs();
        guest(`talk${d.guest}`);
        host(`listen${d.host}`);
        guestSay(t(pick(["Wie läuft's?", "Viel zu tun?", "Was machst du so?", "Na, fleißig?"])));
        later(2700, () => {
          const d2 = dirs();
          host(`talk${d2.host}`);
          guest(`listen${d2.guest}`);
          const da = dataRef.current;
          const n = da.tasks.filter(x => x.projectId === da.activeProject && !x.parentId && !x.doneAt).length;
          hostSay(n ? t(n === 1 ? "Noch eine Aufgabe!" : "Noch {n} Aufgaben!", { n }) : t("Alles erledigt!"));
        });
        later(5400, () => {
          guest("added");
          guestSay(t(pick(["Du schaffst das!", "Weiter so!", "Klingt gut!", "Stark!"])));
        });
      },
      hearts: () => {
        const d = dirs();
        guest(`love${d.guest}`);
        host(`love${d.host}`);
      },
      hop: () => {
        guestSay(t("Wer hüpft höher?"));
        later(600, () => guest("done"));
        later(1900, () => host("done"));
        later(3600, () => guest("done"));
        later(4900, () => host("done"));
      },
      five: () => {
        guestSay(t("Gib mir fünf!"));
        later(900, () => {
          const d = dirs();
          guest(`five${d.guest}`);
          host(`five${d.host}`);
        });
      },
    };

    const arrive = () => {
      const d0 = dataRef.current;
      const list = d0.projects.filter(p => p.id !== d0.activeProject);
      if (!list.length) return;
      const v = pick(list);
      setVisitor({ id: v.id, at: Date.now() });
      setGuestEvent({ type: "wave", at: Date.now() });
      hostSay(t("Besuch von {name}!", { name: v.name }));
      later(1600, () => {
        host(`bye${dirs().host}`);
        guestSay(t(pick(["Hallo!", "Hi!", "Huhu!"])));
      });
      const [a, b] = Object.keys(acts).sort(() => Math.random() - 0.5);
      later(4500, acts[a]);
      later(11500, acts[b]);
      later(VISIT_STAY - 4500, () => {
        const d = dirs();
        guest(`bye${d.guest}`);
        host(`bye${d.host}`);
        guestSay(t(pick(["Tschüss!", "Bis bald!", "Mach's gut!"])));
      });
      later(VISIT_STAY, () => {
        setVisitor(x => x && { ...x, leaving: true });
        later(500, () => {
          setVisitor(null);
          setGuestBubble(null);
          later(between(VISIT_GAP), arrive);
        });
      });
    };
    later(between(VISIT_FIRST), arrive);
    return () => timers.forEach(x => window.clearTimeout(x));
  }, [canVisit]);

  useEffect(() => {
    setWide(collapsed && !!visitor);
  }, [collapsed, !!visitor]);

  // Erster Start dieser Version: Autostart einschalten (abschaltbar in den Einstellungen)
  useEffect(() => {
    if (settings.autostartInit || !import.meta.env.PROD) return;
    enableAutostart()
      .catch(e => console.error("Autostart fehlgeschlagen", e))
      .finally(() => setSettings(st => ({ ...st, autostartInit: true })));
  }, []);

  // ---------- Ansichten, Suche, Sprung zur Aufgabe ----------

  // Abgeschaltete Funktion: zurück zur Liste
  useEffect(() => {
    if ((view === "today" && !settings.today) || (view === "search" && !settings.search)) setView("list");
    if (!settings.timer) setTimerOpen(false);
  }, [settings.today, settings.search, settings.timer]);

  const goToTask = (task: Task) => {
    const p = data.projects.find(pp => pp.id === task.projectId);
    if (p) selectProject(p);
    // Aufgabe im (eingeklappten) Logbuch: aufklappen, damit man sie sieht
    const root = task.parentId ? data.tasks.find(x => x.id === task.parentId) : task;
    if (p && root?.log && !task.doneAt && (p.logCollapsed || p.logHidden)) setProjectFlag(p.id, { logCollapsed: false, logHidden: false });
    setView(task.doneAt ? "history" : "list");
    if (!task.doneAt) setFlashId(task.id);
  };

  // Gefundene Aufgabe kurz hervorheben
  useEffect(() => {
    if (!flashId) return;
    document.querySelector(`[data-id="${flashId}"]`)?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    const tm = window.setTimeout(() => setFlashId(null), 1800);
    return () => window.clearTimeout(tm);
  }, [flashId]);

  // ---------- Spiel "Dammbau" ----------

  // Läuft im großen Fenster; danach zurück zur gewohnten Größe
  const openGame = async (demo: DemoMode | null = null) => {
    setMenu(null);
    setLab(false);
    setGame({ demo, key: Date.now() });
    const size = cardSize(true, false);
    await fitWindow(size.w, size.h);
  };
  // Skizzenfeld: ebenfalls im großen Fenster
  const openSketch = async (id: string) => {
    setDetailsId(null);
    setSketchFor(id);
    const size = cardSize(true, false);
    await fitWindow(size.w, size.h);
  };
  const closeSketch = async () => {
    setSketchFor(null);
    if (game) return;
    const size = cardSize(settings.large, view === "plan" && planTab === "timetable" && week);
    await fitWindow(size.w, size.h);
  };

  const closeGame = async () => {
    setGame(null);
    const size = cardSize(settings.large, view === "plan" && planTab === "timetable" && week);
    await fitWindow(size.w, size.h);
  };
  const saveScore = (score: number, layers: number) => {
    const res = addScore(dataRef.current.dam, { score, layers, at: isoToday(), animal: theme });
    setData(d => ({ ...d, dam: addScore(d.dam, { score, layers, at: isoToday(), animal: theme }).scores }));
    return { record: res.record, animalRecord: res.animalRecord };
  };

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
    const guest = visitor && visitSide ? data.projects.find(p => p.id === visitor.id) : undefined;
    const guestMood = moodOf(guest ?? null);
    return (
      <div
        className={guest ? `mini visiting ${visitSide}` : "mini"}
        style={themeVars(shown?.animal ?? "beaver")}
        onMouseDown={onPetDown}
        title={label + lecText + (exam ? "\n" + t("Prüfung {title}: {cd}", { title: exam.title, cd: countdown(exam.date) }) : "")}
      >
        {bubble && <span className="bubble" key={bubble.at}>{bubble.text}</span>}
        {guest && visitor && (
          <div
            className={visitor.leaving ? "mini-visitor leaving" : "mini-visitor"}
            title={t("{name} ist zu Besuch. Klicken, um hinzuwechseln.", { name: guest.name })}
            onMouseDown={e => {
              if (e.button !== 0) return;
              e.stopPropagation();
              selectProject(guest);
              setVisitor(null);
              expand();
            }}
          >
            {guestBubble && <span className="bubble guest-bubble" key={guestBubble.at}>{guestBubble.text}</span>}
            <Pet
              kind={guest.animal}
              mood={["sleep", "alarm", "event"].includes(guestMood) ? "relaxed" : guestMood}
              scale={3}
              event={guestEvent}
              reduced={settings.calm}
              wear={wearFor(guest)}
            />
          </div>
        )}
        <div className="pet" ref={n => void (dangle.current = n)}>
          <Pet kind={shown?.animal ?? "beaver"} mood={mood} stash={stashOf(shown)} scale={3} event={petEvent} held={held} reduced={settings.calm} wear={wearFor(shown)} interactive />
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
            {!editing && (task.due || task.note || task.sketch || (task.log && task.log < isoToday() && !task.doneAt)) && (
              <span className="meta">
                {task.log && task.log < isoToday() && !task.doneAt && <span className="log-since" title={t("Im Logbuch seit {d}", { d: task.log })}>{sinceLabel(task.log)}</span>}
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
                {task.sketch && (
                  <button className="sketch-tag" onClick={() => openSketch(task.id)} title={t("Skizze öffnen")}>
                    {t("Skizze")}
                  </button>
                )}
              </span>
            )}
          </div>
          {!sub && (
            <button className="add-sub" onClick={() => openSub(task.id)} title={t("Unteraufgabe hinzufügen")} aria-label={t("Unteraufgabe hinzufügen")}>+</button>
          )}
          <button
            className={task.sketch ? "sketch-btn has" : "sketch-btn"}
            onClick={() => openSketch(task.id)}
            title={t(task.sketch ? "Skizze öffnen" : "Skizzenfeld: zeichnen und schreiben")}
            aria-label={t("Skizze öffnen")}
          >
            <svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3L6 13H3v-3zM9 4l3 3" /></svg>
          </button>
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

  // Aufgabenliste mit Unteraufgaben (für Logbuch und normale Liste)
  const renderList = (list: Task[]) => (
    <ul className="list">
      {list.map(task => {
        const subs = subsOf(task.id);
        const cls = ["task", leaving.includes(task.id) && "leaving", dragId === task.id && "dragging", task.due && daysUntil(task.due) < 0 && "late", flashId === task.id && "flash"].filter(Boolean).join(" ");
        return (
          <li key={task.id} data-id={task.id} className={cls} onPointerDown={e => onRowPointerDown(e, task)}>
            {renderTask(task, false)}
            {(subs.length > 0 || subFor === task.id) && (
              <ul className="subs">
                {subs.map(s => (
                  <li
                    key={s.id}
                    data-id={s.id}
                    className={["sub", leaving.includes(s.id) && "leaving", dragId === s.id && "dragging", flashId === s.id && "flash"].filter(Boolean).join(" ")}
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
  );

  const editingProject = dialog?.mode === "edit" ? dialog.id : null;
  const exams = upcomingExams(data.events, EXAM_DAYS);
  const apptProjectBig = appt?.projectId ? data.projects.find(p => p.id === appt.projectId) : undefined;
  const left = timer ? remaining(timer, now) : 0;
  const cardClass = ["card", closing && "closing", dragId && "sorting"].filter(Boolean).join(" ");
  const alarmProject = alarm ? data.projects.find(p => p.id === alarm) : undefined;
  const hint = parsed && (parsed.due || parsed.prio) ? parsed : null;
  const todayCount = settings.today ? dueToday(data.tasks).length : 0;
  const showPath = view === "list" || view === "history";
  const viewTitle = t(
    { list: "Aufgaben", history: "Verlauf", today: "Heute", search: "Suche", log: "Logbuch", plan: planTab === "month" ? "Kalender" : "Stundenplan" }[view]
  );
  const visitorProject = visitor ? data.projects.find(p => p.id === visitor.id) : undefined;
  const visitMoodRaw = moodOf(visitorProject ?? null);
  const visitMood: MoodState = ["sleep", "alarm", "event"].includes(visitMoodRaw) ? "relaxed" : visitMoodRaw;
  const menuItem = (d: string, label: string, on: boolean, act: () => void, extra?: ReactNode) => (
    <button
      role="menuitem"
      className={on ? "app-item on" : "app-item"}
      onClick={() => {
        setMenu(null);
        act();
      }}
    >
      <Icon d={d} />
      <span className="m-name">{label}</span>
      {extra}
    </button>
  );

  return (
    <div className={cardClass} style={themeVars(theme)}>
      <header className="bar" onMouseDown={dragHeader}>
        <span
          className={hop ? "bar-pet hop" : "bar-pet"}
          ref={n => void (dangle.current = n)}
        >
          <Pet kind={theme} mood={moodOf(project)} scale={1} event={petEvent} held={held} reduced={settings.calm} wear={wearFor(project)} interactive />
          {count > 0 && <span className="badge">{count > 99 ? "99+" : count}</span>}
        </span>
        {visitorProject && visitor && (
          <button
            className={visitor.leaving ? "visitor leaving" : "visitor"}
            onClick={() => {
              selectProject(visitorProject);
              setVisitor(null);
              setView("list");
            }}
            title={t("{name} ist zu Besuch. Klicken, um hinzuwechseln.", { name: visitorProject.name })}
            aria-label={t("{name} ist zu Besuch. Klicken, um hinzuwechseln.", { name: visitorProject.name })}
          >
            <Pet kind={visitorProject.animal} mood={visitMood} scale={1} event={guestEvent} reduced={settings.calm} wear={wearFor(visitorProject)} />
            {guestBubble && <span className="bubble in-bar guest-bar" key={guestBubble.at}>{guestBubble.text}</span>}
          </button>
        )}
        {view !== "list" && (
          <button className="icon back" onClick={() => setView("list")} title={t("Zurück zu den Aufgaben")} aria-label={t("Zurück zu den Aufgaben")}>
            <Icon d="M10 3.5L5.5 8l4.5 4.5" />
          </button>
        )}
        <span className="bar-title">{viewTitle}</span>
        {timer && settings.timer && (
          <button
            className={timerOpen ? "bar-timer on" : "bar-timer"}
            onClick={() => setTimerOpen(o => !o)}
            title={t("Timer")}
            aria-label={t("Timer")}
          >
            <Icon d={TIMER_D} />
            <span className={timer.endsAt ? "bar-clock" : "bar-clock paused"}>{clock(left)}</span>
          </button>
        )}
        <button
          className={menu === "main" ? "icon menu-toggle on" : "icon menu-toggle"}
          onClick={() => setMenu(m => (m === "main" ? null : "main"))}
          title={t("Menü")}
          aria-label={t("Menü")}
          aria-expanded={menu === "main"}
        >
          <Icon d={MENU_D} />
          {settings.today && todayCount > 0 && <i className="menu-dot" />}
        </button>
        <button className="icon" onClick={collapse} title={t("Einklappen")} aria-label={t("Einklappen")}>
          <Icon d="M4 8h8" />
        </button>
        <button className="icon" onClick={() => win.close()} title={t("Schließen")} aria-label={t("Schließen")}>
          <Icon d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
        </button>
      </header>

      {menu === "main" && (
        <div className="menu app-menu" role="menu">
          {menuItem(LIST_D, t("Aufgaben"), view === "list", () => setView("list"))}
          {settings.today && menuItem(TODAY_D, t("Heute"), view === "today", () => setView("today"), todayCount > 0 ? <span className="count">{todayCount}</span> : null)}
          {settings.search && menuItem(SEARCH_D, t("Suche"), view === "search", () => setView("search"), <kbd>{t("Strg+F")}</kbd>)}
          {menuItem(CAL_D, t("Kalender"), view === "plan" && planTab === "month", () => {
            setPlanTab("month");
            setView("plan");
          })}
          {menuItem(TABLE_D, t("Stundenplan"), view === "plan" && planTab === "timetable", () => {
            setPlanTab("timetable");
            setView("plan");
          })}
          {project && menuItem(HIST_D, t("Verlauf"), view === "history", () => setView("history"))}
          {settings.timer && project && menuItem(TIMER_D, t("Timer"), timerOpen, () => setTimerOpen(o => !o), timer ? <span className="m-sub">{clock(left)}</span> : null)}
          <div className="m-sep" />
          {menuItem(settings.large ? SMALL_D : BIG_D, t(settings.large ? "Fenster verkleinern" : "Fenster vergrößern"), false, () => setSettings(st => ({ ...st, large: !st.large })))}
          {menuItem(GEAR_D, t("Einstellungen…"), false, () => setSettingsOpen(true))}
        </div>
      )}

      {showPath && (
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
          {project && <Pet kind={project.animal} mood="relaxed" still crop="head" wear={wearFor(project)} />}
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
                    <Pet kind={p.animal} mood="relaxed" still crop="head" wear={wearFor(p)} />
                    <span className="m-name">{p.name}</span>
                    {timers[p.id] && settings.timer && <span className="m-timer" title={t("Timer läuft")}><Icon d={TIMER_D} /></span>}
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
          {settings.game && (
            <button className="m-add m-break" onClick={() => openGame()}>
              <Icon d="M2.5 11.5h11M4 11.5V9h8v2.5M5 9V6.5h6V9M6.5 6.5V4.5h3v2" />
              {t("Pause machen")}
            </button>
          )}
        </div>
      )}
      </nav>
      )}

      {project && timerOpen && settings.timer && (
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

      {(view === "list" || view === "today") && exams.length > 0 && (
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
          onOpenTask={goToTask}
          onImport={settings.icsImport ? importIcs : undefined}
          importMsg={settings.icsImport ? icsMsg : null}
          logDots={logDots(data.tasks, data.projects)}
          showLogs={settings.calLogs}
          onShowLogs={on => setSettings(st => ({ ...st, calLogs: on }))}
          onOpenLog={openLog}
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
      ) : view === "today" ? (
        <TodayView
          tasks={data.tasks}
          projects={data.projects}
          events={data.events}
          lectures={data.lectures}
          leaving={leaving}
          wearFor={wearFor}
          onComplete={complete}
          onOpen={goToTask}
          onOpenDay={date => {
            setCalFocus(date);
            setPlanTab("month");
            setView("plan");
          }}
        />
      ) : view === "search" ? (
        <SearchView
          data={data}
          onOpenTask={goToTask}
          onOpenEvent={e => {
            setCalFocus(e.date);
            setPlanTab("month");
            setView("plan");
          }}
        />
      ) : view === "log" && project ? (
        <main className="body">
          <div className="log-title">
            <Pet kind={project.animal} mood="relaxed" still crop="head" wear={wearFor(project)} />
            <strong>{t("Logbuch · {name}", { name: project.name })}</strong>
          </div>
          <LogMonth tasks={data.tasks} projectId={project.id} color={projectColor(project)} focus={logFocus} onOpenTask={goToTask} />
        </main>
      ) : !project ? (
        <main className="body">
          <p className="empty">{t("In „{folder}“ gibt es noch kein Projekt.", { folder: folder.name })}</p>
          <button className="btn primary center" onClick={openNew}>{t("Projekt anlegen")}</button>
        </main>
      ) : view === "list" ? (
        <main className="body">
          {!project.logHidden && (
            <section className={project.logCollapsed ? "logbook collapsed" : "logbook"} style={{ "--log": projectColor(project) } as CSSProperties}>
              <div className="log-head">
                <button
                  className="log-fold"
                  onClick={() => setProjectFlag(project.id, { logCollapsed: !project.logCollapsed })}
                  aria-expanded={!project.logCollapsed}
                  title={t(project.logCollapsed ? "Logbuch aufklappen" : "Logbuch einklappen")}
                  aria-label={t(project.logCollapsed ? "Logbuch aufklappen" : "Logbuch einklappen")}
                >
                  <svg viewBox="0 0 16 16"><path d={project.logCollapsed ? "M6 4l4 4-4 4" : "M4 6l4 4 4-4"} /></svg>
                </button>
                <button className="log-date" onClick={() => openLog(project.id, isoToday())} title={t("Monatsansicht des Logbuchs")}>
                  {t("Logbuch")} · {new Date().toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" })}
                </button>
                {logOpen.length > 0 && <span className="count">{logOpen.length}</span>}
                <span className="spacer" />
                {logDoneToday.length > 0 && <span className="log-done-n">{t("{n} heute erledigt", { n: logDoneToday.length })}</span>}
                <button className="log-hide" onClick={() => setProjectFlag(project.id, { logHidden: true })} title={t("Logbuch in diesem Projekt ausblenden (wieder einblenden im Projekt-Dialog)")} aria-label={t("Logbuch ausblenden")}>
                  <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
                </button>
              </div>
              {!project.logCollapsed && (
                <>
                  <input
                    className="new log-new"
                    value={logInput}
                    onChange={e => setLogInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addLogTask()}
                    placeholder={t("Für heute notieren…")}
                  />
                  {logParsed && (logParsed.due || logParsed.prio) && (
                    <div className="hint">
                      {logParsed.due && <span className="due">{formatDueLong(logParsed.due)}</span>}
                      {logParsed.prio && (
                        <span className="hint-prio">
                          <i style={{ background: prioColor(logParsed.prio) }} />
                          {t(PRIOS[logParsed.prio - 1].name)}
                        </span>
                      )}
                    </div>
                  )}
                  {logOpen.length > 0 && renderList(logOpen)}
                  {logDoneToday.length > 0 && (
                    <ul className="log-done">
                      {logDoneToday.map(x => (
                        <li key={x.id}>
                          <span className="log-mark">✓</span>
                          <span className="log-text">{x.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!logOpen.length && !logDoneToday.length && <p className="log-empty">{t("Noch nichts für heute. Alles, was zu keinem Thema passt, kommt hier rein.")}</p>}
                </>
              )}
            </section>
          )}
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
            renderList(open)
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
                    <Pet kind={a.kind} mood="relaxed" still wear={dlgWear && settings.accessories && unlocked(dlgWear, data.doneTotal) ? { accessory: dlgWear } : undefined} />
                    <span>{animalName(a.kind)}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={dlgLog} onChange={e => setDlgLog(e.target.checked)} />
              <span>
                {t("Logbuch anzeigen")}
                <small className="check-hint">{t("Fester Block oben für Aufgaben des Tages, die zu keinem Thema passen.")}</small>
              </span>
            </label>
            {settings.accessories && (
              <div className="field">
                {t("Accessoire")}
                <div className="pick wear-pick">
                  <button type="button" className={!dlgWear ? "pick-one on" : "pick-one"} onClick={() => setDlgWear(undefined)} aria-pressed={!dlgWear}>
                    <Pet kind={dlgAnimal} mood="relaxed" still crop="head" />
                    <span>{t("Ohne")}</span>
                  </button>
                  {ACCESSORIES.map(a => {
                    const ok = unlocked(a.id, data.doneTotal);
                    return (
                      <button
                        type="button"
                        key={a.id}
                        className={["pick-one", dlgWear === a.id && "on", !ok && "locked"].filter(Boolean).join(" ")}
                        onClick={() => ok && setDlgWear(a.id)}
                        aria-pressed={dlgWear === a.id}
                        aria-disabled={!ok}
                        title={ok ? t(a.name) : t("Noch {n} erledigte Aufgaben", { n: a.need - data.doneTotal })}
                      >
                        <Pet kind={dlgAnimal} mood="relaxed" still crop="head" wear={{ accessory: a.id }} />
                        <span>{ok ? t(a.name) : t("ab {n}", { n: a.need })}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="wear-note">{t("{n} Aufgaben erledigt. Neue Accessoires gibt es fürs Weitermachen, ganz ohne Eile.", { n: data.doneTotal })}</span>
              </div>
            )}
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
      {lab && <PetLab kind={theme} onClose={() => setLab(false)} onGame={demo => openGame(demo)} />}
      {sketchFor && data.tasks.some(x => x.id === sketchFor) && (
        <SketchEditor
          key={sketchFor}
          title={data.tasks.find(x => x.id === sketchFor)!.text}
          sketch={data.tasks.find(x => x.id === sketchFor)!.sketch}
          onSave={sketch => patch(sketchFor, { sketch })}
          onClose={closeSketch}
          onDrag={() => {
            forgetHome();
            win.startDragging();
          }}
        />
      )}
      {game && (
        <DamGame
          key={game.key}
          animal={theme}
          wear={wearFor(project)}
          calm={settings.calm}
          sound={settings.gameSound}
          onSound={on => setSettings(st => ({ ...st, gameSound: on }))}
          scores={data.dam}
          onSave={saveScore}
          demo={game.demo}
          onClose={closeGame}
          onDrag={() => {
            forgetHome();
            win.startDragging();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          shortcutFailed={shortcutFailed}
          onImportIcs={importIcs}
          icsMessage={icsMsg}
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
            setIcsMsg(null);
          }}
        />
      )}

      <canvas ref={confettiRef} className="confetti" aria-hidden />
    </div>
  );
}
