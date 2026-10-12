import { useCallback, useEffect, useRef, useState } from "react";
import Pet from "../pet/Pet";
import type { PetEvent } from "../pet/Pet";
import type { Wear } from "../pet/wear";
import { animalName } from "../sprites";
import type { AnimalKind } from "../sprites";
import { createConfetti } from "../confetti";
import { locale, t } from "../i18n";
import { cheer, ding, klock, oops, saw, setMuted, splash } from "./sound";
import type { DamScores } from "./scores";
import "./game.css";

// "Dammbau": Ein Stamm schwingt über dem Damm, Klick oder Leertaste lässt ihn fallen. Was übersteht,
// wird abgesägt. Perfekte Treffer geben Bonus, ab drei in Folge wächst der Stamm wieder.
// Alles in Spiel-Pixeln (GW breit), skaliert mit ganzzahligem Faktor, damit die Pixel scharf bleiben.

export type DemoMode = "perfect" | "close" | "miss" | "record" | "pause";

type Props = {
  animal: AnimalKind;
  wear?: Wear;
  calm: boolean;
  sound: boolean;
  onSound: (on: boolean) => void;
  scores: DamScores;
  // Ergebnis speichern; gibt zurück, ob es ein Rekord ist
  onSave: (score: number, layers: number) => { record: boolean; animalRecord: boolean };
  demo?: DemoMode | null; // Testansicht: Zustand vorführen, nichts speichern
  onClose: () => void;
  onDrag: () => void;
};

const GW = 128; // Breite der Spielwelt
const LOG_H = 7;
const START_W = 56;
const PERFECT = 2; // so viele Pixel Abweichung zählen noch als perfekt
const GROW = 6;
const SWING_GAP = 30; // Abstand des schwingenden Stamms über der Dammkrone (Platz fürs Tier)
const GRAVITY = 520;
const WATER_VIEW = 30; // so viel Wasser ist unten zu sehen, solange der Damm niedrig ist
const PET_FEET = 39; // Fußlinie in der Tier-Leinwand (Pixel von oben)
const PET_W = 40;
const PET_H = 42;
const K = "#333D29";

type Theme = { dark: string; mid: string; light: string; ring: string; core: string; birch?: boolean; deco: keyof typeof DECO };

// Stämme und Deko je Tier
const THEMES: Record<AnimalKind, Theme> = {
  beaver: { dark: "#582F0E", mid: "#7F4F24", light: "#936639", ring: "#B6AD90", core: "#A68A64", deco: "twig" },
  squirrel: { dark: "#6A3F22", mid: "#94592F", light: "#B57A4C", ring: "#D2A578", core: "#A86F42", deco: "nut" },
  hedgehog: { dark: "#5E4630", mid: "#8A6A4A", light: "#A88763", ring: "#C9A27E", core: "#9C7A5C", deco: "apple" },
  rabbit: { dark: "#6B5949", mid: "#8F8374", light: "#B8AA98", ring: "#D8CFC0", core: "#B8AA98", deco: "carrot" },
  owl: { dark: "#333D29", mid: "#E4DFD0", light: "#F4F0E4", ring: "#C2B89F", core: "#A68A64", birch: true, deco: "book" },
  fox: { dark: "#5A2E18", mid: "#8A4A2A", light: "#A86A44", ring: "#D08A55", core: "#B5622F", deco: "mushroom" },
  raccoon: { dark: "#414833", mid: "#656D4A", light: "#8A9270", ring: "#C2C5AA", core: "#A4AC86", deco: "shell" },
};

const DECO_COLORS: Record<string, string> = {
  M: "#582F0E", N: "#7F4F24", R: "#B4483A", h: "#A4AC86", g: "#656D4A", O: "#D9822F", w: "#F4F0E4", c: "#D8CFC0", a: "#936639", b: "#3E6A8A",
};
const DECO = {
  twig: [".h.h", "aaaa"],
  nut: ["MMM", "NNN", ".N."],
  apple: ["..h", "RR.", "RRR", ".R."],
  carrot: ["h...", "gOOO", ".OO."],
  book: ["bbbb", "wwww", "NNNN"],
  mushroom: [".RR.", "RwRR", ".ww."],
  shell: [".cc.", "cwwc", "c..c"],
};

