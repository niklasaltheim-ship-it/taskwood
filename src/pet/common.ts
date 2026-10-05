import { A, P } from "../sprites";
import type { Map, Part, Species } from "./types";

// Teile und Requisiten, die alle Tiere teilen. Zeichen mit gleicher Bedeutung bei allen Tieren:
//   a b c   Fell dunkel / mittel / hell      d e   Bauch und Schnauze
//   n       Augen, Nase, Linien              w     Weiß (Glanz, Zähne, Fell)
//   g h     Blätter                          z     Zzz
//   s S     Schweißtropfen                   H     Herz
//   y       Späne                            K     Kontur (wird auch automatisch gezogen)
//   B       Bäckchen    R  Apfel    O  Karotte    Y  Schnabel/Krallen    N M  Nuss, Buchdeckel
// Die Farben von a–e wählt jedes Tier selbst.

export const BASE_COLORS: Record<string, string> = {
  K: P.g5,
  n: P.g5,
  w: P.white,
  g: P.g3,
  h: P.g2,
  z: P.g3,
  s: P.white,
  S: P.g1,
  H: A.pink,
  y: P.b3,
  B: A.blush,
  R: A.apple,
  O: A.carrot,
  Y: A.amber,
  N: P.b2,
  M: P.b1,
};

// Vorrat aus erledigten Aufgaben: bis zu 6 Stück als kleiner Haufen links neben dem Tier.
// Unten 3, darüber 2, oben 1; die Stücke überlappen sich um eine Spalte.
export function stashProps(item: Map): Species["props"] {
  const w = item[0].length;
  const h = item.length;
  const step = w - 1;
  const rowsUsed = (n: number) => (n > 5 ? 3 : n > 3 ? 2 : 1);
  const out: Species["props"] = {};
  for (let n = 1; n <= 6; n++) {
    const H = h + (rowsUsed(n) - 1) * (h - 1);
    const W = 3 * step + 1;
    const g = Array.from({ length: H }, () => Array(W).fill("."));
    const place = (x: number, y: number) =>
      item.forEach((row, r) => [...row].forEach((ch, c) => ch !== "." && (g[y + r][x + c] = ch)));
    const counts = [Math.min(n, 3), Math.max(0, Math.min(n - 3, 2)), Math.max(0, n - 5)];
    counts.forEach((k, level) => {
      const y = H - h - level * (h - 1);
      const x0 = Math.round(((3 - k) * step) / 2);
      for (let i = 0; i < k; i++) place(x0 + i * step, y);
    });
    out[`stash${n}`] = { layer: "ground", x: -3, y: 30 - H, map: g.map(r => r.join("")) };
  }
  return out;
}

export const without = (m: Map, row: number) => m.filter((_, i) => i !== row);
export const withExtra = (m: Map, row: number) => [...m.slice(0, row + 1), m[row], ...m.slice(row + 1)];
const part = (map: Map, x: number, y: number): Part => ({ map, x, y });

// Sitzender Körper, frontal; Bauch hell
export const BODY: Map = [
  "....bbbbbbbbbb....",
  "..bbbbbbbbbbbbbb..",
  ".bbbbbddddddbbbbb.",
  ".bbbbddeeeeddbbbb.",
  "bbbbddeeeeeeddbbbb",
  "bbbbdeeeeeeeedbbbb",
  "abbbdeeeeeeeedbbba",
  "abbbdeeeeeeeedbbba",
  "abbbddeeeeeeddbbba",
  "aabbbddddddddbbbaa",
  ".aabbbbbbbbbbbbaa.",
  "..aaabbbbbbbbaaa..",
  "....aaaaaaaaaa....",
];

// Zusammengerollt liegend (Schlaf)
export const CURL: Map = [
  "......bbbbbbbbbb......",
  "...bbbbbbbbbbbbbbbb...",
  ".bbbbbcccccccccbbbbbb.",
  "bbbbcccccccccccccbbbbb",
  "bbbbbbbbbbbbbbbbbbbbbb",
  "abbbbbbbbbbbbbbbbbbbba",
  "aabbbbbbbbbbbbbbbbbbaa",
  ".aaaabbbbbbbbbbbbaaaa.",
  "...aaaaaaaaaaaaaaaa...",
];

export const bodies = (body: Map = BODY, curl: Map = CURL): Species["bodies"] => ({
  sit: part(body, 7, 16),
  squash: part(without(body, 5), 7, 17),
  tall: part(withExtra(body, 5), 7, 15),
  curl: part(curl, 5, 21),
  curl2: part(withExtra(curl, 1), 5, 20),
});

