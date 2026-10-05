import { t } from "./i18n";

// Tierarten, Farbpalette und Oberflächen-Farbthemen. Die Pixel-Art selbst liegt in src/pet/.

export type AnimalKind = "beaver" | "fox" | "squirrel" | "raccoon" | "hedgehog" | "owl" | "rabbit";

export const ANIMALS: { kind: AnimalKind; name: string }[] = [
  { kind: "beaver", name: "Biber" },
  { kind: "fox", name: "Fuchs" },
  { kind: "squirrel", name: "Eich­hörnchen" },
  { kind: "raccoon", name: "Waschbär" },
  { kind: "hedgehog", name: "Igel" },
  { kind: "owl", name: "Eule" },
  { kind: "rabbit", name: "Hase" },
];

export const isAnimal = (v: unknown): v is AnimalKind => ANIMALS.some(a => a.kind === v);

// Angezeigter Name in der eingestellten Sprache (Trennhinweis nur im Deutschen)
export const animalName = (kind: AnimalKind) => {
  const de = ANIMALS.find(a => a.kind === kind)!.name;
  const en = t(de.replace("\u00AD", ""));
  return en === de.replace("\u00AD", "") ? de : en;
};

// Waldpalette
export const P = {
  b1: "#582F0E", b2: "#7F4F24", b3: "#936639", b4: "#A68A64", b5: "#B6AD90",
  g1: "#C2C5AA", g2: "#A4AC86", g3: "#656D4A", g4: "#414833", g5: "#333D29",
  white: "#F4F0E4",
};

// Warme Akzente für die Tiere, gedämpft passend zur Waldpalette
export const A = {
  blush: "#D99A86", // Bäckchen
  pink: "#C97A68", // Herzen, Hasenohren
  rust: "#B5622F", // Fuchsfell
  rustDark: "#8A4422",
  rustLight: "#D08A55",
  cream: "#EFE4CC",
  apple: "#B4483A",
  carrot: "#D9822F",
  amber: "#D9A441", // Schnabel, Krallen
  taupe: "#6B5949", // Igelstacheln
  taupeLight: "#8E7763",
  tan: "#C9A27E", // Igelgesicht
  tanDark: "#9C7A5C",
  fawn: "#B8AA98", // Hase
  fawnDark: "#8F8374",
  fawnLight: "#D8CFC0",
};

// Oberflächen-Farbthema je Tier.
//   head      Kopfzeile            headText  Schrift und Symbole darauf
//   accent    Häkchen, Zähler, Buttons
//   strong    dunkle Themenfarbe für Schrift auf hellem Grund
//   soft      Tönung des Fensterhintergrunds
export type Theme = { head: string; headText: string; accent: string; strong: string; soft: string };

export const THEMES: Record<AnimalKind, Theme> = {
  beaver: { head: P.b1, headText: P.b5, accent: P.b2, strong: P.b1, soft: P.b4 },
  fox: { head: P.b3, headText: P.white, accent: P.b2, strong: P.b2, soft: P.b5 },
  squirrel: { head: P.b5, headText: P.b1, accent: P.b3, strong: P.b2, soft: P.b5 },
  raccoon: { head: P.g2, headText: P.g5, accent: P.g3, strong: P.g4, soft: P.g1 },
  hedgehog: { head: P.g4, headText: P.g1, accent: P.g3, strong: P.g4, soft: P.g2 },
  owl: { head: P.g5, headText: P.b5, accent: P.b3, strong: P.g4, soft: P.b5 },
  rabbit: { head: P.g1, headText: P.g5, accent: P.g3, strong: P.g4, soft: P.g1 },
};
