import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { normalize } from "./data";
import type { Data } from "./data";

// Sicherungsdatei: alle Daten plus Einstellungen. Ältere Stände werden beim Import migriert.
export type Backup = { app: "taskwood"; format: 1; exportedAt: string; data: Data; settings: object };

export const makeBackup = (data: Data, settings: object) =>
  JSON.stringify({ app: "taskwood", format: 1, exportedAt: new Date().toISOString(), data, settings } satisfies Backup, null, 2);

// Liest eine Sicherung; akzeptiert auch einen nackten Datenstand (z. B. aus localStorage kopiert)
export function parseBackup(text: string): { data: Data; settings: Record<string, unknown> } {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("unreadable");
  }
  const data = normalize(raw?.data ?? raw);
  if (!data) throw new Error("unknown");
  const settings = raw?.settings && typeof raw.settings === "object" ? raw.settings : {};
  return { data, settings };
}

const backupName = () => `taskwood-backup-${new Date().toISOString().slice(0, 10)}.json`;

export async function writeBackupFile(path: string, data: Data, settings: object) {
  await invoke("write_text", { path, contents: makeBackup(data, settings) });
}

export async function readBackupFile(path: string) {
  return parseBackup(await invoke<string>("read_text", { path }));
}

// Mit Dateidialog; null = abgebrochen
export async function exportWithDialog(data: Data, settings: object) {
  const path = await save({ defaultPath: backupName(), filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path) return null;
  await writeBackupFile(path, data, settings);
  return path;
}

export async function importWithDialog() {
  const path = await open({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
  if (!path || Array.isArray(path)) return null;
  return readBackupFile(path);
}

// Startparameter --export/--import (für Umzug und Tests ohne Klicks)
export const cliTask = () => invoke<[string, string] | null>("cli_task").catch(() => null);
export const quitApp = () => invoke("quit");
