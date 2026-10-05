import { P } from "./sprites";

// Kräftigere Töne der Palette, damit das Konfetti auf dem hellen Grund sichtbar ist
const COLORS = [P.b1, P.b2, P.b3, P.b4, P.g2, P.g3, P.g4];
const LIFE = 750; // ms, deutlich unter einer Sekunde

type Bit = { x: number; y: number; vx: number; vy: number; s: number; c: string; age: number; max: number; spin: number };

// Kurzes Pixel-Konfetti auf einer Canvas, die über dem Fenster liegt
export function createConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  let bits: Bit[] = [];
  let raf = 0;
  let last = 0;

  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const tick = (now: number) => {
    const dt = Math.min(now - last, 40);
    last = now;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    bits = bits.filter(b => (b.age += dt) < b.max);
    for (const b of bits) {
      const k = dt / 16;
      b.vy += 0.16 * k;
      b.vx *= 0.97;
      b.x += b.vx * k;
      b.y += b.vy * k;
      const t = b.age / b.max;
      ctx.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1;
      ctx.fillStyle = b.c;
      const w = Math.max(1, Math.round(b.s * Math.abs(Math.cos(b.age * b.spin))));
      ctx.fillRect(Math.round(b.x - w / 2), Math.round(b.y - b.s / 2), w, b.s);
    }
    ctx.globalAlpha = 1;
    raf = bits.length ? requestAnimationFrame(tick) : 0;
  };

  return {
    // from: Element, von dem das Konfetti ausgeht (das Häkchen)
    burst(from: Element, small = false) {
      if (reduce.matches) return;
      fit();
      const c = canvas.getBoundingClientRect();
      const r = from.getBoundingClientRect();
      const x = r.left + r.width / 2 - c.left;
      const y = r.top + r.height / 2 - c.top;
      const n = small ? 12 : 26;
      const speed = small ? 2.2 : 3.4;
      for (let i = 0; i < n; i++) {
        // Kegel nach oben, leicht nach rechts, weil das Häkchen am linken Rand sitzt
        const a = -Math.PI / 2 + 0.45 + (Math.random() - 0.5) * 2.1;
        const v = speed * (0.5 + Math.random() * 0.7);
        bits.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          s: small ? 3 : 4,
          c: COLORS[Math.floor(Math.random() * COLORS.length)],
          age: 0,
          max: LIFE * (0.7 + Math.random() * 0.3),
          spin: 0.01 + Math.random() * 0.02,
        });
      }
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      bits = [];
    },
  };
}
