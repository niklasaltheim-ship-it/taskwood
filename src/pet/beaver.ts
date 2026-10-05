import { P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, COMMON_PROPS, FEET, ITEMS, bodies, stashProps } from "./common";
import type { Clip, Map, Species } from "./types";

// Biber: braunes Fell, große Zähne, Kelle. Fleißig: nagt an einem Ast, die Kelle klopft.
//   t T   Kelle

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbccccccccbb..",
  ".bbccccccccccbb.",
  "bbccccccccccccbb",
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

const BEAVER: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [3, 17],
  nose: { map: ["nnnn", ".nn."], x: 6, y: 7 },
  muzzle: { rows: [7, 12], char: "d" },
  bodies: bodies(),
  ears: {
    up: { map: [".aa.", "adda", "abba"], x: 1, y: -2 },
    perk: { map: [".aa.", "adda", "adda", "abba"], x: 1, y: -3 },
    droop: { map: ["aa..", "adaa", ".abb"], x: 0, y: 0 },
  },
  arms: ARMS,
  feet: FEET,
  tails: {
    down: { map: [".....ttt...", "...ttTtTt..", "..tTtTtTtt.", ".tTtTtTtTtt", "ttTtTtTtTt.", ".tTtTtTtt..", "..tttt....."], x: 21, y: 22 },
    up: { map: ["......tt.", ".....tTtt", "....tTtTt", "...tTtTt.", "..tTtTt..", ".tTtTt...", "tTtTt....", "tttt.....", ".tt......"], x: 22, y: 15 },
    front: { map: ["..tttttttttt..", ".tTtTtTtTtTtt.", "tTtTtTtTtTtTtt", ".tttttttttttt."], x: 17, y: 26 },
    back: { map: ["...tttt...", "..tTtTtt..", ".ttTtTtTt.", ".tTtTtTtt.", ".ttTtTtTt.", ".tTtTtTtt.", ".ttTtTtTt.", "..tTtTtt..", "...tttt..."], x: 11, y: 20 },
  },
  props: {
    ...COMMON_PROPS,
    ...stashProps(ITEMS.log),
    // Ast quer im Maul: zwischen Kopf und Gesicht, damit die Zähne darüber liegen
    branch: { layer: "mid", x: 4, y: 16, map: [".hg....................", "KacccccaccccccccacccccK", "....................gh."] },
    chips1: { layer: "over", x: 8, y: 14, map: ["y..............y"] },
    chips2: { layer: "over", x: 7, y: 12, map: ["y................y"] },
    chips3: { layer: "over", x: 6, y: 10, map: ["y..................y"] },
  },
  colors: { ...BASE_COLORS, a: P.b1, b: P.b2, c: P.b3, d: P.b4, e: P.b5, t: P.g4, T: P.g3 },
  backSubst: { d: "b", e: "c" },
  stash: { one: "Holzstück", many: "Holzstücke" },
  clips: {},
};

const gnaw: Clip = {
  fps: 8,
  frames: repeat(16, i => ({
    arms: "mouth",
    props: ["branch", ...[["chips1"], ["chips2"], ["chips3"], []][Math.floor(i / 2) % 4]],
    mouth: i % 2 ? "gnaw2" : "gnaw1",
    eyes: i % 8 === 7 ? "happy" : "bead",
    gaze: [0, 1],
    tail: i % 4 < 2 ? "down" : "up",
    hy: i % 2,
  })),
};

BEAVER.clips = { ...baseClips(BEAVER), work: gnaw };
BEAVER.stills = {
  busy: { arms: "mouth", props: ["branch"], mouth: "gnaw2", gaze: [0, 1] },
  focus: { arms: "mouth", props: ["branch", "headband"], mouth: "gnaw2", brows: "focus" },
};

export default BEAVER;
