import { availableMonitors, currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize, PhysicalPosition } from "@tauri-apps/api/window";

const win = getCurrentWindow();
const MARGIN = 8;
const TASKBAR = 48; // Platz für die Windows-Taskleiste unten

// Position vor dem Verschieben, damit das Fenster beim Verkleinern zurückspringt
let home: { x: number; y: number } | null = null;

// Fenster auf die gewünschte Größe bringen. Ragt es dann aus dem Bildschirm, wird es
// nach links bzw. oben gerückt; ist der Bildschirm zu klein, wird es begrenzt.
export async function fitWindow(width: number, height: number) {
  let w = width;
  let h = height;
  try {
    const [mon, pos, sf] = await Promise.all([currentMonitor(), win.outerPosition(), win.scaleFactor()]);
    if (mon) {
      const mx = mon.position.x / sf;
      const my = mon.position.y / sf;
      const mw = mon.size.width / sf;
      const mh = mon.size.height / sf;
      w = Math.min(w, mw - 2 * MARGIN);
      h = Math.min(h, mh - TASKBAR - MARGIN);
      const x = pos.x / sf;
      const y = pos.y / sf;
      // Erst zurück an die alte Stelle, falls wir vorher verschoben hatten
      const from = home ?? { x, y };
      const nx = Math.max(mx + MARGIN, Math.min(from.x, mx + mw - w - MARGIN));
      const ny = Math.max(my + MARGIN, Math.min(from.y, my + mh - h - TASKBAR));
      const moved = Math.round(nx) !== Math.round(from.x) || Math.round(ny) !== Math.round(from.y);
      home = moved ? from : null;
      if (Math.round(nx) !== Math.round(x) || Math.round(ny) !== Math.round(y)) {
        await win.setPosition(new LogicalPosition(nx, ny));
      }
    }
  } catch {}
  await win.setSize(new LogicalSize(w, h));
}

// Kleine Ansicht: zurück an die Stelle, an der das Tier vorher saß
export async function shrinkWindow(width: number, height: number) {
  try {
    if (home) {
      await win.setPosition(new LogicalPosition(home.x, home.y));
      home = null;
    }
  } catch {}
  await win.setSize(new LogicalSize(width, height));
}

// Fenster wurde von Hand verschoben: neue Stelle gilt
export function forgetHome() {
  home = null;
}

const MIN_VISIBLE = 48; // so viel vom Fenster muss auf einem Bildschirm liegen, damit man es greifen kann

// Fenster zurück auf einen Bildschirm holen, falls es (fast) ganz außerhalb liegt,
// z. B. nachdem ein zweiter Monitor abgesteckt wurde.
export async function ensureOnScreen() {
  try {
    const [mons, pos, size] = await Promise.all([availableMonitors(), win.outerPosition(), win.outerSize()]);
    if (!mons.length) return;
    const x0 = pos.x;
    const y0 = pos.y;
    const x1 = pos.x + size.width;
    const y1 = pos.y + size.height;
    const visible = (m: (typeof mons)[number]) => {
      const w = Math.min(x1, m.position.x + m.size.width) - Math.max(x0, m.position.x);
      const h = Math.min(y1, m.position.y + m.size.height) - Math.max(y0, m.position.y);
      return w >= MIN_VISIBLE * m.scaleFactor && h >= MIN_VISIBLE * m.scaleFactor;
    };
    if (mons.some(visible)) return;
    // Nächstgelegenen Bildschirm wählen und das Fenster vollständig hineinschieben
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const dist = (m: (typeof mons)[number]) => {
      const dx = Math.max(m.position.x - cx, 0, cx - (m.position.x + m.size.width));
      const dy = Math.max(m.position.y - cy, 0, cy - (m.position.y + m.size.height));
      return dx * dx + dy * dy;
    };
    const m = mons.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const margin = MARGIN * m.scaleFactor;
    const nx = Math.min(Math.max(x0, m.position.x + margin), m.position.x + m.size.width - size.width - margin);
    const ny = Math.min(Math.max(y0, m.position.y + margin), m.position.y + m.size.height - size.height - TASKBAR * m.scaleFactor);
    home = null;
    await win.setPosition(new PhysicalPosition(Math.round(nx), Math.round(ny)));
  } catch {}
}
