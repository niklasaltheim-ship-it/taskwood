import type { Arm, Clip, Frame, MoodState, Species } from "./types";

export const repeat = (n: number, f: (i: number) => Frame): Frame[] => Array.from({ length: n }, (_, i) => f(i));
const times = (n: number, frames: Frame[]): Frame[] => Array.from({ length: n }, () => frames).flat();

// Clips, die alle Tiere teilen. Die tiertypische Arbeit ("work") und Eigenheiten kommen vom Tier.
export function baseClips(_sp: Species): Record<string, Clip> {
  const happy: Frame = { eyes: "happy", mouth: "smile" };
  const nervous: Frame = { brows: "worried", mouth: "nervous" };

  // Sprung mit Jubel; landet gestaucht
  const jump = (h: number, extra: Frame = {}): Frame[] => [
    { body: "squash", ...happy, ...extra },
    ...[-2, -4, -h, -h, -4, -2].map((y, i): Frame => ({
      y,
      arms: "up1",
      eyes: "happy",
      mouth: "grin",
      feet: "kick1",
      ...extra,
      props: [i % 2 ? "stars1" : "stars2", ...(extra.props ?? [])],
    })),
    { body: "squash", ...happy, ...extra },
  ];
  // Pirouette: Seite, Rücken, andere Seite
  const spin: Frame[] = [
    { turn: 1, ...happy },
    { back: true },
    { back: true, flip: true },
    { turn: -1, ...happy, flip: true },
    { ...happy },
  ];

  return {
    // ---------- Entspannt ----------
    idle: {
      fps: 6,
      frames: [{}, {}, {}, { body: "squash" }, { body: "squash" }, {}, {}, {}, { hy: 1 }, { hy: 1 }, {}, {}],
    },
    look: {
      fps: 6,
      frames: [
        ...times(5, [{ gaze: [-1, 0], turn: -1 }]),
        {},
        ...times(5, [{ gaze: [1, 0], turn: 1 }]),
        { gaze: [0, -1] },
        {},
      ],
    },
    groom: {
      fps: 8,
      frames: [
        ...times(5, [
          { arms: ["groom1", "rest"], eyes: "closed", mouth: "small" },
          { arms: ["groom2", "rest"], eyes: "closed", mouth: "small", hx: -1 },
        ]),
        ...times(3, [{ ...happy }]),
      ],
    },
    yawn: {
      fps: 6,
      frames: [
        { eyes: "halflid" },
        { eyes: "closed", mouth: "o", body: "tall" },
        ...times(4, [{ eyes: "closed", mouth: "yawn", body: "tall", ears: "perk" }]),
        { eyes: "closed", mouth: "o" },
        { eyes: "halflid", mouth: "small" },
        { eyes: "halflid", mouth: "small" },
        {},
      ],
    },
    stretch: {
      fps: 6,
      frames: [
        { body: "squash" },
        ...times(5, [{ arms: "stretch", body: "tall", eyes: "closed", mouth: "smile", feet: "step1" }]),
        { body: "squash", ...happy },
        { ...happy },
        {},
      ],
    },

    // ---------- Fleißig ----------
    wipe: {
      fps: 6,
      frames: [
        { eyes: "halflid", props: ["sweat1"] },
        ...times(2, [
          { arms: ["wipe1", "rest"], eyes: "closed", mouth: "small", props: ["sweat1"] },
          { arms: ["wipe2", "rest"], eyes: "closed", mouth: "small", props: ["sweat2"] },
        ]),
        { arms: ["wipe2", "rest"], eyes: "closed", mouth: "o" },
        ...times(3, [{ ...happy }]),
      ],
    },

    // ---------- Gestresst ----------
    pace: {
      fps: 8,
      frames: [0, -1, -2, -3, -3, -2, -1, 0, 1, 2, 3, 3, 2, 1].map((x, i, a): Frame => {
        const dir = i < 4 ? -1 : i < 11 ? 1 : -1;
        return {
          x,
          turn: dir as -1 | 1,
          gaze: [dir, 0],
          feet: i % 2 ? "step1" : "step2",
          hy: i % 2,
          ...nervous,
          props: [i % 4 < 2 ? "sweat1" : "sweat2", i % 2 ? "fluff1" : "fluff2"],
          tail: i === a.length - 1 ? "up" : "down",
        };
      }),
    },
    glance: {
      fps: 6,
      frames: [
        { ...nervous, gaze: [-1, 0], props: ["sweat1", "fluff1"] },
        { ...nervous, gaze: [-1, 0], props: ["sweat1", "fluff1"] },
        { ...nervous, gaze: [1, 0], props: ["sweat2", "fluff2"] },
        { ...nervous, gaze: [1, 0], turn: 1, props: ["sweat2", "fluff2"] },
        { ...nervous, eyes: "wide", ears: "perk", props: ["sweatL", "fluff1"] },
        { ...nervous, gaze: [-1, 0], props: ["sweatL", "fluff2"] },
        { ...nervous, props: ["sweat1", "fluff1"] },
        { ...nervous, props: ["sweat1", "fluff1"], arms: "hold" },
        { ...nervous, props: ["sweat2", "fluff2"], arms: "hold" },
      ],
    },

    // ---------- Gelangweilt ----------
    mope: {
      fps: 4,
      frames: repeat(10, i => ({
        ears: "droop",
        eyes: i === 6 ? "closed" : "halflid",
        gaze: [i < 5 ? -1 : 0, 1],
        mouth: "small",
        hy: 1,
        arms: "hold",
      })),
    },
    sigh: {
      fps: 4,
      frames: [
        { ears: "droop", eyes: "halflid", mouth: "small", hy: 1, arms: "hold" },
        { ears: "droop", eyes: "closed", mouth: "o", body: "tall", arms: "hold" },
        { ears: "droop", eyes: "closed", mouth: "small", body: "squash", hy: 1, arms: "hold" },
        { ears: "droop", eyes: "closed", mouth: "small", body: "squash", hy: 1, arms: "hold" },
        { ears: "droop", eyes: "halflid", mouth: "small", hy: 1, arms: "hold", gaze: [1, 1] },
        { ears: "droop", eyes: "halflid", mouth: "smile", hy: 1, arms: "hold", gaze: [1, 0] },
      ],
    },

    // ---------- Schlafen ----------
    sleep: {
      fps: 3,
      frames: [
        { body: "curl", eyes: "closed", mouth: "small", props: [] },
        { body: "curl", eyes: "closed", mouth: "small", props: ["zzz1"] },
        { body: "curl2", eyes: "closed", mouth: "small", props: ["zzz1", "zzz2"] },
        { body: "curl2", eyes: "closed", mouth: "small", props: ["zzz2", "zzz3"] },
        { body: "curl", eyes: "closed", mouth: "small", props: ["zzz3"] },
        { body: "curl", eyes: "closed", mouth: "small", props: [] },
      ],
    },
    // Maus über dem schlafenden Tier: blinzelt, schaut, schläft wieder ein, sobald sie weg ist
    peek: {
      fps: 4,
      frames: [
        { body: "curl", eyes: ["closed", "halflid"], mouth: "small" },
        ...times(6, [{ body: "curl", eyes: "bead", mouth: "small" }]),
        { body: "curl", eyes: "closed", mouth: "small" },
        ...times(3, [{ body: "curl2", eyes: "bead", mouth: "o" }]),
      ],
    },

    // ---------- Ereignisse ----------
    done: {
      fps: 10,
      frames: [...jump(5), ...spin, ...times(5, [{ arms: ["rest", "up1"], ...happy }]), { ...happy }],
    },
    allDone: {
      fps: 10,
      frames: [
        ...jump(6),
        ...jump(6, { props: ["heart3"] }),
        ...spin,
        ...times(6, [{ arms: "up1", eyes: "happy", mouth: "grin", props: ["heart1", "stars1"] }, { arms: "up2", eyes: "happy", mouth: "grin", props: ["heart2", "stars2"] }]),
        ...times(4, [{ eyes: "happy", mouth: "small", blush: true }]),
        ...times(3, [{ eyes: "closed", mouth: "yawn", body: "tall" }]),
        ...times(4, [{ eyes: "closed", mouth: "small", body: "squash" }]),
      ],
    },
    added: {
      fps: 8,
      frames: [
        { ears: "perk", eyes: "wide", mouth: "o" },
        ...times(4, [{ ears: "perk", eyes: "bead", gaze: [0, -1], mouth: "o" }]),
        { hy: 1, ...happy },
        { hy: 0, ...happy },
        { hy: 1, ...happy },
        ...times(3, [{ ...happy }]),
      ],
    },
    wave: {
      fps: 8,
      frames: [
        ...times(3, [{ arms: ["rest", "up1"], ...happy }, { arms: ["rest", "up2"], ...happy }]),
        { arms: ["rest", "up1"], ...happy },
        { ...happy },
      ],
    },
    held: {
      fps: 10,
      frames: [
        { arms: "out1", feet: "kick1", eyes: "wide", mouth: "open", tail: "up", ears: "perk" },
        { arms: "out2", feet: "kick2", eyes: "wide", mouth: "open", tail: "up", ears: "perk" },
        { arms: "out1", feet: "kick2", eyes: "wide", mouth: "o", tail: "down", ears: "perk" },
        { arms: "out2", feet: "kick1", eyes: "wide", mouth: "o", tail: "up", ears: "perk" },
      ],
    },
    land: {
      fps: 10,
      frames: [
        { body: "squash", eyes: "closed", mouth: "o" },
        { body: "squash", eyes: "closed", mouth: "small" },
        { body: "tall", eyes: "bead" },
        {},
        ...[-1, 1, -1, 1, -1, 1].map((x, i): Frame => ({ x, hx: -x, eyes: "dizzy", mouth: "small", ears: i % 2 ? "perk" : "up", props: [i % 2 ? "fluff1" : "fluff2"] })),
        { ...happy },
        { ...happy },
      ],
    },
    cuddle: {
      fps: 5,
      frames: repeat(9, i => ({
        hx: 1,
        hy: 1,
        turn: 1,
        eyes: "happy",
        mouth: "smile",
        blush: true,
        arms: "hold",
        props: [["heart1"], ["heart1", "heart3"], ["heart2", "heart3"], ["heart2"], [], [], ["heart3"], ["heart3", "heart1"], ["heart1"]][i],
      })),
    },
    // Gestreichelt werden: Augen zu, Bäckchen, Kopf wippt mit, ab und zu ein Herz.
    // Neigung zur Hand ergänzt die Engine (hx/turn nach Strichrichtung).
    pet: {
      fps: 6,
      frames: repeat(12, i => ({
        hy: i % 3 === 0 ? 0 : 1,
        eyes: "happy",
        mouth: i % 6 < 3 ? "smile" : "small",
        blush: true,
        arms: "hold",
        props: [[], ["heart1"], ["heart1"], ["heart2"], ["heart2"], [], [], ["heart3"], ["heart3"], ["heart3", "heart1"], ["heart1"], []][i],
      })),
    },
    // ---------- Besuch: zwei Tiere einander zugewandt (L = schaut nach links, R = nach rechts) ----------
    ...Object.fromEntries(
      (["L", "R"] as const).flatMap(side => {
        const d = side === "L" ? -1 : 1;
        const face: Frame = { turn: d, gaze: [d, 0], hx: d };
        const arm = (a: Arm): [Arm, Arm] => (side === "L" ? [a, "rest"] : ["rest", a]);
        const hearts = side === "L" ? [["heart3"], [], ["heart3"], []] : [["heart1"], ["heart2"], ["heart1"], []];
        const clips: [string, Clip][] = [
          // Plaudern: Mund geht, kleines Nicken
          [`talk${side}`, { fps: 6, frames: repeat(18, i => ({ ...face, mouth: (["open", "smile", "small"] as const)[i % 3], hy: i % 6 === 0 ? 1 : 0 })) }],
          // Zuhören und lächeln
          [`listen${side}`, { fps: 6, frames: repeat(18, i => ({ ...face, mouth: "smile", eyes: i % 9 === 8 ? "happy" : "bead", hy: i % 9 < 2 ? 1 : 0 })) }],
          // Herzchen
          [`love${side}`, { fps: 5, frames: repeat(12, i => ({ ...face, hy: i % 4 < 2 ? 1 : 0, eyes: "happy", mouth: "smile", blush: true, arms: "hold", props: hearts[i % 4] })) }],
          // Abklatschen: Pfote zur Seite hoch, kleiner Hüpfer
          [
            `five${side}`,
            {
              fps: 8,
              frames: [
                { ...face, body: "squash" },
                ...times(2, [{ ...face, arms: arm("up1"), y: -1, mouth: "grin", eyes: "happy" }]),
                ...times(3, [{ ...face, arms: arm("stretch"), body: "tall", y: -2, mouth: "grin", eyes: "happy", props: [side === "L" ? "stars2" : "stars1"] }]),
                { body: "squash", ...happy },
                ...times(3, [{ ...face, ...happy }]),
              ],
            },
          ],
          // Winken zum anderen hin
          [
            `bye${side}`,
            { fps: 6, frames: [...times(3, [{ ...face, arms: arm("stretch"), ...happy }, { ...face, arms: arm("stretch"), hy: 1, ...happy }]), { ...face, ...happy }] },
          ],
        ];
        return clips;
      })
    ),
    alarm: {
      fps: 8,
      frames: [
        ...[0, -2, -3, -2, 0].map((y, i): Frame => ({
          y,
          arms: "clock",
          eyes: "wide",
          mouth: "grin",
          ears: "perk",
          feet: y ? "kick1" : "sit",
          props: [`clock@${i % 2 ? 1 : -1},0`],
        })),
        { body: "squash", arms: "clock", eyes: "happy", mouth: "grin", props: ["clock@1,0"] },
        ...times(3, [
          { arms: ["clock", "up1"], eyes: "happy", mouth: "grin", props: ["clock@-1,0"] },
          { arms: ["clock", "up2"], eyes: "happy", mouth: "grin", props: ["clock@1,0"] },
        ]),
      ],
    },
    // Termin beginnt: Kalenderblatt hochhalten, zweimal hüpfen, dann mit der freien Pfote winken
    appointment: {
      fps: 8,
      frames: [
        ...[0, -2, -3, -2, 0, -2, -3, -2, 0].map((y): Frame => ({
          y,
          arms: "clock",
          eyes: "wide",
          mouth: "o",
          ears: "perk",
          feet: y ? "kick1" : "sit",
          props: ["calsign"],
        })),
        { body: "squash", arms: "clock", eyes: "happy", mouth: "smile", props: ["calsign"] },
        ...times(3, [
          { arms: ["clock", "up1"], eyes: "bead", gaze: [1, 0], mouth: "smile", props: ["calsign"] },
          { arms: ["clock", "up2"], eyes: "bead", gaze: [1, 0], mouth: "smile", props: ["calsign"] },
        ]),
        ...times(4, [{ arms: "clock", eyes: "bead", mouth: "smile", props: ["calsign"] }]),
      ],
    },
  };
}

