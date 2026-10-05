import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { AnimalKind } from "../sprites";
import { MOOD_CLIPS, STILLS } from "./clips";
import { H, W, rgba } from "./render";
import { SPECIES } from "./species";
import type { Frame, MoodState, Species } from "./types";
import { t } from "../i18n";

export const clipNames = (kind: AnimalKind) => Object.keys(SPECIES[kind].clips);
export const stashName = (kind: AnimalKind, n: number) => {
  const s = SPECIES[kind].stash;
  return s ? `${n} ${t(n === 1 ? s.one : s.many)}` : null;
};
export const STASH_MAX = 6;

export type PetEvent = { type: string; at: number };

type Props = {
  kind: AnimalKind;
  mood: MoodState;
  scale?: number;
  event?: PetEvent | null;
  held?: boolean;
  interactive?: boolean; // Augen folgen der Maus, Anschmiegen, Aufwachen
  still?: boolean; // Icon ohne Animation
  crop?: "head";
  reduced?: boolean; // Standbild erzwingen (sonst nach Systemeinstellung)
  forceHover?: boolean;
  forceCuddle?: boolean;
  stash?: number; // erledigte Aufgaben der letzten Tage als Vorrat neben dem Tier
};

const CUDDLE_AFTER = 1400; // ms Mausstillstand
const WAKE_MS = 20000; // so lange bleibt ein müdes Tier nach Erscheinen, Verschieben, Ereignis oder Maus wach
const EVENT_FRESH = 2000; // ältere Ereignisse nicht nachspielen (z. B. nach Umschalten der Ansicht)
const CROP = { x: 10, y: 12, w: 20, h: 19 };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function pickWeighted(list: [string, number][], avoid?: string) {
  const pool = list.length > 1 && avoid ? list.filter(([n]) => n !== avoid || n === list[0][0]) : list;
  let r = Math.random() * pool.reduce((s, [, w]) => s + w, 0);
  for (const [n, w] of pool) if ((r -= w) < 0) return n;
  return pool[0][0];
}

export default function Pet(props: Props) {
  const sp = SPECIES[props.kind] ?? SPECIES.beaver;
  return <Engine sp={sp} {...props} />;
}

