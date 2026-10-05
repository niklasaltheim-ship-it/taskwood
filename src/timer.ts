import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { Timer } from "./data";

export const PRESETS = [15, 25, 50];

export const remaining = (t: Timer, now: number) => (t.endsAt ? Math.max(0, t.endsAt - now) : t.left ?? 0);

// 25:00, 4:05, 1:02:00
export function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// Sehr kurz für den Ring am Tier: Minuten, in der letzten Minute Sekunden
export const tiny = (ms: number) => (ms >= 60000 ? String(Math.ceil(ms / 60000)) : `${Math.ceil(ms / 1000)}s`);

let audio: AudioContext | null = null;

// Beim Start des Timers (Klick) aufrufen, damit der Ton später ohne Nutzeraktion abgespielt werden darf
export function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
  } catch {}
}

// Kurzer, leiser Zwei-Ton-Gong
export function chime() {
  try {
    unlockAudio();
    const ctx = audio!;
    const t0 = ctx.currentTime + 0.02;
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = t0 + i * 0.22;
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.07, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {}
}

export async function ensureNotifyPermission() {
  try {
    if (!(await isPermissionGranted())) await requestPermission();
  } catch {}
}

export async function notify(title: string, body: string) {
  try {
    if (await isPermissionGranted()) sendNotification({ title, body });
  } catch {}
}
