import { A, P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, COMMON_PROPS, SOFT_MOUTHS, bodies } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Fuchs: rotbraunes Fell, weiße Wangen, spitze Ohren, buschiger Schwanz mit weißer Spitze.
// Fleißig: studiert eine Karte, der Schwanz wedelt.
//   t u   Schwanz      p r   Karte (Papier, Wege)

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbbccccccbbb..",
  ".bbbccccccccbbb.",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "bbbbbbbbbbbbbbbb",
  "wbbbbbbbbbbbbbbw",
  "wwbbbbbwwbbbbbww",
  ".wwwbbwwwwbbwww.",
  "..wwwwwwwwwwww..",
  "...wwwwwwwwww...",
  ".....wwwwww.....",
  "......wwww......",
];

const TAIL: Map = [
  ".......www.",
  "......wwwww",
  ".....twwwww",
  "....tttwwww",
  "...tttttww.",
  "..ttttttt..",
  ".ttttuttt..",
  ".tttuttt...",
  "ttttuttt...",
  "tttuttt....",
  ".ttttt.....",
  "..ttt......",
];

const FOX: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["nn"], x: 7, y: 8 },
  face: { eye: [4, 4], mouth: [5, 9] },
  muzzle: { rows: [7, 12], char: "w" },
  bodies: bodies(),
  ears: {
    up: { map: ["n...", "nb..", "bdb.", "bddb", "bddb"], x: 1, y: -4 },
    perk: { map: ["n...", "nb..", "bdb.", "bddb", "bddb", "bddb"], x: 1, y: -5 },
    droop: { map: ["nnb..", ".bddb", "..bdb"], x: -1, y: -1 },
  },
  arms: ARMS,
  feet: { map: ["nnnn.", "nnnnn"], x: 9, y: 28 },
  tails: {
    down: { map: TAIL, x: 20, y: 16 },
    up: { map: TAIL, x: 21, y: 14 },
    front: { map: ["...ttttttttttwww", ".tttttuuttttwwww", "ttttttttttttwwww", ".ttttttttttttww."], x: 14, y: 25 },
    back: { map: TAIL, x: 10, y: 17 },
  },
  props: {
    ...COMMON_PROPS,
    foxmap: {
      layer: "main",
      x: 11,
      y: 19,
      map: ["KKKKKKKKKK", "KppppprppK", "KprrrprppK", "KpppprrrpK", "KprppppnpK", "KpprrrrppK", "KKKKKKKKKK"],
    },
  },
  colors: { ...BASE_COLORS, a: A.rustDark, b: A.rust, c: A.rustLight, d: A.cream, e: P.white, t: A.rust, u: A.rustLight, p: P.g1, r: P.g3 },
  backSubst: { d: "b", e: "b", w: "b" },
  mouths: SOFT_MOUTHS,
  clips: {},
};

// Karte lesen: Blick wandert die Wege entlang, zwischendurch ein "Aha!"
const GAZE: [number, number][] = [[-1, 1], [-1, 1], [0, 1], [0, 1], [1, 1], [1, 1], [1, 1], [0, 1]];
const study: Clip = {
  fps: 6,
  frames: repeat(16, (i): Frame => {
    const aha = i >= 12 && i < 15;
    return {
      arms: "hold",
      props: [i % 5 === 4 ? "foxmap@0,-1" : "foxmap"],
      gaze: aha ? [0, -1] : GAZE[i % 8],
      eyes: aha ? "wide" : "bead",
      ears: aha ? "perk" : "up",
      mouth: aha ? "o" : "small",
      hx: i % 8 < 4 ? -1 : 0,
      tail: Math.floor(i / 2) % 2 ? "up" : "down",
    };
  }),
};

// Schwanzwedeln aus Freude zwischendurch
const wag: Clip = {
  fps: 8,
  frames: repeat(10, (i): Frame => ({ tail: i % 2 ? "up" : "down", eyes: i > 2 && i < 8 ? "happy" : "bead", mouth: "smile" })),
};

FOX.clips = { ...baseClips(FOX), work: study, wag };
FOX.moodExtra = { relaxed: [["wag", 2]] };
FOX.stills = {
  busy: { arms: "hold", props: ["foxmap"], gaze: [0, 1], mouth: "small" },
  focus: { arms: "hold", props: ["foxmap", "headband"], gaze: [0, 1], brows: "focus" },
};

export default FOX;
