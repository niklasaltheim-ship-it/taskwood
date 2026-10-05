import { P } from "../sprites";
import { baseClips, repeat } from "./clips";
import { ARMS, BASE_COLORS, BODY, COMMON_PROPS, ITEMS, bodies, stashProps, without } from "./common";
import type { Clip, Frame, Map, Species } from "./types";

// Eule: rundes Gesicht mit hellem Schleier, Federohren, Schnabel, gemusterte Brust.
// Fleißig: liest mit Brille in einem Buch und blättert um. Vorrat: Bücher. Eigenheit: ruft "Huhu".
//   Y   Schnabel und Krallen      r   Buchzeilen

const HEAD: Map = [
  "....bbbbbbbb....",
  "..bbbbbbbbbbbb..",
  ".bbddddbbddddbb.",
  "bbddddddddddddbb",
  "bddddddddddddddb",
  "bddddddddddddddb",
  "bddddddddddddddb",
  "bbddddddddddddbb",
  "abbddddddddddbba",
  "abbbddddddddbbba",
  ".abbbbddddbbbba.",
  "..aabbbbbbbbaa..",
  "....aaaaaaaa....",
];

// Brustfedern als kleine Bögen
const OWL_BODY: Map = BODY.map((row, y) =>
  [...row].map((ch, x) => (ch === "e" && y >= 3 && y <= 8 && (x + (y % 2) * 2) % 4 === 0 ? "c" : ch)).join("")
);

const OWL: Species = {
  head: { map: HEAD, x: 8, y: 6 },
  curlHead: [8, 7], // Eulen schlafen im Sitzen
  nose: { map: ["YY", "YY"], x: 7, y: 7 },
  face: { eye: [4, 4], mouth: [5, 9] },
  muzzle: { rows: [8, 10], char: "d" },
  bodies: {
    ...bodies(OWL_BODY),
    curl: { map: OWL_BODY, x: 7, y: 16 },
    curl2: { map: without(OWL_BODY, 5), x: 7, y: 17 },
  },
  ears: {
    up: { map: ["a...", "ab..", "abb."], x: 1, y: -3 },
    perk: { map: ["a...", "a...", "ab..", "abb."], x: 1, y: -4 },
    droop: { map: ["aab.", ".abb"], x: 0, y: -1 },
  },
  arms: ARMS,
  feet: { map: ["YYYY.", "Y.Y.Y"], x: 9, y: 28 },
  tails: {
    back: { map: ["..aaaa..", ".abbbba.", "abbbbbba", "babbbbab"], x: 12, y: 24 },
  },
  props: {
    ...COMMON_PROPS,
    ...stashProps(ITEMS.book),
    book: { layer: "main", x: 10, y: 19, map: ["KKKKK.KKKKK", "KwrwwKwwrwK", "KwwrwKwrwwK", "KwrwwKwwrwK", "KKKKKKKKKKK"] },
    book2: { layer: "main", x: 10, y: 18, map: ["......KK...", "KKKKK.KwK..", "KwrwwKKwKK.", "KwwrwKwwrwK", "KwrwwKwwrwK", "KKKKKKKKKKK"] },
    specs: { layer: "mid", x: 10, y: 9, map: ["KKKKK..KKKKK", "K...KKKK...K", "K...K..K...K", "KKKKK..KKKKK"] },
    // Eulen schlafen im Sitzen: Zzz über dem Kopf statt daneben
    zzz1: { ...COMMON_PROPS.zzz1, x: 23, y: 3 },
    zzz2: { ...COMMON_PROPS.zzz2, x: 25, y: -1 },
    zzz3: { ...COMMON_PROPS.zzz3, x: 28, y: -5 },
    hoot1: { layer: "over", x: 24, y: 9, map: ["z.", ".z", "z."] },
    hoot2: { layer: "over", x: 26, y: 7, map: ["z..", ".z.", "..z", ".z.", "z.."] },
  },
  colors: { ...BASE_COLORS, a: "#5E4630", b: "#8A6A4A", c: "#A88763", d: "#EFE4CC", e: P.white, r: P.g3 },
  backSubst: { d: "b", e: "b", c: "b" },
  mouths: {
    neutral: [],
    smile: ["n....n"],
    grin: ["..nn..", "..nn.."],
    open: ["..nn..", "..nn.."],
    o: ["..nn.."],
    yawn: [".nnnn.", ".nnnn."],
    sad: [],
    gnaw1: [],
    gnaw2: ["..nn.."],
    nervous: [".n..n."],
    small: [],
  },
  stash: { one: "Buch", many: "Bücher" },
  clips: {},
};

// Lesen: Blick wandert über die Zeilen, ab und zu wird umgeblättert
const read: Clip = {
  fps: 6,
  frames: repeat(16, (i): Frame => ({
    arms: "hold",
    props: [i === 7 || i === 15 ? "book2" : "book", "specs"],
    gaze: [[-1, 1], [0, 1], [1, 1], [1, 1]][i % 4] as [number, number],
    eyes: i === 11 ? "happy" : "bead",
    hy: i === 7 || i === 15 ? 1 : 0,
  })),
};

// Huhu: plustert sich auf und ruft
const hoot: Clip = {
  fps: 6,
  frames: [
    { body: "squash", eyes: "closed" },
    { body: "tall", eyes: "closed", mouth: "o", props: ["hoot1"] },
    { body: "tall", eyes: "closed", mouth: "o", props: ["hoot1", "hoot2"] },
    { eyes: "happy", props: ["hoot2"] },
    { body: "tall", eyes: "closed", mouth: "o", props: ["hoot1"] },
    { body: "tall", eyes: "closed", mouth: "o", props: ["hoot1", "hoot2"] },
    { eyes: "happy" },
    {},
  ],
};

OWL.clips = { ...baseClips(OWL), work: read, hoot };
OWL.moodExtra = { relaxed: [["hoot", 1]] };
OWL.stills = {
  busy: { arms: "hold", props: ["book", "specs"], gaze: [0, 1] },
  focus: { arms: "hold", props: ["book", "specs", "headband"], gaze: [0, 1], brows: "focus" },
};

export default OWL;