function Engine({ sp, mood, scale = 1, event, held = false, interactive, still, crop, reduced, forceHover, forceCuddle, stash = 0 }: Props & { sp: Species }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ mood, held, stash, hover: false, cuddle: false, gaze: [0, 0] as [number, number] });
  live.current.mood = mood;
  live.current.stash = stash;
  live.current.held = held;
  if (forceHover !== undefined) live.current.hover = forceHover;
  if (forceCuddle !== undefined) live.current.cuddle = forceCuddle;

  // awakeUntil/awakeAs: kurze Wachphase, bevor ein schlafendes Tier wieder einschläft
  const st = useRef({ clip: "", i: -1, event: false, timer: 0, blinkAt: 0, lastMood: "", awakeUntil: 0, awakeAs: "idle" });

  const stayAwake = (as: "idle" | "peek") => {
    st.current.awakeUntil = performance.now() + WAKE_MS;
    st.current.awakeAs = as;
  };
  const isStatic = still || reduced || reducedMotion();

  const draw = (f: Frame) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const px = rgba(sp, f, JSON.stringify(f));
    const img = new ImageData(new Uint8ClampedArray(px), W, H);
    ctx.clearRect(0, 0, c.width, c.height);
    if (crop) ctx.putImageData(img, -CROP.x, -CROP.y);
    else ctx.putImageData(img, 0, 0);
  };

  // Vorrat liegt immer daneben (nicht bei Icons)
  const withStash = (f: Frame): Frame => {
    const n = Math.min(STASH_MAX, live.current.stash);
    if (crop || !sp.stash || n <= 0) return f;
    return { ...f, props: [...(f.props ?? []), `stash${n}`] };
  };
  const stillFrame = (m: MoodState): Frame => withStash(sp.stills?.[m] ?? STILLS[m]);

  // Nächsten Clip aus Zustand und Stimmung wählen
  const choose = () => {
    const l = live.current;
    if (l.held) return "held";
    if (l.mood === "alarm") return "alarm";
    if (l.mood === "event") return "appointment";
    if (l.hover && l.mood === "sleep") return "peek";
    if (l.cuddle && l.mood !== "sleep") return "cuddle";
    if (l.mood === "sleep") {
      const s = st.current;
      // Noch wach: sitzen und umschauen bzw. eingerollt mit offenen Augen
      if (performance.now() < s.awakeUntil) return s.awakeAs === "peek" ? "peek" : pickWeighted([["idle", 3], ["look", 1]]);
      // Saß das Tier aufrecht, erst gähnen, dann einrollen
      if (s.clip && !["sleep", "peek", "yawn", "allDone"].includes(s.clip)) return "yawn";
    }
    const list = [...MOOD_CLIPS[l.mood], ...(sp.moodExtra?.[l.mood] ?? [])].filter(([n]) => sp.clips[n]);
    const next = pickWeighted(list, st.current.lastMood);
    st.current.lastMood = next;
    return next;
  };

  // Frame mit Zustandsdetails ergänzen: Stirnband, Blick zur Maus, Blinzeln
  const decorate = (f: Frame): Frame => {
    const l = live.current;
    const s = st.current;
    let out = withStash(f);
    if (l.mood === "focus" && !s.event && s.clip === "work") {
      out = { ...out, brows: "focus", props: [...(out.props ?? []), "headband"] };
    }
    const openEyes = !out.eyes || out.eyes === "bead";
    if (openEyes && l.hover && !s.event && s.clip !== "held") out = { ...out, gaze: l.gaze };
    const now = performance.now();
    if (openEyes && now > s.blinkAt) {
      s.blinkAt = now + 2500 + Math.random() * 4000;
      if (s.blinkAt - now > 0 && s.clip !== "held") out = { ...out, eyes: "closed" };
    }
    return out;
  };

  const tick = () => {
    const s = st.current;
    window.clearTimeout(s.timer);
    s.timer = 0;
    if (document.hidden) return; // weiter bei visibilitychange
    let clip = sp.clips[s.clip];
    s.i++;
    if (!clip || s.i >= clip.frames.length) {
      // Nach einem Ereignis (Landen, Feier, Winken …) nicht sofort wieder einschlafen
      if (s.event && s.clip !== "allDone") stayAwake("idle");
      s.event = false;
      s.clip = choose();
      s.i = 0;
      clip = sp.clips[s.clip];
    }
    draw(decorate(clip.frames[s.i]));
    s.timer = window.setTimeout(tick, 1000 / clip.fps);
  };

  const play = (name: string, asEvent: boolean) => {
    const s = st.current;
    if (!sp.clips[name]) return;
    s.clip = name;
    s.i = -1;
    s.event = asEvent;
    tick();
  };

  // Clip neu wählen, wenn sich Stimmung oder Interaktion ändert (Ereignisse laufen zu Ende)
  const reconsider = () => {
    if (isStatic) return;
    const s = st.current;
    if (s.event) return;
    const next = choose();
    if (next !== s.clip) play(next, false);
  };

  // Start, Pause bei verdecktem Fenster
  useEffect(() => {
    const s = st.current;
    if (isStatic) {
      draw(stillFrame(mood));
      return;
    }
    s.clip = "";
    s.i = -1;
    // Gerade erschienen (Start, Ein-/Aufklappen): erst eine Weile wach, dann gähnen und einschlafen
    stayAwake("idle");
    tick();
    const vis = () => {
      if (!document.hidden && !st.current.timer) tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.clearTimeout(st.current.timer);
      st.current.timer = 0;
    };
  }, [sp, isStatic, crop]);

  useEffect(() => {
    if (isStatic) draw(stillFrame(mood));
    else reconsider();
  }, [mood]);

  useEffect(() => {
    if (isStatic) draw(stillFrame(mood));
  }, [stash]);

  useEffect(() => {
    if (isStatic) return;
    if (held) play("held", false);
    else if (st.current.clip === "held") play("land", true);
  }, [held]);

  useEffect(() => {
    if (forceHover !== undefined || forceCuddle !== undefined) reconsider();
  }, [forceHover, forceCuddle]);

  useEffect(() => {
    if (isStatic || !event || Date.now() - event.at > EVENT_FRESH) return;
    play(event.type, true);
  }, [event?.at]);

  // ---------- Maus ----------

  const cuddleTimer = useRef(0);
  const setHover = (h: boolean) => {
    const l = live.current;
    if (!h && l.hover && l.mood === "sleep") stayAwake("peek");
    if (forceHover === undefined) l.hover = h;
    if (!h && forceCuddle === undefined) l.cuddle = false;
    window.clearTimeout(cuddleTimer.current);
    reconsider();
  };
  const onMove = (e: ReactMouseEvent) => {
    const l = live.current;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Kopfmitte liegt etwa bei 48 % der Breite und 45 % der Höhe der Leinwand
    const dx = e.clientX - (r.left + r.width * 0.49);
    const dy = e.clientY - (r.top + r.height * 0.45);
    const tx = r.width * 0.12;
    const ty = r.height * 0.12;
    l.gaze = [dx > tx ? 1 : dx < -tx ? -1 : 0, dy > ty ? 1 : dy < -ty ? -1 : 0];
    if (!l.hover && forceHover === undefined) setHover(true);
    if (forceCuddle !== undefined) return;
    if (l.cuddle) {
      l.cuddle = false;
      reconsider();
    }
    window.clearTimeout(cuddleTimer.current);
    cuddleTimer.current = window.setTimeout(() => {
      if (!live.current.hover) return;
      live.current.cuddle = true;
      reconsider();
    }, CUDDLE_AFTER);
  };

  useEffect(() => () => window.clearTimeout(cuddleTimer.current), []);

  const w = crop ? CROP.w : W;
  const h = crop ? CROP.h : H;
  return (
    <canvas
      ref={canvas}
      className="pet-canvas"
      width={w}
      height={h}
      style={{ width: w * scale, height: h * scale }}
      onMouseEnter={interactive && !isStatic ? () => setHover(true) : undefined}
      onMouseMove={interactive && !isStatic ? onMove : undefined}
      onMouseLeave={interactive && !isStatic ? () => setHover(false) : undefined}
      aria-hidden
    />
  );
}
