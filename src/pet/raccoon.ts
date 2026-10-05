import { P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, COMMON_PROPS, bodies } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Waschbär: graues Fell, dunkle Maske, weiße Schnauze, Ringelschwanz.
// Fleißig: wäscht eine Frucht in der Pfütze. Eigenheit: putzt sich die Maske.
//   m   Maske      r q   Schwanzringe dunkel / hell      p   Pfütze

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbbbbbbbbbbb..",
  ".bbbbbbaabbbbbb.",
  "bwwbbbbaabbbbwwb",
  "mmmmmmbaabmmmmmm",
  "mmmmmmmbbmmmmmmm",
  "bmmmmmwwwwmmmmmb",
  "bbmmmwwwwwwmmmbb",
  "abbwwwwwwwwwwbba",
  "abwwwwwwwwwwwwba",
  ".abwwwwwwwwwwba.",
  "..aabwwwwwwbaa..",
  "....aaawwaaa....",
];

const TAIL: Map = [
  ".......rrr.",
  "......rrrrr",
  ".....qqqqqr",
  "....rqqqqq.",
  "...rrrrrr..",
  "..qqqqqr...",
  ".rqqqqq....",
  "rrrrrr.....",
  "rrrr.......",
];

const RACCOON: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["nnnn", ".nn."], x: 6, y: 7 },
  muzzle: { rows: [7, 12], char: "w" },
  bodies: bodies(),
  ears: {
    up: { map: [".ww.", "waaw", "wbbw"], x: 1, y: -2 },
    perk: { map: [".ww.", "waaw", "waaw", "wbbw"], x: 1, y: -3 },
    droop: { map: ["ww..", "waaw", ".wbb"], x: 0, y: 0 },
  },
  arms: ARMS,
  feet: { map: ["mmmm.", "mmmmm"], x: 9, y: 28 },
  tails: {
    down: { map: TAIL, x: 20, y: 19 },
    up: { map: TAIL, x: 21, y: 17 },
    front: { map: ["..rrqqqrrrqqqrr.", ".rrrqqqrrrqqqrrr", "rrrrqqqrrrqqqrrr", ".rrrqqqrrrqqqrr."], x: 14, y: 26 },
    back: { map: ["..rrrr..", ".rrrrrr.", ".qqqqqq.", ".qqqqqq.", ".rrrrrr.", ".rrrrrr.", ".qqqqqq.", "..qqqq.."], x: 12, y: 19 },
  },
  props: {
    ...COMMON_PROPS,
    puddle: {
      layer: "back",
      x: 2,
      y: 29,
      map: ["......pppppppppppppppp......", "..ppppwwppppppppppppwwpppp..", "......pppppppppppppppp......"],
    },
    fruit: { layer: "main", x: 14, y: 25, map: [".h.", "ggg", "ggg"] },
    splash1: { layer: "over", x: 9, y: 24, map: ["w..........w", ".w........w."] },
    splash2: { layer: "over", x: 7, y: 22, map: ["w..............w", "................", ".w............w."] },
  },
  colors: { ...BASE_COLORS, a: P.g3, b: P.g2, c: P.g1, d: P.g1, e: P.white, m: P.g3, r: P.g4, q: P.g1, p: P.g1 },
  backSubst: { d: "b", e: "b", w: "b", m: "b" },
  lidSubst: { n: "w" }, // geschlossene Augen hell auf der dunklen Maske
  mouths: {
    neutral: [".n..n.", "..nn.."],
    smile: ["n....n", ".nnnn."],
    grin: ["n....n", ".nnnn.", ".nnnn.", "..nn.."],
    open: ["..nn..", ".nnnn.", ".nnnn.", "..nn.."],
    o: ["..nn..", "..nn.."],
    yawn: [".nnnn.", "nnnnnn", "nnnnnn", ".nnnn."],
    sad: ["..nn..", ".n..n."],
    gnaw1: ["..nn.."],
    gnaw2: [".n..n.", "..nn.."],
    nervous: ["n.nn.n", ".n..n."],
    small: ["..nn.."],
  },
  clips: {},
};

// In der Pfütze waschen: Pfoten tauchen abwechselnd ein, es spritzt
const wash: Clip = {
  fps: 8,
  frames: repeat(16, (i): Frame => ({
    props: ["puddle", "fruit", ...(i % 4 === 1 ? ["splash1"] : i % 4 === 2 ? ["splash2"] : [])],
    arms: i % 2 ? "reach2" : "reach1",
    hy: 1,
    gaze: [i % 8 < 4 ? -1 : 1, 1],
    eyes: i % 8 === 6 ? "happy" : "bead",
    mouth: i % 8 === 6 ? "smile" : "small",
  })),
};

// Maske putzen: beide Pfoten reiben über die Augen
const mask: Clip = {
  fps: 8,
  frames: [
    ...repeat(8, (i): Frame => ({ arms: i % 2 ? "groom2" : "groom1", eyes: "closed", mouth: "small" })),
    { eyes: "happy", mouth: "smile" },
    { eyes: "happy", mouth: "smile" },
    {},
  ],
};

RACCOON.clips = { ...baseClips(RACCOON), work: wash, mask };
RACCOON.moodExtra = { relaxed: [["mask", 2]], busy: [["mask", 1]] };
RACCOON.stills = {
  busy: { props: ["puddle", "fruit"], arms: "reach1", hy: 1, gaze: [0, 1] },
  focus: { props: ["puddle", "fruit", "headband"], arms: "reach1", hy: 1, gaze: [0, 1], brows: "focus" },
};

export default RACCOON;