type Log = { x: number; w: number; seed: number };
type Piece = { x: number; h: number; w: number; vx: number; vh: number; rot: number; vr: number; seed: number };
type Drop = { x: number; w: number; h: number; vh: number; seed: number };
type Particle = { x: number; h: number; vx: number; vh: number; age: number; max: number; c: string };
type Phase = "ready" | "swing" | "drop" | "falling" | "over";
type AnimalState = { x: number; h: number; fromX: number; fromH: number; toX: number; toH: number; hop: number; vh: number; mode: "sit" | "hop" | "fall" | "under" | "surface"; t: number };
type Ui = { phase: Phase; score: number; combo: number; layers: number; perfects: number; paused: boolean; record: boolean; animalRecord: boolean };
type Float = { id: number; text: string; x: number; y: number; big?: boolean };

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = ((h ^ (h >>> 13)) * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rgb = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `rgb(${x.map((v, i) => Math.round(lerp(v, y[i], clamp(k, 0, 1)))).join(",")})`;
};

// Tageszeit über die Höhe: Tag, goldener Nachmittag, Abend, Nacht. p = 0..1
const SKY: [number, string, string][] = [
  [0, "#BFD3CC", "#E4E9DA"],
  [0.35, "#D9B98A", "#F0DDB4"],
  [0.62, "#7A5A6E", "#C98A6E"],
  [0.85, "#1E2A2E", "#3A4A48"],
  [1, "#141C1F", "#2A3634"],
];
function skyAt(p: number): [string, string] {
  for (let i = 1; i < SKY.length; i++) {
    const [b, top, bottom] = SKY[i];
    const [a, top0, bottom0] = SKY[i - 1];
    if (p <= b) {
      const k = (p - a) / (b - a);
      return [mix(top0, top, k), mix(bottom0, bottom, k)];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2]];
}

function sprite(c: CanvasRenderingContext2D, map: string[], x: number, y: number) {
  map.forEach((row, r) =>
    [...row].forEach((ch, i) => {
      if (ch === ".") return;
      c.fillStyle = DECO_COLORS[ch];
      c.fillRect(x + i, y + r, 1, 1);
    })
  );
}

function drawLog(c: CanvasRenderingContext2D, x0: number, y0: number, w0: number, th: Theme, seed: number, top: boolean) {
  const x = Math.round(x0);
  const y = Math.round(y0);
  const w = Math.max(1, Math.round(w0));
  c.fillStyle = K;
  c.fillRect(x - 1, y - 1, w + 2, LOG_H + 2);
  c.fillStyle = th.mid;
  c.fillRect(x, y, w, LOG_H);
  c.fillStyle = th.light;
  c.fillRect(x, y, w, 1);
  c.fillStyle = th.dark;
  c.fillRect(x, y + LOG_H - 1, w, 1);
  // Rinde: kurze Striche (bei der Birke dunkle Flecken)
  for (let i = 0; i < w - 1; i++) {
    const r = hash(seed, i);
    if (r % (th.birch ? 6 : 8) === 0) c.fillRect(x + i, y + 2 + ((r >>> 5) % 3), th.birch ? 2 : 2 + ((r >>> 9) % 3), 1);
  }
  // Schnittflächen mit Jahresring
  if (w >= 5) {
    c.fillStyle = th.ring;
    c.fillRect(x, y + 1, 2, LOG_H - 2);
    c.fillRect(x + w - 2, y + 1, 2, LOG_H - 2);
    c.fillStyle = th.core;
    c.fillRect(x, y + 3, 1, 1);
    c.fillRect(x + w - 1, y + 3, 1, 1);
  }
  // Deko vorne am Stamm, beim obersten auch oben drauf
  const map = DECO[th.deco];
  const dw = map[0].length;
  if (w >= dw + 8) {
    const n = Math.max(1, Math.floor(w / 26));
    for (let k = 0; k < n; k++) {
      const r = hash(seed, 100 + k);
      if (r % 3 === 0) continue;
      const px = x + 4 + (r % Math.max(1, w - dw - 8));
      sprite(c, map, px, y + LOG_H - map.length - 1);
    }
  }
  if (top && w >= dw + 4) sprite(c, map, x + 2 + (hash(seed, 7) % Math.max(1, w - dw - 4)), y - map.length);
}

function drawPine(c: CanvasRenderingContext2D, x: number, base: number, size: number, col: string) {
  c.fillStyle = col;
  for (let i = 0; i < size; i++) {
    const half = Math.floor(((i % Math.ceil(size / 3)) + Math.floor(i / Math.ceil(size / 3)) + 1) * 0.9);
    c.fillRect(x - half, base - size + i, half * 2 + 1, 1);
  }
  c.fillRect(x, base - 1, 1, 2);
}