// Linke Pfote; rechts wird gespiegelt
export const ARMS: Species["arms"] = {
  rest: part(["bb...", "abbb.", ".aacc"], 9, 20),
  hold: part(["bb....", "abbbb.", ".aaacc"], 9, 19),
  mouth: part([".ccc", "abbc", "bb..", "b..."], 9, 16),
  up1: part([".bb...", "bbbb..", "abba..", ".bb...", ".bb...", "..bb..", "..bb..", "...bb.", "...bb.", "....bb", ".....b"], 4, 8),
  up2: part(["..bb..", ".bbbb.", ".abba.", "..bb..", "..bb..", "..bb..", "..bb..", "...bb.", "...bb.", "....bb", ".....b"], 4, 8),
  stretch: part([".bb.", "bbbb", "abba", ...Array(12).fill(".bb."), "..bb", "...b"], 5, 1),
  groom1: part(["abba", "adda", ".ab.", ".ab.", ".ab.", "ab..", "b...", "b..."], 8, 12),
  groom2: part(["abba", "adda", ".ab.", ".ab.", ".ab.", ".ab.", "ab..", "b...", "b..."], 8, 11),
  wipe1: part(["....bbbb", "...abbbb", "..ab....", "..ab....", ".ab.....", ".ab.....", ".ab.....", ".ab.....", ".ab.....", "..ab....", "..ab...."], 6, 8),
  wipe2: part(["......bbbb", "....aabbbb", "..aab.....", "..ab......", ".ab.......", ".ab.......", ".ab.......", ".ab.......", ".ab.......", "..ab......", "..ab......"], 6, 8),
  out1: part(["bb....", "abbbbb", ".aaabb"], 3, 17),
  out2: part(["....bb", "bbbbbb", "aaa..."], 3, 18),
  clock: part(["..bbb", ".abbb", ".bb..", ...Array(14).fill("bb..."), ".bb..", "..b.."], 6, 0),
  // Pfoten nach unten, z. B. ins Wasser (Waschbär) oder zum Nusshaufen
  reach1: part(["bb...", ".bb..", ".bb..", "..bb.", "..bb.", "..bcc", "...cc"], 9, 20),
  reach2: part(["bb....", ".bb...", "..bb..", "..bb..", "...bb.", "...bcc", "....cc"], 9, 20),
};

export const FEET = part(["aaaa.", "adada"], 9, 28);

// Pfoten-Requisiten für Arbeit mit dem eigenen Gadget
export const ITEMS = {
  log: [".aa.", "acda", ".aa."],
  nut: [".MM.", "MMMM", "NNNN", ".NN."],
  apple: ["..hg", ".RR.", "RwRR", "RRRR", ".RR."],
  carrot: ["h...", "gOOO", ".OO."],
  book: ["NNNN", "wwww", "MMMM"],
};

const DROP = [".K.", "KsK", "KSK", ".K."];
const HEART = [".K.K.", "KHKHK", "KHHHK", ".KHK.", "..K.."];
const Z4 = ["zzzz", "..z.", ".z..", "zzzz"];

export const COMMON_PROPS: Species["props"] = {
  headband: { layer: "mid", x: 10, y: 6, map: ["..wwwwwwww....", "gggggggggggg..", "............gg", "............hg"] },
  clock: {
    layer: "main",
    x: 11,
    y: -5,
    map: [
      ".hh....hh.",
      "hhhKKKKhhh",
      ".KwwwwwwK.",
      "KwwwnwwwwK",
      "KwwwnwwwwK",
      "KwwwnnnwwK",
      "KwwwwwwwwK",
      ".KwwwwwwK.",
      "..KKKKKK..",
      ".K......K.",
    ],
  },
  // Kalenderblatt mit roter Kopfleiste und Ringen; hochgehalten wie der Wecker
  calsign: {
    layer: "main",
    x: 11,
    y: -5,
    map: [
      "..K....K..",
      "KKwKKKKwKK",
      "KRRRRRRRRK",
      "KRRRRRRRRK",
      "KwwwwwwwwK",
      "KwnwnwnwwK",
      "KwwwwwwwwK",
      "KwnwnwRRwK",
      "KwwwwwRRwK",
      "KKKKKKKKKK",
    ],
  },
  fluff1: { layer: "main", x: 7, y: 6, map: ["b................b", "..................", ".b..............b.", "..................", "b................b"] },
  fluff2: { layer: "main", x: 7, y: 7, map: [".b..............b.", "b................b", "..................", ".b..............b."] },
  sweat1: { layer: "over", x: 24, y: 6, map: DROP },
  sweat2: { layer: "over", x: 25, y: 9, map: DROP },
  sweatL: { layer: "over", x: 5, y: 7, map: DROP },
  zzz1: { layer: "over", x: 19, y: 13, map: ["zzz", ".z.", "zzz"] },
  zzz2: { layer: "over", x: 21, y: 9, map: Z4 },
  zzz3: { layer: "over", x: 24, y: 4, map: Z4 },
  heart1: { layer: "over", x: 24, y: 6, map: HEART },
  heart2: { layer: "over", x: 26, y: 1, map: HEART },
  heart3: { layer: "over", x: 3, y: 4, map: HEART },
  stars1: { layer: "over", x: 3, y: 3, map: [".K.......................", "KwK......................", ".K....................K..", "....................KwK..", ".....................K..."] },
  stars2: { layer: "over", x: 2, y: 8, map: ["......................K..", ".K...................KwK.", "KwK...................K..", ".K......................."] },
};

// Münder ohne Biberzähne (Fuchs, Eichhörnchen, Waschbär, Igel)
export const SOFT_MOUTHS: Species["mouths"] = {
  neutral: [".n..n.", "..nn.."],
  smile: ["n....n", ".nnnn."],
  grin: ["n....n", ".nnnn.", ".nnnn.", "..nn.."],
  open: ["..nn..", ".nnnn.", ".nnnn.", "..nn.."],
  o: ["..nn..", "..nn.."],
  yawn: [".nnnn.", "nnnnnn", "nnnnnn", "nnnnnn", ".nnnn."],
  sad: ["..nn..", ".n..n."],
  gnaw1: ["..nn.."],
  gnaw2: [".n..n.", "..nn.."],
  nervous: ["n.nn.n", ".n..n."],
  small: ["..nn.."],
};
