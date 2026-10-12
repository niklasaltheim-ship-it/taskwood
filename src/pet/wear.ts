import { A, P } from "../sprites";
import type { Frame, Map, Prop } from "./types";

// Accessoires (durch erledigte Aufgaben freigeschaltet) und Jahreszeiten-Deko. Gilt für alle Tiere,
// daher eigene Requisiten und Farben statt Einträgen je Tier. Ziffern als Farbzeichen, damit nichts
// mit den Zeichen der Tiere kollidiert:
//   1 Rot  2 Weiß  3 Blau  4 Hellblau  5 Orange  6 Bernstein  7 Rosa  8 Grün  9 Dunkel

export const WEAR_COLORS: Record<string, string> = {
  "1": A.apple,
  "2": P.white,
  "3": "#3E6A8A",
  "4": "#8FB0C8",
  "5": A.carrot,
  "6": A.amber,
  "7": A.pink,
  "8": P.g3,
  "9": P.g5,
};

export type Accessory = "neckerchief" | "glasses" | "hat" | "crown";
export type Season = "winter" | "spring" | "summer" | "autumn";

// need: erledigte Aufgaben insgesamt, ab denen das Teil getragen werden kann. Namen werden beim Anzeigen übersetzt.
export const ACCESSORIES: { id: Accessory; name: string; need: number }[] = [
  { id: "neckerchief", name: "Halstuch", need: 5 },
  { id: "glasses", name: "Brille", need: 15 },
  { id: "hat", name: "Mütze", need: 30 },
  { id: "crown", name: "Blumenkranz", need: 60 },
];

export const isAccessory = (v: unknown): v is Accessory => ACCESSORIES.some(a => a.id === v);
export const unlocked = (id: Accessory, done: number) => done >= (ACCESSORIES.find(a => a.id === id)?.need ?? Infinity);

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth();
  return m === 11 || m < 2 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn";
}

// Karte aus einzelnen Punkten bauen (für Schnee)
function sprinkle(w: number, h: number, pts: [number, number][], shape: Map): Map {
  const g = Array.from({ length: h }, () => Array(w).fill("."));
  for (const [x, y] of pts) {
    shape.forEach((row, r) =>
      [...row].forEach((ch, c) => {
        const yy = (y + r) % h;
        if (ch !== "." && x + c < w) g[yy][x + c] = ch;
      })
    );
  }
  return g.map(r => r.join(""));
}

// Boden über die ganze Breite (Raster x -4..35, unterste drei Zeilen, unter den Füßen). pick: Zeichen je Feld oder "."
const hash = (x: number, y: number) => (((x + 11) * 73856093) ^ ((y + 7) * 19349663)) >>> 0;
function carpet(pick: (h: number, row: number) => string): Map {
  return [0, 1, 2].map(row => Array.from({ length: 40 }, (_, x) => pick(hash(x, row), row)).join(""));
}
const LEAF_COLORS = ["1", "5", "6", "y", "5", "N"];
const AUTUMN_FLOOR = carpet((h, row) => ((row === 0 && h % 3 !== 0) || (row === 1 && h % 4 === 0) ? "." : LEAF_COLORS[(h >>> 3) % LEAF_COLORS.length]));
const WINTER_FLOOR = carpet((h, row) => (row === 0 ? (h % 3 === 0 ? "2" : ".") : row === 1 ? (h % 5 === 0 ? "." : "2") : h % 7 === 0 ? "4" : "2"));
const SPRING_FLOOR = carpet((h, row) =>
  row === 0 ? (h % 9 === 0 ? "7" : h % 11 === 0 ? "6" : ".") : row === 1 ? (h % 3 === 0 ? "." : "h") : h % 3 === 0 ? "h" : "g"
);
const SUMMER_FLOOR = carpet((h, row) => (row === 0 ? (h % 13 === 0 ? "6" : ".") : row === 1 ? (h % 2 === 0 ? "." : "h") : h % 4 === 0 ? "h" : "g"));
const floor = (map: Map): Prop => ({ layer: "ground", x: -4, y: 30, map });

const FLAKE = [".4.", "424", ".4."];
const FLAKES: [number, number][] = [[1, 0], [28, 3], [4, 8], [32, 11], [0, 15], [29, 19]]; // an den Seiten, nicht übers Gesicht
const LEAF = [".55", "551", "1.."];
const LEAF_PATH: [number, number][] = [[30, -4], [28, 2], [31, 8], [29, 14], [31, 20], [29, 25]];
const LEAF_PATH_L: [number, number][] = [[-1, 0], [1, 6], [-2, 12], [0, 18], [-2, 23], [0, 26]];
const FLY_OPEN = ["66.66", "65956", "66966", ".6.6."];
const FLY_SHUT = ["..6..", ".696.", ".696.", "..6.."];
const FLY_PATH: [number, number][] = [[27, 2], [28, 0], [30, 2], [31, 0], [30, 4], [28, 3]];