export default function DamGame(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const petBox = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const fxCanvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(4);
  const [world, setWorld] = useState({ w: GW * 4, h: 720, xo: 0 });
  const [ui, setUi] = useState<Ui>({ phase: "ready", score: 0, combo: 0, layers: 0, perfects: 0, paused: false, record: false, animalRecord: false });
  const [floats, setFloats] = useState<Float[]>([]);
  const [petEv, setPetEv] = useState<PetEvent | null>(null);
  const [held, setHeld] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; at: number } | null>(null);
  const [tab, setTab] = useState<"all" | "animal">("all");
  const props = useRef(p);
  props.current = p;
  const theme = THEMES[p.animal];

  useEffect(() => setMuted(!p.sound), [p.sound]);

  const view = useRef({ S: 4, VH: 180, VW: GW, XO: 0 }); // VW: sichtbare Breite, XO: Versatz der Spielwelt darin
  const g = useRef(newGame());

  function newGame() {
    const base: Log = { x: (GW - START_W) / 2, w: START_W, seed: 1 };
    return {
      logs: [base] as Log[],
      swing: { phase: Math.PI / 2, speed: 1.25, w: START_W, seed: 2 },
      drop: null as Drop | null,
      pieces: [] as Piece[],
      parts: [] as Particle[],
      cam: 0,
      shake: 0,
      animal: { x: GW / 2, h: LOG_H, fromX: 0, fromH: 0, toX: 0, toH: 0, hop: 0, vh: 0, mode: "sit", t: 0 } as AnimalState,
      phase: "ready" as Phase,
      score: 0,
      combo: 0,
      perfects: 0,
      paused: false,
      time: 0,
      nightP: 0,
      demoCount: 0,
      demoDiff: 0,
      lastSide: 0,
      floatId: 0,
      saved: false,
    };
  }

  const sync = () => {
    const s = g.current;
    setUi(u => ({ ...u, phase: s.phase, score: s.score, combo: s.combo, layers: s.logs.length - 1, perfects: s.perfects, paused: s.paused }));
  };

  const pet = (type: string) => setPetEv({ type, at: Date.now() });
  const say = (text: string) => setBubble({ text, at: Date.now() });

  const float = (text: string, h: number, big = false) => {
    const s = g.current;
    const id = ++s.floatId;
    const top = s.logs[s.logs.length - 1];
    setFloats(f => [...f, { id, text, x: top.x + top.w / 2, y: s.cam - h, big }]);
    window.setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1000);
  };

  const splashAt = (x: number, big: boolean) => {
    const s = g.current;
    const n = props.current.calm ? 5 : big ? 18 : 9;
    for (let i = 0; i < n; i++) {
      s.parts.push({
        x: x + (Math.random() - 0.5) * 6,
        h: 0,
        vx: (Math.random() - 0.5) * (big ? 60 : 40),
        vh: 40 + Math.random() * (big ? 70 : 45),
        age: 0,
        max: 0.6 + Math.random() * 0.4,
        c: Math.random() < 0.5 ? "#F4F0E4" : "#9FC1C6",
      });
    }
    splash(big);
  };

  const shake = (amount: number) => {
    if (!props.current.calm) g.current.shake = Math.max(g.current.shake, amount);
  };

  const start = () => {
    g.current = newGame();
    g.current.phase = "swing";
    g.current.cam = view.current.VH - WATER_VIEW;
    setHeld(false);
    setBubble(null);
    setUi(u => ({ ...u, record: false, animalRecord: false }));
    sync();
  };

  const finish = () => {
    const s = g.current;
    s.phase = "over";
    sync();
    if (s.saved) return;
    s.saved = true;
    const layers = s.logs.length - 1;
    const demo = props.current.demo;
    const res = demo ? { record: false, animalRecord: false } : props.current.onSave(s.score, layers);
    setUi(u => ({ ...u, record: res.record, animalRecord: res.animalRecord }));
    if (res.record || res.animalRecord) celebrate();
  };

  const celebrate = () => {
    pet("allDone");
    cheer();
    const fx = fxCanvas.current && createConfetti(fxCanvas.current);
    if (fx) {
      const times = props.current.calm ? [80] : [80, 330, 630, 980];
      times.forEach(ms =>
        window.setTimeout(() => {
          const from = wrap.current?.querySelector(".dam-record") ?? scoreRef.current;
          if (from) fx.burst(from);
        }, ms)
      );
      window.setTimeout(() => fx.stop(), 2500);
    }
  };

  // ---------- Spiellogik ----------

  const topH = () => g.current.logs.length * LOG_H;
  // Schwingt um die Mitte des obersten Stamms, an den Enden ganz daneben (sonst könnte man nie verfehlen)
  const swingX = () => {
    const s = g.current;
    const top = s.logs[s.logs.length - 1];
    const amp = s.swing.w + 6;
    return top.x + top.w / 2 - s.swing.w / 2 + amp * Math.sin(s.swing.phase);
  };

  const dropLog = () => {
    const s = g.current;
    if (s.paused) return;
    if (s.phase === "ready" || s.phase === "over") return start();
    if (s.phase !== "swing") return;
    s.drop = { x: swingX(), w: s.swing.w, h: topH() + SWING_GAP, vh: 0, seed: s.swing.seed };
    s.phase = "drop";
  };

  const land = (d: Drop) => {
    const s = g.current;
    const prev = s.logs[s.logs.length - 1];
    const left = Math.max(d.x, prev.x);
    const right = Math.min(d.x + d.w, prev.x + prev.w);
    const overlap = right - left;
    const h = topH();
    if (overlap <= 0.5) {
      // Verfehlt: Stamm fällt ins Wasser, das Tier erschrickt und plumpst hinterher
      const dir = d.x > prev.x ? 1 : -1;
      s.pieces.push({ x: d.x, h, w: d.w, vx: dir * 26, vh: 10, rot: 0, vr: dir * 2.2, seed: d.seed });
      s.drop = null;
      s.phase = "falling";
      s.combo = 0;
      s.animal = { ...s.animal, mode: "fall", vh: 70, t: 0 };
      setHeld(true);
      say(t(pickOf(["Huch!", "Oh nein!", "Hilfe!"])));
      oops();
      shake(4);
      sync();
      return;
    }
    const dx = d.x - prev.x;
    let x = left;
    let w = overlap;
    let bonus = 0;
    if (Math.abs(dx) <= PERFECT) {
      s.combo++;
      s.perfects++;
      x = prev.x;
      w = prev.w;
      if (s.combo >= 3 && w < START_W) {
        w = Math.min(START_W, w + GROW);
        x = clamp(prev.x - (w - prev.w) / 2, 0, GW - w);
      }
      bonus = Math.min(s.combo, 5) - 1;
      ding(s.combo);
      pet("done");
      float(s.combo >= 2 ? `${t("Perfekt!")} ×${s.combo}` : t("Perfekt!"), h + LOG_H + 10, true);
      if (s.combo >= 3 && w > prev.w) window.setTimeout(() => float(t("Stamm wächst!"), h + LOG_H + 20), 350);
    } else {
      s.combo = 0;
      // Überstand absägen
      const cutRight = dx > 0;
      const px = cutRight ? right : d.x;
      const pw = cutRight ? d.x + d.w - right : left - d.x;
      s.pieces.push({ x: px, h, w: pw, vx: (cutRight ? 1 : -1) * 18, vh: 6, rot: 0, vr: (cutRight ? 1 : -1) * (1.5 + Math.random()), seed: d.seed + 7 });
      saw();
      if (overlap / d.w < 0.4) {
        pet("land"); // wackelt
        shake(2);
        float(t("Knapp!"), h + LOG_H + 10);
      }
    }
    klock(1 + Math.min(0.5, s.logs.length * 0.012));
    s.logs.push({ x, w, seed: d.seed });
    s.score += 1 + bonus;
    // Tier hüpft auf den neuen Stamm
    const a = s.animal;
    s.animal = { ...a, mode: "hop", fromX: a.x, fromH: a.h, toX: x + w / 2, toH: h + LOG_H, hop: 0 };
    // Nächster Stamm: so breit wie der verbleibende Teil, etwas schneller, von der anderen Seite
    s.lastSide = s.lastSide ? -s.lastSide : 1;
    s.swing = { phase: (s.lastSide * Math.PI) / 2, speed: Math.min(3.6, 1.25 * Math.pow(1.05, s.logs.length - 1)), w, seed: hash(s.logs.length, 9) % 100000 };
    s.phase = "swing";
    s.drop = null;
    sync();
  };

  // Testansicht: Autopilot
  const demoStep = () => {
    const s = g.current;
    const demo = props.current.demo;
    if (s.phase !== "swing" || !demo || !["perfect", "close", "miss"].includes(demo)) return;
    const prev = s.logs[s.logs.length - 1];
    const limit = demo === "perfect" ? 6 : demo === "close" ? 3 : 3;
    if (s.demoCount >= limit) return;
    let want = prev.x;
    if (demo === "close" && s.demoCount < 2) want = prev.x + prev.w * 0.64;
    if (demo === "miss" && s.demoCount >= 2) want = prev.x + prev.w + 3;
    // auslösen, sobald der Stamm die Zielstelle überquert
    const diff = swingX() - want;
    if (s.demoDiff !== 0 && Math.sign(diff) !== Math.sign(s.demoDiff)) {
      s.demoCount++;
      s.demoDiff = 0;
      s.drop = { x: want, w: s.swing.w, h: topH() + SWING_GAP, vh: 0, seed: s.swing.seed };
      s.phase = "drop";
      return;
    }
    s.demoDiff = diff;
  };

  const update = (dt: number) => {
    const s = g.current;
    const { VH } = view.current;
    s.time += dt;
    if (s.phase === "swing") {
      s.swing.phase += s.swing.speed * dt;
      demoStep();
    }
    if (s.phase === "drop" && s.drop) {
      s.drop.vh -= GRAVITY * dt;
      s.drop.h += s.drop.vh * dt;
      if (s.drop.h <= topH()) land(s.drop);
    }
    // Abgesägte Stücke fallen ins Wasser
    for (const pc of s.pieces) {
      pc.vh -= GRAVITY * dt;
      pc.h += pc.vh * dt;
      pc.x += pc.vx * dt;
      pc.rot += pc.vr * dt;
    }
    s.pieces = s.pieces.filter(pc => {
      if (pc.h > -2) return true;
      splashAt(pc.x + pc.w / 2, pc.w > 30);
      return false;
    });
    for (const pt of s.parts) {
      pt.age += dt;
      pt.vh -= 260 * dt;
      pt.h += pt.vh * dt;
      pt.x += pt.vx * dt;
    }
    s.parts = s.parts.filter(pt => pt.age < pt.max && pt.h > -3);

    // Tier
    const a = s.animal;
    a.t += dt;
    if (a.mode === "hop") {
      a.hop = Math.min(1, a.hop + dt / 0.32);
      a.x = lerp(a.fromX, a.toX, a.hop);
      a.h = lerp(a.fromH, a.toH, a.hop) + Math.sin(Math.PI * a.hop) * 8;
      if (a.hop >= 1) a.mode = "sit";
    } else if (a.mode === "sit") {
      const top = s.logs[s.logs.length - 1];
      a.x = top.x + top.w / 2;
      a.h = topH();
    } else if (a.mode === "fall") {
      a.vh -= GRAVITY * 0.8 * dt;
      a.h += a.vh * dt;
      if (a.h < -8) {
        a.mode = "under";
        a.t = 0;
        splashAt(a.x, true);
        shake(3);
      }
    } else if (a.mode === "under") {
      a.h = Math.max(-46, a.h - 60 * dt);
      if (a.t > 0.9) {
        a.mode = "surface";
        a.t = 0;
        a.h = -17;
        setHeld(false); // spielt "Landen": benommen und prustend
        splashAt(a.x, false);
        say(t(pickOf(["Prust!", "Pfff… nass!", "Blubb!"])));
      }
    } else if (a.mode === "surface") {
      a.h = -17 + Math.sin(a.t * 3) * 0.8;
      if (a.t > 1.6 && s.phase === "falling") finish();
    }

    // Kamera: Dammkrone mit schwingendem Stamm im Blick, beim Sturz dem Tier nach unten folgen
    const minCam = VH - WATER_VIEW;
    const target = s.phase === "falling" || s.phase === "over" ? Math.max(minCam, Math.min(s.cam, a.h + VH * 0.55)) : Math.max(minCam, topH() + SWING_GAP + LOG_H + 30);
    s.cam += (target - s.cam) * Math.min(1, dt * (s.phase === "falling" ? 2.2 : 3.5));
    s.nightP = lerp(s.nightP, clamp((s.logs.length - 1) / 45, 0, 1), Math.min(1, dt * 0.8));
    s.shake = Math.max(0, s.shake - dt * 12);
  };

  // ---------- Zeichnen ----------

  const draw = () => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    const s = g.current;
    const { S, VH, VW, XO } = view.current;
    // Spielwelt (GW breit) mittig; Himmel, Ufer und Wasser reichen über die ganze Breite
    c.setTransform(S, 0, 0, S, XO * S, 0);
    const L = -XO;
    const R = VW - XO;
    c.imageSmoothingEnabled = false;
    const ox = s.shake ? Math.round((Math.random() - 0.5) * s.shake) : 0;
    const oy = s.shake ? Math.round((Math.random() - 0.5) * s.shake) : 0;
    const cam = Math.round(s.cam);
    const sy = (h: number) => cam - h + oy;
    const night = clamp((s.nightP - 0.6) / 0.3, 0, 1);

    // Himmel in Bändern
    const [top, bottom] = skyAt(s.nightP);
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      c.fillStyle = interp(top, bottom, i / (bands - 1));
      c.fillRect(L, Math.floor((i * VH) / bands), R - L, Math.ceil(VH / bands) + 1);
    }
    // Sterne
    if (night > 0) {
      c.globalAlpha = night;
      for (let i = 0; i < 40; i++) {
        const r = hash(i, 77);
        const x = L + (r % (R - L));
        const y = ((r >>> 8) % 400) - ((cam * 0.1) % 400);
        const yy = ((y % VH) + VH) % VH;
        c.fillStyle = (r >>> 3) % 5 === 0 ? "#F0DDB4" : "#F4F0E4";
        c.fillRect(x, yy, 1, 1);
      }
      c.globalAlpha = 1;
    }
    // Sonne bzw. Mond
    const sunX = Math.round(18 + s.nightP * 86);
    const sunY = Math.round(26 + Math.sin(s.nightP * Math.PI) * -6 + s.nightP * 14);
    c.fillStyle = night > 0.5 ? "#E9E4D2" : mix("#F2D27A", "#E07A4A", clamp(s.nightP / 0.6, 0, 1));
    c.fillRect(sunX - 3, sunY - 4, 7, 9);
    c.fillRect(sunX - 4, sunY - 3, 9, 7);
    if (night > 0.5) {
      c.fillStyle = interp(top, bottom, 0.25);
      c.fillRect(sunX - 1, sunY - 4, 5, 6);
    }
    // Wolken (langsamer als der Damm)
    for (let k = 0; k < 8; k++) {
      const ch = 60 + k * 85;
      const y = Math.round((cam - ch) * 0.55 + VH * 0.15);
      if (y < -10 || y > VH) continue;
      const span = R - L + 40;
      const x = L + Math.round((((hash(k, 3) % span) + s.time * (k % 2 ? 2.5 : -2)) % span + span) % span) - 20;
      c.fillStyle = mix("#F4F0E4", "#5A6664", night);
      c.globalAlpha = 0.85;
      c.fillRect(x, y, 18, 3);
      c.fillRect(x + 3, y - 2, 9, 2);
      c.fillRect(x + 8, y - 3, 6, 1);
      c.globalAlpha = 1;
    }
    // Ufer mit Tannen
    const wl = sy(0);
    if (wl < VH + 30) {
      const far = mix("#A4AC86", "#2A3432", night * 0.9);
      const near = mix("#414833", "#161E1C", night * 0.9);
      for (let x = L - 6, i = 0; x < R + 6; x += 13, i++) drawPine(c, x + (hash(i, 5) % 5), wl, 12 + (hash(i, 1) % 6), far);
      for (let x = L - 4, i = 0; x < R + 8; x += 17, i++) drawPine(c, x + (hash(i, 2) % 7), wl, 16 + (hash(i, 4) % 8), near);
    }

    // Damm-Fuß unter Wasser
    const base = s.logs[0];
    c.fillStyle = "#3B2A1A";
    c.fillRect(Math.round(base.x) - 6, wl, Math.round(base.w) + 12, VH);
    // Stämme
    s.logs.forEach((l, i) => {
      const y = sy((i + 1) * LOG_H);
      if (y > VH + 2 || y < -LOG_H - 4) return;
      drawLog(c, l.x + ox, y, l.w, theme, l.seed, i === s.logs.length - 1);
    });
    // Abgesägte Stücke
    for (const pc of s.pieces) {
      c.save();
      c.translate(Math.round(pc.x + pc.w / 2 + ox), Math.round(sy(pc.h + LOG_H / 2)));
      c.rotate(pc.rot);
      drawLog(c, -pc.w / 2, -LOG_H / 2, pc.w, theme, pc.seed, false);
      c.restore();
    }
    // Schwingender bzw. fallender Stamm
    if (s.phase === "swing") {
      const x = swingX();
      const y = sy(topH() + SWING_GAP + LOG_H);
      // Seil
      c.fillStyle = mix("#7F4F24", "#3A2A1A", night);
      c.fillRect(Math.round(x + s.swing.w / 2), 0, 1, Math.max(0, y));
      c.fillRect(Math.round(x + s.swing.w / 2) - 1, Math.max(0, y) - 2, 3, 2);
      drawLog(c, x + ox, y, s.swing.w, theme, s.swing.seed, true);
    }
    if (s.drop) drawLog(c, s.drop.x + ox, sy(s.drop.h + LOG_H), s.drop.w, theme, s.drop.seed, true);

    // Wasser
    if (wl < VH) {
      c.fillStyle = mix("#5E8C8A", "#1F3434", night);
      c.fillRect(L, wl, R - L, VH - wl);
      c.fillStyle = mix("#9FC1C6", "#3C5656", night);
      for (let row = 0; row < 4; row++) {
        const y = wl + 1 + row * 4;
        const span = R - L;
        for (let i = 0; i < span; i += 16) {
          const x = Math.round(i + s.time * (row % 2 ? 6 : -4) + row * 5);
          c.fillRect(L + (((x % span) + span) % span), y, 5 - row, 1);
        }
      }
      c.fillStyle = mix("#C9DCDA", "#4C6666", night);
      c.fillRect(L, wl, R - L, 1);
    }
    // Spritzer
    for (const pt of s.parts) {
      c.fillStyle = pt.c;
      c.fillRect(Math.round(pt.x), Math.round(sy(pt.h)), 1, 1);
    }

    // Tier über die Leinwand legen und unterhalb der Wasserlinie abschneiden
    const box = petBox.current;
    if (box) {
      const a = s.animal;
      const left = (a.x - PET_W / 2 + ox + XO) * S;
      const topPx = (sy(a.h) - PET_FEET) * S;
      const visible = clamp(wl * S - topPx, 0, PET_H * S);
      box.style.transform = `translate(${Math.round(left)}px, ${Math.round(topPx)}px)`;
      box.style.clipPath = `inset(0 0 ${PET_H * S - visible}px 0)`;
      box.style.visibility = visible <= 0 ? "hidden" : "visible";
    }
  };

  // Spielschleife
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!g.current.paused) update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [p.animal]);

  // Größe: ganzzahliger Maßstab, Höhe füllt das Fenster
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const S = Math.max(2, Math.floor(el.clientWidth / GW));
      const VH = Math.floor(el.clientHeight / S);
      const VW = Math.ceil(el.clientWidth / S);
      const XO = Math.floor((VW - GW) / 2);
      view.current = { S, VH, VW, XO };
      setScale(S);
      setWorld({ w: VW * S, h: VH * S, xo: XO * S });
      const cv = canvas.current;
      if (cv) {
        cv.width = VW * S;
        cv.height = VH * S;
      }
      if (g.current.phase === "ready") g.current.cam = VH - WATER_VIEW;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const togglePause = useCallback((force?: boolean) => {
    const s = g.current;
    if (s.phase === "ready" || s.phase === "over" || s.phase === "falling") return;
    s.paused = force ?? !s.paused;
    sync();
  }, []);

  // Tastatur: Leertaste/Enter = fallen lassen, Esc = Pause
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (g.current.paused) togglePause(false);
        else dropLog();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
      }
    };
    // Fenster verliert den Fokus: automatisch pausieren
    const blur = () => togglePause(true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Testansicht: Zustand vorführen
  useEffect(() => {
    const demo = p.demo;
    if (!demo) return;
    window.setTimeout(() => {
      if (demo === "record") {
        start();
        const s = g.current;
        s.score = (props.current.scores.top[0]?.score ?? 0) + 5;
        for (let i = 0; i < 8; i++) s.logs.push({ x: (GW - START_W) / 2, w: START_W, seed: 40 + i });
        s.phase = "over";
        s.saved = true;
        sync();
        setUi(u => ({ ...u, record: true, animalRecord: true }));
        celebrate();
      } else {
        start();
        if (demo === "pause") togglePause(true);
      }
    }, 300);
  }, [p.demo]);

  // ---------- Oberfläche ----------

  const best = p.scores.top[0]?.score ?? 0;
  const list = tab === "all" ? p.scores.top : p.scores.byAnimal[p.animal] ?? [];
  const date = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  const playing = ui.phase === "swing" || ui.phase === "drop";

  return (
    <div className="dam" onMouseDown={e => e.stopPropagation()}>
      <div className="dam-bar" onMouseDown={e => !(e.target as HTMLElement).closest("button") && p.onDrag()}>
        <strong>{t("Dammbau")}</strong>
        <span className="dam-score" ref={scoreRef}>{ui.score}</span>
        {ui.combo >= 2 && <span className="dam-combo">×{ui.combo}</span>}
        <span className="spacer" />
        <span className="dam-best">{t("Rekord: {n}", { n: best })}</span>
        <button className="dam-btn" onClick={() => p.onSound(!p.sound)} title={t(p.sound ? "Töne aus" : "Töne an")} aria-label={t(p.sound ? "Töne aus" : "Töne an")}>
          <svg viewBox="0 0 16 16">
            <path d="M3 6h2.5L9 3v10L5.5 10H3z" />
            {p.sound ? <path d="M11 5.5c1 1.4 1 3.6 0 5M12.8 4c1.8 2.4 1.8 5.6 0 8" /> : <path d="M11 6l3 4M14 6l-3 4" />}
          </svg>
        </button>
        {playing && (
          <button className="dam-btn" onClick={() => togglePause()} title={t("Pause (Esc)")} aria-label={t("Pause (Esc)")}>
            <svg viewBox="0 0 16 16"><path d="M5.5 4v8M10.5 4v8" /></svg>
          </button>
        )}
        <button className="dam-btn" onClick={p.onClose} title={t("Spiel beenden")} aria-label={t("Spiel beenden")}>
          <svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" /></svg>
        </button>
      </div>
      <div className="dam-stage" ref={wrap} onMouseDown={e => e.button === 0 && !(e.target as HTMLElement).closest("button, .dam-panel") && dropLog()}>
        <div className="dam-world" style={{ width: world.w, height: world.h }}>
        <canvas ref={canvas} className="dam-canvas" />
        <div className="dam-pet" ref={petBox}>
          <Pet kind={p.animal} mood="relaxed" scale={scale} event={petEv} held={held} reduced={p.calm} wear={p.wear?.accessory ? { accessory: p.wear.accessory } : undefined} />
          {bubble && (
            <span className="bubble dam-bubble" key={bubble.at}>
              {bubble.text}
            </span>
          )}
        </div>
        {floats.map(f => (
          <span key={f.id} className={f.big ? "dam-float big" : "dam-float"} style={{ left: f.x * scale + world.xo, top: f.y * scale }}>
            {f.text}
          </span>
        ))}
        </div>
        <canvas ref={fxCanvas} className="dam-fx" aria-hidden />

        {ui.phase === "ready" && (
          <div className="dam-panel">
            <h2>{t("Dammbau")}</h2>
            <p>{t("Baut mit {animal} einen Damm. Klick oder Leertaste lässt den Stamm fallen, was übersteht, wird abgesägt.", { animal: animalName(p.animal).replace("­", "") })}</p>
            <p className="dam-hint">{t("Perfekte Treffer geben Bonus. Ab drei in Folge wächst der Stamm wieder.")}</p>
            <button className="btn primary" onClick={start}>{t("Los geht's!")}</button>
          </div>
        )}
        {ui.paused && (
          <div className="dam-panel">
            <h2>{t("Pause")}</h2>
            <div className="dam-actions">
              <button className="btn primary" onClick={() => togglePause(false)}>{t("Weiter")}</button>
              <button className="btn" onClick={p.onClose}>{t("Spiel beenden")}</button>
            </div>
          </div>
        )}
        {ui.phase === "over" && (
          <div className="dam-panel over">
            {(ui.record || ui.animalRecord) && <div className="dam-record">{t(ui.record ? "Neuer Rekord!" : "Neuer Rekord für {animal}!", { animal: animalName(p.animal).replace("­", "") })}</div>}
            <h2>{t("Platsch!")}</h2>
            <p className="dam-result">
              <b>{ui.score}</b> {t("Punkte")} · {t(ui.layers === 1 ? "1 Lage" : "{n} Lagen", { n: ui.layers })} · {t("{n}× perfekt", { n: ui.perfects })}
            </p>
            <div className="dam-tabs">
              <button className={tab === "all" ? "on" : undefined} onClick={() => setTab("all")}>{t("Gesamt")}</button>
              <button className={tab === "animal" ? "on" : undefined} onClick={() => setTab("animal")}>{animalName(p.animal).replace("­", "")}</button>
            </div>
            {list.length ? (
              <ol className="dam-top">
                {list.map((e, i) => (
                  <li key={i}>
                    <b>{e.score}</b>
                    <span>{t(e.layers === 1 ? "1 Lage" : "{n} Lagen", { n: e.layers })}</span>
                    {tab === "all" && <span className="dam-who">{animalName(e.animal).replace("­", "")}</span>}
                    <span className="dam-date">{date(e.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dam-hint">{t("Noch keine Ergebnisse.")}</p>
            )}
            <div className="dam-actions">
              <button className="btn primary" onClick={start}>{t("Nochmal")}</button>
              <button className="btn" onClick={p.onClose}>{t("Beenden")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function interp(a: string, b: string, k: number) {
  const pa = a.startsWith("rgb") ? a.slice(4, -1).split(",").map(Number) : rgb(a);
  const pb = b.startsWith("rgb") ? b.slice(4, -1).split(",").map(Number) : rgb(b);
  return `rgb(${pa.map((v, i) => Math.round(lerp(v, pb[i], k))).join(",")})`;
}

function pickOf<T>(a: T[]) {
  return a[Math.floor(Math.random() * a.length)];
}
