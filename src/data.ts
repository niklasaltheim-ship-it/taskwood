import { isAnimal } from "./sprites";
import type { AnimalKind } from "./sprites";
import { sanitizeLectures } from "./schedule";
import type { Lecture } from "./schedule";
import { t } from "./i18n";

export type Folder = { id: string; name: string; last?: string }; // last: zuletzt gewähltes Projekt
export type Project = { id: string; folderId: string; name: string; animal: AnimalKind };
export type Prio = 1 | 2 | 3;
export type Repeat = "daily" | "weekly" | "monthly";

// Eigener Kalendertermin; start/end in Minuten ab Mitternacht, fehlen bei ganztägigen Terminen
export type CalEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  start?: number;
  end?: number;
  title: string;
  place?: string;
  exam: boolean; // Prüfung: erscheint im Countdown
  projectId?: string;
  remind?: number; // Minuten vorher, undefined = keine Erinnerung
  notifiedAt?: number;
  seenAt?: number; // Termin läuft und wurde mit OK bestätigt; das Tier meldet sich dann nicht mehr
};

export type Task = {
  id: string;
  projectId: string;
  text: string;
  createdAt: number;
  order: number;
  doneAt?: number;
  parentId?: string;
  due?: string; // YYYY-MM-DD
  prio?: Prio;
  note?: string;
  repeat?: Repeat; // wiederkehrend; beim Abhaken entsteht die nächste Aufgabe
};
// Läuft: endsAt gesetzt. Pausiert: left gesetzt (Restzeit in ms).
export type Timer = { duration: number; endsAt?: number; left?: number };
export type Data = {
  version: 2;
  folders: Folder[];
  projects: Project[];
  activeFolder: string;
  activeProject: string; // "" wenn der Ordner leer ist
  tasks: Task[];
  timers: Record<string, Timer>;
  lectures: Lecture[]; // Stundenplan
  events: CalEvent[]; // Kalender
};

export const STORE = "taskwood-data";
const BACKUP_V1 = "taskwood-data-v1-backup";

export const uid = () => Math.random().toString(36).slice(2, 10);

// Startstand für neue Nutzer: ein Ordner und ein kurzes Beispielprojekt, das die Bedienung zeigt
function fresh(): Data {
  const folder: Folder = { id: uid(), name: t("Allgemein") };
  const project: Project = { id: uid(), folderId: folder.id, name: t("Erste Schritte"), animal: "beaver" };
  const now = Date.now();
  const tasks: Task[] = [
    "Tippe oben eine Aufgabe ein, z. B. „Einkaufen morgen“",
    "Hake mich ab: dein Biber freut sich",
    "Über das Kalender-Symbol oben findest du Kalender und Stundenplan",
  ].map((text, i) => ({ id: uid(), projectId: project.id, text: t(text), createdAt: now + i, order: i }));
  return {
    version: 2,
    folders: [folder],
    projects: [project],
    activeFolder: folder.id,
    activeProject: project.id,
    tasks,
    timers: {},
    lectures: sanitizeLectures(undefined),
    events: [],
  };
}

// Version 1: { tabs, activeTab, tasks[tabId] } -> alle Bereiche werden Projekte im Ordner "Allgemein"
function migrateV1(d: any): Data {
  const folder: Folder = { id: uid(), name: "Allgemein", last: d.activeTab };
  const projects: Project[] = d.tabs.map((t: any) => ({
    id: t.id,
    folderId: folder.id,
    name: t.name,
    animal: isAnimal(t.animal) ? t.animal : "beaver",
  }));
  // Reihenfolge bleibt die bisherige Anzeige-Reihenfolge (Einfügereihenfolge)
  const tasks: Task[] = (Array.isArray(d.tasks) ? d.tasks : []).map(({ tabId, ...t }: any, i: number) => ({
    ...t,
    projectId: tabId,
    order: i,
  }));
  return {
    version: 2,
    folders: [folder],
    projects,
    activeFolder: folder.id,
    activeProject: d.activeTab,
    tasks,
    timers: {},
    lectures: sanitizeLectures(undefined),
    events: [],
  };
}

// Repariert fehlende oder ungültige Felder, ohne Aufgaben zu verwerfen
function sanitize(d: Data): Data {
  const folders = Array.isArray(d.folders) && d.folders.length ? d.folders : fresh().folders;
  const folderIds = new Set(folders.map(f => f.id));
  const projects = (Array.isArray(d.projects) ? d.projects : []).map(p => ({
    ...p,
    folderId: folderIds.has(p.folderId) ? p.folderId : folders[0].id,
    animal: isAnimal(p.animal) ? p.animal : "beaver",
  }));
  const tasks = (Array.isArray(d.tasks) ? d.tasks : []).map((t, i) => ({
    ...t,
    order: typeof t.order === "number" ? t.order : i,
  }));
  const timers = d.timers && typeof d.timers === "object" ? d.timers : {};
  const activeFolder = folderIds.has(d.activeFolder) ? d.activeFolder : folders[0].id;
  const inFolder = projects.filter(p => p.folderId === activeFolder);
  const activeProject = inFolder.some(p => p.id === d.activeProject) ? d.activeProject : inFolder[0]?.id ?? "";
  // Ältere Stände ohne Stundenplan bekommen den Startplan
  const lectures = sanitizeLectures(d.lectures);
  const events = (Array.isArray(d.events) ? d.events : []).filter(
    e => e && typeof e.title === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
  );
  return { version: 2, folders, projects, activeFolder, activeProject, tasks, timers, lectures, events };
}

// Beliebigen gespeicherten oder importierten Stand ins aktuelle Format bringen; null = unbrauchbar
export function normalize(d: any): Data | null {
  if (d?.version === 2 && Array.isArray(d.folders)) return sanitize(d);
  if (Array.isArray(d?.tabs) && d.tabs.length) return sanitize(migrateV1(d));
  return null;
}

export function load(): Data {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORE);
  } catch {}
  if (!raw) return fresh();
  try {
    const d = JSON.parse(raw);
    if (d?.version === 2) return sanitize(d);
    if (Array.isArray(d?.tabs) && d.tabs.length) {
      // Originaldaten einmalig sichern, bevor sie im neuen Format überschrieben werden
      try {
        if (!localStorage.getItem(BACKUP_V1)) localStorage.setItem(BACKUP_V1, raw);
      } catch {}
      return sanitize(migrateV1(d));
    }
  } catch {
    try {
      localStorage.setItem(`${STORE}-unreadable-${Date.now()}`, raw);
    } catch {}
  }
  return fresh();
}

export function save(d: Data) {
  try {
    localStorage.setItem(STORE, JSON.stringify(d));
  } catch {}
}
