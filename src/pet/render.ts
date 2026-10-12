import { BROWS, EYES, MOUTHS } from "./face";
import type { Arm, Eye, Frame, Map, Part, Prop, Species } from "./types";
import { WEAR_COLORS, WEAR_PROPS } from "./wear";

// Leinwand in Tier-Pixeln. Das 32er-Raster der Teile sitzt bei (OX, OY); oben bleibt Platz für
// Sprünge, Ohren und den Wecker.
export const W = 40;
export const H = 42;
const OX = 4;
const OY = 9;
const OUTLINE = "K";

type Grid = (string | null)[];

const mirrorMap = (m: Map) => m.map(r => [...r].reverse().join(""));
const width = (m: Map) => Math.max(...m.map(r => r.length));

function stamp(g: Grid, map: Map, x: number, y: number, subst?: Record<string, string>) {
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < row.length; c++) {
      let ch = row[c];
      if (ch === ".") continue;
      if (subst && subst[ch]) ch = subst[ch];
      const gx = x + c;
      const gy = y + r;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      g[gy * W + gx] = ch;
    }
  }
}

// Linkes Teil zeichnen und gespiegelt rechts (Spiegelachse in der Mitte des 32er-Rasters)
const mirrorX = (x: number, w: number) => 32 - x - w;

// Umrandung aller gefüllten Felder (4er-Nachbarschaft)
function outline(g: Grid) {
  const add: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (g[y * W + x]) continue;
      if (
        (x > 0 && g[y * W + x - 1]) ||
        (x < W - 1 && g[y * W + x + 1]) ||
        (y > 0 && g[(y - 1) * W + x]) ||
        (y < H - 1 && g[(y + 1) * W + x])
      ) {
        add.push(y * W + x);
      }
    }
  }
  for (const i of add) g[i] = OUTLINE;
}

const parseProp = (s: string) => {
  const [name, off] = s.split("@");
  const [dx, dy] = off ? off.split(",").map(Number) : [0, 0];
  return { name, dx, dy };
};

// Schnauze beim Drehen des Kopfes um "turn" Pixel mitschieben (nur innerhalb der Kopfform)
function turnHead(head: Map, turn: number, rows: [number, number], muzzle: string): Map {
  if (!turn) return head;
  return head.map((row, y) => {
    if (y < rows[0] || y > rows[1]) return row;
    return [...row]
      .map((ch, x) => {
        if (ch === ".") return ch;
        const from = row[x - turn];
        if (from === muzzle) return muzzle;
        return ch === muzzle ? [...row].find(c => c !== "." && c !== muzzle && c !== "a") ?? "b" : ch;
      })
      .join("");
  });
}

