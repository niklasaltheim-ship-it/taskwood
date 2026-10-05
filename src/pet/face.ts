import type { Brows, Eye, Map, Mouth } from "./types";

// Gesichtsebenen, unabhängig vom Körper kombinierbar. "n" = Pupille/Linie, "w" = Glanz/Zähne.
// Positionen relativ zum Augen- bzw. Mundanker des Tiers. mirror: rechtes Auge gespiegelt zeichnen
// (bei symmetrischen Glanzpunkten nicht, damit das Licht von links oben kommt).

type Feature = { map: Map; dx: number; dy: number; mirror?: boolean };

export const EYES: Record<Eye, Feature> = {
  // Kulleraugen: großer Glanzpunkt oben, kleiner unten
  bead: { map: ["wnn", "nnn", "nnw"], dx: -1, dy: 0 },
  wide: { map: ["nnn", "nwn", "nnn"], dx: -1, dy: 0 },
  closed: { map: ["nnn"], dx: -1, dy: 1 },
  happy: { map: [".n.", "n.n"], dx: -1, dy: 0 },
  halflid: { map: ["nnn", ".wn", ".nn"], dx: -1, dy: 0, mirror: true },
  dizzy: { map: ["n..", ".n.", "n.."], dx: -1, dy: 0, mirror: true },
};

// Augenbrauen über dem linken Auge; rechts gespiegelt
export const BROWS: Record<Exclude<Brows, "none">, Feature> = {
  worried: { map: [".n", "n."], dx: 0, dy: -2, mirror: true },
  focus: { map: ["n.", ".n"], dx: 0, dy: -2, mirror: true },
};

// Mund, 6 breit, Anker oben links. Zähne ("w") gehören beim Biber dazu.
export const MOUTHS: Record<Mouth, Map> = {
  neutral: [".nwwn.", "..ww.."],
  smile: ["n.ww.n", ".nwwn."],
  grin: ["n.ww.n", ".nnnn.", "..nn.."],
  open: ["..ww..", ".nnnn.", ".nnnn.", "..nn.."],
  o: ["..ww..", "..nn..", "..nn.."],
  yawn: ["..ww..", "nnnnnn", "nnnnnn", "nnnnnn", ".nnnn."],
  sad: ["..ww..", ".nwwn.", "n....n"],
  gnaw1: ["..ww..", "..ww.."],
  gnaw2: ["..nn..", "..ww..", "..ww.."],
  nervous: ["..ww..", "n.nn.n", ".n..n."],
  small: ["..ww.."],
};
