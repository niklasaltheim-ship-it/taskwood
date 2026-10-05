import { A, P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, COMMON_PROPS, ITEMS, SOFT_MOUTHS, bodies, stashProps } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Eichhörnchen: helles Fell, weiße Schnauze, Pinselohren, große Schwanzfahne über der Schulter.
// Fleißig: sortiert Nüsse von einem Haufen auf den anderen und stopft sich die Backen.
//   t u   Schwanz      k   Ohrpinsel      N M   Nuss und Nusskappe

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbccccccccbb..",
  ".bbccccccccccbb.",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbeeeebbbbbb",
  "abbbbeeeeeebbbba",
  "abbbeeeeeeeebbba",
  ".abbeeeeeeeebba.",
  "..aabeeeeeebaa..",
  "....aaaeeaaa....",
];

// Pralle Schwanzfahne: Locke über der Schulter, kräftiger Stiel, heller Fellrand
const TAIL: Map = [
  "....uuuuu....",
  "..uutttttuu..",
  ".utttttttttu.",
  "uttttuuutttu.",
  "utttuttttuttu",
  "utttuttttuttu",
  "uttttuutttttu",
  ".uttttttttttu",
  "..uutttttttu.",
  "....uttttttu.",
  ".....utttttu.",
  ".....uttttu..",
  "....utttttu..",
  "...uttttttu..",
  "..uttttttu...",
  ".utttttttu...",
  ".uttttttu....",
  "utttttttu....",
  "uttttttu.....",
  ".utttttu.....",
  "..uuuuu......",
];

const NUT = ITEMS.nut;
const pile = (n: number): Map => (n === 2 ? [".MM..MM.", "MMMMMMMM", "NNNNNNNN", ".NN..NN."] : NUT);

const SQUIRREL: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["nnnn", ".nn."], x: 6, y: 7 },
  muzzle: { rows: [7, 12], char: "e" },
  bodies: bodies(),
  ears: {
    up: { map: ["k...", "kk..", "kdb.", "bddb", "bbbb"], x: 1, y: -4 },
    perk: { map: ["k...", "kk..", "kk..", "kdb.", "bddb", "bbbb"], x: 1, y: -5 },
    droop: { map: ["kkb..", ".bddb", "..bbb"], x: -1, y: -1 },
  },
  arms: ARMS,
  feet: { map: ["aaaa.", "adada"], x: 9, y: 28 },
  tails: {
    down: { map: TAIL, x: 19, y: 3 },
    up: { map: TAIL, x: 20, y: 2 },
    front: { map: ["...tttttttttttt.", ".ttuuuuuuuuuuutt", "ttuuuuuuuuuuuuut", ".tttttttttttttt."], x: 13, y: 24 },
    back: { map: TAIL, x: 10, y: 5 },
  },
  props: {
    ...COMMON_PROPS,
    ...stashProps(ITEMS.nut),
    pileR1: { layer: "ground", x: 25, y: 26, map: pile(1) },
    pileR2: { layer: "ground", x: 24, y: 26, map: pile(2) },
    nutHeld: { layer: "main", x: 14, y: 19, map: NUT },
    nutMouth: { layer: "main", x: 14, y: 15, map: NUT },
    // Volle Backen: Ausbeulungen links und rechts am Kopf
    cheeks: { layer: "main", x: 6, y: 13, map: [".bb................bb.", "bbbb..............bbbb", "bbbb..............bbbb", ".bb................bb."] },
  },
  colors: { ...BASE_COLORS, a: "#7E4F2C", b: "#A86F42", c: "#C79466", d: A.cream, e: P.white, t: "#94592F", u: "#D2A578", k: "#6A3F22", N: P.b2, M: P.b1 },
  backSubst: { d: "b", e: "b" },
  stash: { one: "Nuss", many: "Nüsse" },
  mouths: SOFT_MOUTHS,
  clips: {},
};

// Nüsse sortieren: links nehmen, ansehen, rechts ablegen
const sort: Clip = {
  fps: 6,
  frames: repeat(16, (i): Frame => {
    const phase = Math.floor(i / 4);
    const right = phase < 3 ? "pileR1" : "pileR2";
    if (phase === 0) return { props: [right], gaze: [-1, 1], turn: -1, arms: ["reach1", "rest"], hx: -1 };
    if (phase === 1) return { props: [right, "nutHeld"], arms: "hold", eyes: i % 4 === 2 ? "happy" : "bead", gaze: [0, 1], mouth: "small" };
    if (phase === 2) return { props: [right, "nutHeld"], arms: "hold", gaze: [1, 1], turn: 1, hx: 1 };
    return { props: [right], arms: ["rest", "reach1"], gaze: [1, 1], turn: 1, eyes: i === 15 ? "happy" : "bead", mouth: "smile" };
  }),
};

// Backen stopfen: Nuss zum Mund, kauen, Backen werden dick
const stuff: Clip = {
  fps: 6,
  frames: [
    { props: ["pileR1", "nutHeld"], arms: "hold", gaze: [0, 1] },
    { props: ["pileR1", "nutMouth"], arms: "mouth", mouth: "o" },
    ...repeat(6, (i): Frame => ({ props: ["pileR1", "cheeks"], mouth: i % 2 ? "gnaw2" : "gnaw1", eyes: "happy", arms: "hold" })),
    { props: ["pileR1", "cheeks"], eyes: "bead", mouth: "small", blush: true },
    { props: ["pileR1", "cheeks"], eyes: "bead", mouth: "small", blush: true },
  ],
};

SQUIRREL.clips = { ...baseClips(SQUIRREL), work: sort, stuff };
SQUIRREL.moodExtra = { busy: [["stuff", 2]], relaxed: [["stuff", 1]] };
SQUIRREL.stills = {
  busy: { props: ["pileR1", "nutHeld"], arms: "hold", gaze: [0, 1] },
  focus: { props: ["pileR1", "nutHeld", "headband"], arms: "hold", gaze: [0, 1], brows: "focus" },
};

export default SQUIRREL;