export function compose(sp: Species, f: Frame): Grid {
  // Requisiten des Tiers, sonst gemeinsame (Accessoires, Jahreszeiten)
  const prop = (name: string): Prop | undefined => sp.props[name] ?? WEAR_PROPS[name];
  const main: Grid = new Array(W * H).fill(null);
  const over: Grid = new Array(W * H).fill(null);
  const fx = OX + (f.x ?? 0);
  const fy = OY + (f.y ?? 0);
  const at = (g: Grid, p: Part, dx = 0, dy = 0, subst?: Record<string, string>) => stamp(g, p.map, fx + p.x + dx, fy + p.y + dy, subst);

  const body = f.body ?? "sit";
  // Eingerollt (Igel): nur die Kugel
  if (body === "ball" && sp.bodies.ball) {
    for (const p of (f.props ?? []).map(parseProp).filter(p => prop(p.name)?.layer === "ground")) stamp(main, prop(p.name)!.map, OX + prop(p.name)!.x + p.dx, OY + prop(p.name)!.y + p.dy);
    at(main, sp.bodies.ball);
    outline(main);
    for (const p of (f.props ?? []).map(parseProp).filter(p => prop(p.name)?.layer === "over")) at(over, prop(p.name)!, p.dx, p.dy);
    for (let i = 0; i < over.length; i++) if (over[i]) main[i] = over[i];
    return main;
  }
  const curled = body === "curl" || body === "curl2";
  const back = !!f.back;
  const sub = back ? sp.backSubst : undefined;
  // Ober­körper folgt dem Körper beim Stauchen und Strecken
  const lift = body === "squash" ? 1 : body === "tall" ? -1 : 0;
  const hx = (curled ? sp.curlHead[0] - sp.head.x : 0) + (f.hx ?? 0);
  const hy = (curled ? sp.curlHead[1] - sp.head.y : 0) + (f.hy ?? 0) + lift;
  const headX = sp.head.x + hx;
  const headY = sp.head.y + hy;
  const headW = width(sp.head.map);
  const props = (f.props ?? []).map(parseProp).filter(p => prop(p.name));
  const propsIn = (layer: string) => props.filter(p => prop(p.name)!.layer === layer);

  // 0. Vorrat am Boden, unabhängig von Sprüngen
  for (const p of propsIn("ground")) stamp(main, prop(p.name)!.map, OX + prop(p.name)!.x + p.dx, OY + prop(p.name)!.y + p.dy);

  // 1. hinten: Schwanz, Requisiten hinter der Figur
  const tail = curled ? "front" : f.tail ?? "down";
  if (!back && tail !== "none" && !curled && sp.tails[tail]) at(main, sp.tails[tail]!);
  for (const p of propsIn("back")) at(main, prop(p.name)!, p.dx, p.dy);

  // 2. Körper und Füße
  const bodyPart = sp.bodies[body] ?? sp.bodies.sit!;
  at(main, bodyPart, 0, 0, sub);
  if (curled && sp.tails.front) at(main, sp.tails.front);
  const feet = curled ? "none" : f.feet ?? "sit";
  if (feet !== "none") {
    const p = sp.feet;
    const w = width(p.map);
    const [l, r] = feet === "step1" ? [-1, 0] : feet === "step2" ? [0, -1] : feet === "kick1" ? [1, 2] : feet === "kick2" ? [2, 1] : [0, 0];
    stamp(main, p.map, fx + p.x, fy + p.y + l, sub);
    stamp(main, mirrorMap(p.map), fx + mirrorX(p.x, w), fy + p.y + r, sub);
  }

  // 3. Ohren, dann Kopf darüber
  const ear = sp.ears[f.ears ?? "up"] ?? sp.ears.up!;
  const earW = width(ear.map);
  stamp(main, ear.map, fx + headX + ear.x, fy + headY + ear.y, sub);
  stamp(main, mirrorMap(ear.map), fx + headX + headW - ear.x - earW, fy + headY + ear.y, sub);
  const turn = back ? 0 : f.turn ?? 0;
  stamp(main, turnHead(sp.head.map, turn, sp.muzzle.rows, sp.muzzle.char), fx + headX, fy + headY, sub);
  // Rückansicht: Schwanz bzw. Stacheln liegen über dem Hinterkopf
  if (back && sp.tails.back) at(main, sp.tails.back);

  for (const p of propsIn("mid")) at(main, prop(p.name)!, p.dx + hx, p.dy + hy);

  // 4. Gesicht
  if (!back) {
    const [eax, eay] = sp.face?.eye ?? [sp.nose.x - 2, sp.nose.y - 3];
    const [max, may] = sp.face?.mouth ?? [sp.nose.x - 1, sp.nose.y + 2];
    const [gx, gy] = f.gaze ?? [0, 0];
    const eyes = Array.isArray(f.eyes) ? f.eyes : [f.eyes ?? "bead", f.eyes ?? "bead"];
    const eyeY = fy + headY + eay;
    const eyeL = fx + headX + eax + turn; // Anker linkes Auge
    const eyeR = fx + headX + headW - eax - 2 + turn; // gespiegelter Anker rechts
    const drawEye = (e: Eye, ax: number, right: boolean) => {
      const ft = EYES[e];
      const map = right && ft.mirror ? mirrorMap(ft.map) : ft.map;
      const move = e === "bead" || e === "wide";
      const w = width(ft.map);
      const x = right ? ax + 2 - w - ft.dx : ax + ft.dx;
      const lid = e === "closed" || e === "happy" || e === "dizzy" ? sp.lidSubst : undefined;
      stamp(main, map, x + (move ? gx : 0), eyeY + ft.dy + (move ? gy : 0), lid);
    };
    drawEye(eyes[0], eyeL, false);
    drawEye(eyes[1], eyeR, true);
    if (f.brows && f.brows !== "none") {
      const b = BROWS[f.brows];
      stamp(main, b.map, eyeL + b.dx, eyeY + b.dy);
      stamp(main, mirrorMap(b.map), eyeR + 2 - width(b.map) - b.dx, eyeY + b.dy);
    }
    if (f.blush !== false && sp.colors.B) {
      stamp(main, ["BB"], eyeL - 3, eyeY + 3);
      stamp(main, ["BB"], eyeR + 3, eyeY + 3);
    }
    stamp(main, sp.nose.map, fx + headX + sp.nose.x + turn, fy + headY + sp.nose.y);
    const m = f.mouth ?? "neutral";
    stamp(main, sp.mouths?.[m] ?? MOUTHS[m], fx + headX + max + turn, fy + headY + may);
  }

  // 5. Requisiten vorne, dann Pfoten
  for (const p of propsIn("main")) at(main, prop(p.name)!, p.dx, p.dy);
  const arms: [Arm, Arm] = curled ? ["none", "none"] : Array.isArray(f.arms) ? f.arms : [f.arms ?? "rest", f.arms ?? "rest"];
  const showArm = (a: Arm) => a !== "none" && !(back && (a === "rest" || a === "hold" || a === "mouth"));
  if (showArm(arms[0]) && sp.arms[arms[0]]) at(main, sp.arms[arms[0]]!, 0, lift);
  if (showArm(arms[1]) && sp.arms[arms[1]]) {
    const p = sp.arms[arms[1]]!;
    stamp(main, mirrorMap(p.map), fx + mirrorX(p.x, width(p.map)), fy + p.y + lift);
  }

  outline(main);

  // 6. Schwebendes ohne Kontur der Figur
  for (const p of propsIn("over")) at(over, prop(p.name)!, p.dx, p.dy);
  for (let i = 0; i < over.length; i++) if (over[i]) main[i] = over[i];

  if (f.flip) {
    for (let y = 0; y < H; y++) {
      const row = main.slice(y * W, y * W + W).reverse();
      for (let x = 0; x < W; x++) main[y * W + x] = row[x];
    }
  }
  return main;
}

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

// Ein Cache je Tier, sonst teilen sich verschiedene Tiere dieselben Bilder
const caches = new WeakMap<Species, globalThis.Map<string, Uint8ClampedArray>>();

export function rgba(sp: Species, f: Frame, key: string): Uint8ClampedArray {
  let cache = caches.get(sp);
  if (!cache) caches.set(sp, (cache = new globalThis.Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const g = compose(sp, f);
  const out = new Uint8ClampedArray(W * H * 4);
  const rgb: Record<string, number[]> = {};
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (!ch) continue;
    const col = sp.colors[ch] ?? WEAR_COLORS[ch];
    if (!col) continue;
    const v = (rgb[ch] ??= hex(col));
    out[i * 4] = v[0];
    out[i * 4 + 1] = v[1];
    out[i * 4 + 2] = v[2];
    out[i * 4 + 3] = 255;
  }
  if (cache.size > 300) cache.clear();
  cache.set(key, out);
  return out;
}
