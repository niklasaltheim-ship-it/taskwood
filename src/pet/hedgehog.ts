import { A, P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, BODY, COMMON_PROPS, ITEMS, SOFT_MOUTHS, bodies, stashProps } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Igel: runder Stachelmantel mit hellen Spitzen, cremefarbenes Gesicht, Knopfnase.
// Fleißig: trägt einen Apfel auf den Stacheln. Bei Stress rollt er sich kurz ein. Vorrat: Äpfel.
//   s q p   Stacheln dunkel / Strähnen / helle Spitzen

// Ovaler Stachelmantel: glatte Füllung, wenige Strähnen, deutliche Zacken mit hellen Spitzen
function spines(w: number, h: number, teeth: number, depth: number, phase = 0): Map {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / (w / 2);
      const dy = (y - cy) / (h / 2);
      const r = Math.hypot(dx, dy);
      const t = (((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * teeth + phase) % 1;
      const tri = 1 - Math.abs(t - 0.5) * 2; // 0 am Zahnrand, 1 in der Zahnmitte
      const edge = 0.8 + depth * tri;
      if (r > edge) row += ".";
      else if (r > 0.8) row += "p";
      else if (tri > 0.85 && r > 0.45) row += "q";
      else row += "s";
    }
    rows.push(row);
  }
  return rows;
}

const HEAD: Map = [
  "....ssssssss....",
  "..ssssssssssss..",
  ".ssbsbbssbbsbss.",
  "sbbbbbbbbbbbbbbs",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbddddbbbbbb",
  "abbbbddddddbbbba",
  ".abbddddddddbba.",
  "..abbddddddbba..",
  "...aabddddbaa...",
  ".....aaddaa.....",
];

// Schlafend: Stachelrücken über dem zusammengerollten Körper
const CURL: Map = [
  "......ppsspsspp.......",
  "...pssssssssssssp.....",
  ".psssssqssssssqsssp...",
  "psssssssssssssssssssp.",
  "ssssssssssssssssssssss",
  "abbbbbbbbbbbbbbbbbbbba",
  "aabbbbbbbbbbbbbbbbbbaa",
  ".aaaabbbbbbbbbbbbaaaa.",
  "...aaaaaaaaaaaaaaaa...",
];

const BALL = spines(20, 18, 14, 0.18);
// kleine Nase schaut aus der Kugel
BALL[10] = BALL[10].slice(0, 9) + "nn" + BALL[10].slice(11);

const HEDGEHOG: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["nn", "nn"], x: 7, y: 7 },
  face: { eye: [4, 4], mouth: [5, 9] },
  muzzle: { rows: [7, 12], char: "d" },
  bodies: { ...bodies(BODY, CURL), ball: { map: BALL, x: 6, y: 12 } },
  ears: {
    up: { map: [".aa.", "aBBa"], x: 0, y: 2 },
    perk: { map: [".aa.", "aBBa", "aBBa"], x: 0, y: 1 },
    droop: { map: ["aa..", "aBBa"], x: -1, y: 4 },
  },
  arms: ARMS,
  feet: { map: ["aaaa.", "aBaBa"], x: 9, y: 28 },
  tails: {
    down: { map: spines(28, 25, 16, 0.14), x: 2, y: 2 },
    up: { map: spines(30, 27, 16, 0.2, 0.5), x: 1, y: 1 }, // gesträubt
    back: { map: spines(26, 24, 16, 0.14), x: 3, y: 5 },
  },
  props: {
    ...COMMON_PROPS,
    ...stashProps(ITEMS.apple),
    // Apfel oben auf den Stacheln
    apple: { layer: "mid", x: 13, y: -3, map: ["...hg", "..RR.", ".RwRR", ".RRRR", "..RR."] },
  },
  colors: {
    ...BASE_COLORS,
    a: A.tanDark,
    b: A.tan,
    c: A.cream,
    d: A.cream,
    e: P.white,
    s: A.taupe,
    q: A.taupeLight,
    p: A.cream,
  },
  backSubst: { d: "b", e: "b" },
  mouths: SOFT_MOUTHS,
  stash: { one: "Apfel", many: "Äpfel" },
  clips: {},
};

// Apfel tragen: tippelt hin und her, der Apfel wippt mit
const carry: Clip = {
  fps: 8,
  frames: [0, 0, -1, -2, -2, -1, 0, 0, 1, 2, 2, 1].map((x, i): Frame => ({
    x,
    props: [i % 2 ? "apple@0,1" : "apple"],
    feet: i % 2 ? "step1" : "step2",
    turn: x < 0 || (i >= 2 && i < 6) ? -1 : x > 0 ? 1 : 0,
    eyes: i === 6 ? "happy" : "bead",
    mouth: "smile",
    gaze: [0, -1],
  })),
};

// Bei Stress kurz zur Kugel einrollen
const ballup: Clip = {
  fps: 8,
  frames: [
    { brows: "worried", mouth: "nervous", eyes: "wide", tail: "up" },
    { body: "squash", brows: "worried", mouth: "o", eyes: "closed", tail: "up" },
    ...repeat(8, (i): Frame => ({ body: "ball", x: i % 4 === 1 ? 1 : i % 4 === 3 ? -1 : 0, props: i === 4 ? ["sweat1"] : [] })),
    { body: "squash", eyes: "halflid", mouth: "small", brows: "worried" },
    { eyes: "bead", mouth: "nervous", brows: "worried", gaze: [-1, 0] },
    { eyes: "bead", mouth: "nervous", brows: "worried", gaze: [1, 0] },
  ],
};

// Schnuppern: Nase wackelt, Blick nach unten
const sniff: Clip = {
  fps: 8,
  frames: [
    ...repeat(8, (i): Frame => ({ hy: i % 2, gaze: [i < 4 ? -1 : 1, 1], mouth: "small" })),
    { eyes: "happy", mouth: "smile" },
    { eyes: "happy", mouth: "smile" },
  ],
};

HEDGEHOG.clips = { ...baseClips(HEDGEHOG), work: carry, ballup, sniff };
HEDGEHOG.moodExtra = { stress: [["ballup", 2]], relaxed: [["sniff", 2]] };
HEDGEHOG.stills = {
  busy: { props: ["apple"], mouth: "smile", gaze: [0, -1] },
  focus: { props: ["apple", "headband"], brows: "focus" },
};

export default HEDGEHOG;
