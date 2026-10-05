// Gemeinsame Typen der Tier-Engine.
//
// Ein Bild (Frame) wird aus Teilen zusammengesetzt: Schwanz, Körper, Füße, Ohren, Kopf, Gesicht
// (Augen, Brauen, Nase, Mund) und Pfoten, dazu Requisiten. Koordinaten der Teile beziehen sich auf
// ein 32x32-Raster; die Leinwand ist größer, damit Sprünge und Wecker nicht abgeschnitten werden.

export type Map = string[];

export type Body = "sit" | "squash" | "tall" | "curl" | "curl2" | "ball"; // ball: eingerollter Igel
export type Eye = "bead" | "wide" | "closed" | "happy" | "halflid" | "dizzy";
export type Mouth = "neutral" | "smile" | "grin" | "open" | "o" | "yawn" | "sad" | "gnaw1" | "gnaw2" | "nervous" | "small";
export type Brows = "none" | "worried" | "focus";
export type Ears = "up" | "perk" | "droop";
export type Arm = "rest" | "hold" | "mouth" | "up1" | "up2" | "stretch" | "groom1" | "groom2" | "wipe1" | "wipe2" | "out1" | "out2" | "clock" | "reach1" | "reach2" | "none";
export type Feet = "sit" | "step1" | "step2" | "kick1" | "kick2" | "none";
export type Tail = "down" | "up" | "front" | "none";

export type Frame = {
  body?: Body;
  back?: boolean; // Rückansicht (Pirouette)
  x?: number; // ganze Figur verschieben
  y?: number;
  hx?: number; // nur Kopf verschieben (Nicken, Neigen)
  hy?: number;
  turn?: -1 | 0 | 1; // Kopf leicht zur Seite gedreht (3/4-Ansicht)
  eyes?: Eye | [Eye, Eye];
  gaze?: [number, number];
  mouth?: Mouth;
  brows?: Brows;
  blush?: boolean; // Bäckchen; standardmäßig an, false schaltet sie aus
  ears?: Ears;
  arms?: Arm | [Arm, Arm]; // [links, rechts] vom Betrachter aus
  feet?: Feet;
  tail?: Tail;
  props?: string[]; // Name, optional mit Versatz: "clock@1,0"
  flip?: boolean;
};

export type Clip = { fps: number; frames: Frame[] };

// Ein Teil: Karte plus Position (linke obere Ecke im 32er-Raster)
export type Part = { map: Map; x: number; y: number };
export type PartSet<K extends string> = Partial<Record<K, Part>>;

// Requisite: "main" wird mit der Figur umrandet, "mid" liegt zwischen Kopf und Gesicht,
// "over" schwebt ohne Kontur darüber (Zzz, Herzen, Schweiß)
// "ground" steht fest am Boden und hüpft nicht mit (Vorrat neben dem Tier)
export type Prop = Part & { layer: "ground" | "back" | "mid" | "main" | "over" };

export type Species = {
  head: Part; // Position bei Sitzhaltung
  curlHead: [number, number]; // Kopfposition beim Schlafen
  nose: Part; // relativ zum Kopf
  muzzle: { rows: [number, number]; char: string }; // Schnauzenbereich, der beim Drehen mitwandert
  bodies: PartSet<Body>;
  ears: PartSet<Ears>; // linkes Ohr, relativ zum Kopf; rechts wird gespiegelt
  arms: PartSet<Arm>; // linker Arm; rechts wird gespiegelt
  feet: Part; // linker Fuß
  tails: PartSet<Tail | "back">;
  props: Record<string, Prop>;
  colors: Record<string, string>; // Zeichen -> Farbe
  backSubst: Record<string, string>; // Rückansicht: Bauch/Schnauze in Fellfarbe
  clips: Record<string, Clip>;
  stills?: Partial<Record<MoodState, Frame>>; // tiertypische Standbilder
  mouths?: Partial<Record<Mouth, Map>>; // eigene Mundformen (sonst Biber mit Zähnen)
  face?: { eye: [number, number]; mouth: [number, number] }; // Anker relativ zum Kopf (sonst aus der Nase)
  lidSubst?: Record<string, string>; // Lidlinien umfärben, z. B. hell auf der Waschbärmaske
  moodExtra?: Partial<Record<MoodState, [string, number][]>>; // tiertypische Zusatz-Clips je Stimmung
  stash?: { one: string; many: string }; // Vorrat aus erledigten Aufgaben (Props stash1..stash6)
};

// event: ein Kalendertermin beginnt gerade
export type MoodState = "sleep" | "relaxed" | "busy" | "stress" | "bored" | "focus" | "alarm" | "event";