// Welche Clips in welcher Stimmung laufen (Gewichte)
export const MOOD_CLIPS: Record<MoodState, [string, number][]> = {
  sleep: [["sleep", 1]],
  relaxed: [["idle", 6], ["look", 2], ["groom", 1], ["yawn", 1], ["stretch", 1]],
  busy: [["work", 5], ["wipe", 1]],
  focus: [["work", 1]],
  stress: [["pace", 3], ["glance", 2]],
  bored: [["mope", 4], ["sigh", 1]],
  alarm: [["alarm", 1]],
  event: [["appointment", 1]],
};

// Standbilder für "reduzierte Bewegung"
export const STILLS: Record<MoodState, Frame> = {
  sleep: { body: "curl", eyes: "closed", mouth: "small", props: ["zzz2"] },
  relaxed: { mouth: "smile" },
  busy: { arms: "hold", gaze: [0, 1] },
  focus: { arms: "hold", props: ["headband"], brows: "focus" },
  stress: { brows: "worried", mouth: "nervous", props: ["sweat1", "fluff1"] },
  bored: { ears: "droop", eyes: "halflid", mouth: "small", hy: 1, arms: "hold", gaze: [0, 1] },
  alarm: { arms: "clock", eyes: "wide", mouth: "grin", props: ["clock"] },
  event: { arms: "clock", eyes: "bead", mouth: "smile", props: ["calsign"] },
};
