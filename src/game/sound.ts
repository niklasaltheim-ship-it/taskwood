// Töne fürs Spiel, komplett per Web Audio erzeugt (keine Dateien). Leise und abschaltbar.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

const VOLUME = 0.14;

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : VOLUME;
}

// Erst bei einer Nutzeraktion anlegen (Autoplay-Regeln)
function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function env(c: AudioContext, peak: number, attack: number, decay: number, at = c.currentTime) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(master!);
  return g;
}

function tone(type: OscillatorType, from: number, to: number, peak: number, dur: number, delay = 0) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
  o.connect(env(c, peak, 0.005, dur, at));
  o.start(at);
  o.stop(at + dur + 0.05);
}

function hiss(filter: BiquadFilterType, freqFrom: number, freqTo: number, q: number, peak: number, dur: number, delay = 0) {
  const c = audio();
  if (!c || !noise) return null;
  const at = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freqFrom, at);
  f.frequency.exponentialRampToValueAtTime(freqTo, at + dur);
  src.connect(f);
  const g = env(c, peak, 0.004, dur, at);
  f.connect(g);
  src.start(at, Math.random() * 0.5);
  src.stop(at + dur + 0.05);
  return g;
}

// Holz auf Holz: dumpfer Schlag plus kurzer Klick. pitch steigt mit der Höhe leicht an.
export function klock(pitch = 1) {
  tone("triangle", 210 * pitch, 95 * pitch, 0.9, 0.09);
  tone("sine", 120 * pitch, 60, 0.6, 0.12);
  hiss("highpass", 2500, 1800, 0.7, 0.25, 0.025);
}

// Säge: raues, kurz pulsierendes Rauschen
export function saw() {
  for (let i = 0; i < 4; i++) hiss("bandpass", 1500 + i * 150, 2300 + i * 120, 4, 0.5, 0.06, i * 0.075);
}

// Platscher: Rauschen, das von hell nach dumpf abfällt, dazu ein Blubb
export function splash(big = false) {
  hiss("lowpass", big ? 2200 : 1600, 250, 0.8, big ? 0.9 : 0.55, big ? 0.6 : 0.4);
  tone("sine", big ? 380 : 520, big ? 140 : 220, 0.25, 0.15, 0.02);
}

// Perfekt: heller Doppelton, höher mit jeder Combo
export function ding(combo = 1) {
  const f = 660 * Math.pow(1.06, Math.min(combo, 8));
  tone("sine", f, f, 0.5, 0.18);
  tone("sine", f * 1.5, f * 1.5, 0.3, 0.22, 0.06);
}

// Jubel: kleines Arpeggio
export function cheer() {
  [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.45, 0.14, i * 0.09));
}

// Verfehlt: fallender Ton
export function oops() {
  tone("square", 320, 110, 0.18, 0.45);
}
