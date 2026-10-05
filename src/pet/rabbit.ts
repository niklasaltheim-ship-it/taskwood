import { A, P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, COMMON_PROPS, ITEMS, SOFT_MOUTHS, bodies, stashProps } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Hase: lange Ohren mit rosa Innenseite, Puschelschwanz, Schnuppernase.
// Fleißig: mampft eine Karotte, die dabei kürzer wird. Vorrat: Karotten. Eigenheit: Freudenhüpfer.

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbccccccccbb..",
  ".bbccccccccccbb.",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbddddbbbbbb",
  "abbbbddddddbbbba",
  "abbbddddddddbbba",
  ".abbddddddddbba.",
  "..aabddddddbaa..",
  "....aaaddaaa....",
];

const EAR: Map = [".bb.", "bBBb", "bBBb", "bBBb", "bBBb", "bBBb", "bbbb"];

const RABBIT: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["HH"], x: 7, y: 7 },
  face: { eye: [4, 4], mouth: [5, 8] },
  muzzle: { rows: [7, 12], char: "d" },
  bodies: bodies(),
  ears: {
    up: { map: EAR, x: 2, y: -7 },
    perk: { map: [EAR[0], ...EAR], x: 2, y: -8 },
    droop: { map: ["bbbbbb..", "bBBBBbbb", ".bbbbbbb"], x: -6, y: 1 }, // Schlappohren zur Seite
  },
  arms: ARMS,
  feet: { map: ["cccc.", "ccccc"], x: 9, y: 28 },
  tails: {
    down: { map: [".ww.", "wwww", "wwww", ".ww."], x: 23, y: 24 },
    up: { map: [".ww.", "wwww", "wwww", ".ww."], x: 23, y: 23 },
    front: { map: [".ww.", "wwww", ".ww."], x: 24, y: 26 },
    back: { map: ["..www..", ".wwwww.", "wwwwwww", ".wwwww."], x: 12, y: 23 },
  },
  props: {
    ...COMMON_PROPS,
    ...stashProps(ITEMS.carrot),
    carrot1: { layer: "mid", x: 15, y: 15, map: ["...hg.", "..ggh.", "..OO..", ".OOO..", ".OO...", "OO....", "O....."] },
    carrot2: { layer: "mid", x: 15, y: 15, map: ["...hg.", "..ggh.", "..OO..", ".OOO..", ".OO..."] },
    carrot3: { layer: "mid", x: 15, y: 15, map: ["...hg.", "..ggh.", "..OO.."] },
    crumbs: { layer: "over", x: 11, y: 18, map: ["O.......O"] },
  },
  colors: { ...BASE_COLORS, a: A.fawnDark, b: A.fawn, c: A.fawnLight, d: A.cream, e: P.white },
  backSubst: { d: "b", e: "b", B: "b" },
  mouths: SOFT_MOUTHS,
  stash: { one: "Karotte", many: "Karotten" },
  clips: {},
};

// Karotte mampfen: wird Stück für Stück kürzer, die Ohren zucken
const munch: Clip = {
  fps: 8,
  frames: repeat(18, (i): Frame => ({
    arms: "mouth",
    props: [i < 6 ? "carrot1" : i < 12 ? "carrot2" : "carrot3", ...(i % 4 === 1 ? ["crumbs"] : [])],
    mouth: i % 2 ? "gnaw2" : "gnaw1",
    eyes: i % 6 === 5 ? "happy" : "bead",
    ears: i % 6 === 2 ? "perk" : "up",
    gaze: [0, 1],
  })),
};

// Freudenhüpfer (Binky)
const binky: Clip = {
  fps: 10,
  frames: [
    { body: "squash", eyes: "happy", mouth: "smile" },
    ...[-2, -4, -5, -4, -2].map((y, i): Frame => ({ y, x: i < 2 ? 0 : 1, ears: "perk", eyes: "happy", mouth: "grin", feet: "kick1", flip: i === 2 })),
    { body: "squash", eyes: "happy", mouth: "smile" },
    { eyes: "happy", mouth: "smile" },
    { eyes: "happy", mouth: "smile", ears: "droop" },
    { eyes: "bead", mouth: "smile" },
  ],
};

RABBIT.clips = { ...baseClips(RABBIT), work: munch, binky };
RABBIT.moodExtra = { relaxed: [["binky", 2]] };
RABBIT.stills = {
  busy: { arms: "mouth", props: ["carrot1"], mouth: "gnaw1", gaze: [0, 1] },
  focus: { arms: "mouth", props: ["carrot1", "headband"], mouth: "gnaw1", brows: "focus" },
};

export default RABBIT;
