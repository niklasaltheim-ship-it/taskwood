import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const MAX = 16; // Grad
const STOP_AFTER = 160; // ms ohne Move-Event = losgelassen
const SETTLE_MAX = 1500; // spätestens dann steht das Tier wieder gerade

// Lässt das Element (mit transform-origin oben) beim Verschieben des Fensters wie am Nackenfell
// gehalten baumeln: oben führt, unten schwingt nach. Beim Loslassen federt es per Feder-Simulation aus.
// onHeld meldet Beginn und Ende des Verschiebens.
export function useDangle(onHeld: (held: boolean) => void, enabled = true) {
  const el = useRef<HTMLElement | null>(null);
  const held = useRef(onHeld);
  held.current = onHeld;
  const on = useRef(enabled);
  on.current = enabled;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const win = getCurrentWindow();
    let scale = 1;
    win.scaleFactor().then(s => (scale = s)).catch(() => {});

    let angle = 0;
    let vel = 0;
    let target = 0;
    let raf = 0;
    let stop = 0;
    let settle = 0;
    // Beim Start setzt Windows die Fensterposition, das ist kein Verschieben
    const readyAt = performance.now() + 1000;
    let moving = false;
    let last: { x: number; t: number } | null = null;

    const step = () => {
      vel = (vel + (target - angle) * 0.1) * 0.84;
      angle = Math.max(-MAX * 1.3, Math.min(MAX * 1.3, angle + vel));
      const node = el.current;
      if (!moving && Math.abs(angle) < 0.05 && Math.abs(vel) < 0.05) {
        if (node) node.style.transform = "";
        raf = 0;
        return;
      }
      if (node) node.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      raf = requestAnimationFrame(step);
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      angle = vel = target = 0;
      if (el.current) el.current.style.transform = "";
    };

    const release = () => {
      moving = false;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => !moving && reset(), SETTLE_MAX);
      target = 0;
      last = null;
      held.current(false);
      const node = el.current;
      if (node) {
        // kurzes Abfedern nach unten
        node.classList.remove("land");
        void node.offsetWidth;
        node.classList.add("land");
        window.setTimeout(() => node.classList.remove("land"), 450);
      }
    };

    const unlisten = win.onMoved(({ payload }) => {
      const now = performance.now();
      if (now < readyAt || !on.current) return;
      if (last && now - last.t < STOP_AFTER) {
        const dt = Math.max(now - last.t, 8);
        const vx = ((payload.x - last.x) / scale / dt) * 16; // logische Pixel pro Frame
        target = Math.max(-MAX, Math.min(MAX, target * 0.5 + vx * 0.9));
      }
      last = { x: payload.x, t: now };
      if (!moving) {
        moving = true;
        el.current?.classList.remove("land");
        held.current(true);
      }
      window.clearTimeout(stop);
      stop = window.setTimeout(release, STOP_AFTER);
      if (!raf) raf = requestAnimationFrame(step);
    });

    return () => {
      unlisten.then(f => f());
      cancelAnimationFrame(raf);
      window.clearTimeout(stop);
      window.clearTimeout(settle);
    };
  }, []);

  return el;
}