const SNOW_FRAMES = 3;

export const WEAR_PROPS: Record<string, Prop> = {
  // ---------- Accessoires (folgen dem Kopf) ----------
  "wear-hat": {
    layer: "mid",
    x: 9,
    y: 1,
    map: ["......22......", ".....1111.....", "...11211211...", "..1121121121..", ".111211211211.", "22222222222222"],
  },
  "wear-glasses": { layer: "mid", x: 10, y: 9, map: ["99999..99999", "9...9999...9", "9...9..9...9", "99999..99999"] },
  "wear-crown": { layer: "mid", x: 9, y: 4, map: ["..77..66..77..", "66778866887766"] },
  "wear-neckerchief": {
    layer: "mid",
    x: 9,
    y: 17,
    map: ["33333333333333", ".343343343343.", "..3333333333..", "....334333....", ".....333.....", "......3......."],
  },

  // ---------- Jahreszeiten ----------
  "season-scarf": {
    layer: "mid",
    x: 9,
    y: 17,
    map: ["11111111111111", "12111211121112", "..........111.", "..........121.", "..........111.", "..........2.2."],
  },
  "season-snowpile": { layer: "ground", x: 24, y: 28, map: ["....222....", "..2222222..", "22222222222"] },
  ...Object.fromEntries(
    Array.from({ length: SNOW_FRAMES }, (_, i): [string, Prop] => [
      `season-snow${i}`,
      { layer: "over", x: 1, y: -6, map: sprinkle(36, 24, FLAKES.map(([x, y]) => [x, y + i * 3]), FLAKE) },
    ])
  ),
  "season-leaves": { layer: "ground", x: 25, y: 28, map: ["..1.....6..", ".111..5666.", "51115.55665"] },
  ...Object.fromEntries(LEAF_PATH.map(([x, y], i): [string, Prop] => [`season-leaf${i}`, { layer: "over", x, y, map: LEAF }])),
  ...Object.fromEntries(LEAF_PATH_L.map(([x, y], i): [string, Prop] => [`season-leafL${i}`, { layer: "over", x, y, map: ["55.", "155", "..1"] }])),
  "season-floor-autumn": floor(AUTUMN_FLOOR),
  "season-floor-winter": floor(WINTER_FLOOR),
  "season-floor-spring": floor(SPRING_FLOOR),
  "season-floor-summer": floor(SUMMER_FLOOR),
  "season-flowers": { layer: "ground", x: 26, y: 25, map: [".7.....6..", "767...626.", ".7.....6..", ".8..8..8..", ".8.88..8.8", "8888888888"] },
  ...Object.fromEntries(FLY_PATH.map(([x, y], i): [string, Prop] => [`season-fly${i}`, { layer: "over", x, y, map: i % 2 ? FLY_SHUT : FLY_OPEN }])),
};

const ANIMATED: Record<Season, [string, number]> = {
  winter: ["season-snow", SNOW_FRAMES],
  autumn: ["season-leaf", LEAF_PATH.length],
  summer: ["season-fly", FLY_PATH.length],
  spring: ["", 0],
};
const GROUND: Record<Season, string | null> = { winter: "season-snowpile", autumn: "season-leaves", spring: "season-flowers", summer: null };

export type Wear = { accessory?: Accessory; season?: Season };

// Requisiten für ein Bild. step: Animationsschritt (Schnee, Blatt, Schmetterling), head: nur Kopf-Icon
export function wearProps(w: Wear, f: Frame, step: number, head: boolean): string[] {
  const out: string[] = [];
  const curled = f.body === "curl" || f.body === "curl2" || f.body === "ball";
  const neck = w.accessory === "neckerchief";
  if (w.accessory && !(neck && curled) && !(w.accessory === "glasses" && f.back)) out.push(`wear-${w.accessory}`);
  if (!w.season || head) return out;
  if (w.season === "winter" && !neck && !curled) out.push("season-scarf");
  out.push(`season-floor-${w.season}`);
  const ground = GROUND[w.season];
  if (ground) out.push(ground);
  const [name, n] = ANIMATED[w.season];
  if (n) out.push(`${name}${step % n}`);
  // zweites Blatt auf der linken Seite, versetzt
  if (w.season === "autumn") out.push(`season-leafL${(step + 3) % LEAF_PATH_L.length}`);
  return out;
}
