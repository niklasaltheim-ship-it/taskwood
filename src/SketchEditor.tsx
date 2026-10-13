import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Sketch, SketchItem } from "./data";
import { t } from "./i18n";

// Skizzenfeld zu einer Aufgabe: zeichnen, radieren, Text. Gespeichert werden Striche (Vektoren) in einem
// festen Koordinatensystem, damit die Daten klein bleiben und die Skizze in jeder Fenstergröße passt.
// Texte sind eigene Felder über der Zeichnung: antippen zum Auswählen, dann verschieben, größer/kleiner,
// breiter/schmaler, umfärben, bearbeiten (Doppelklick) oder löschen.

export const LW = 1000; // logische Breite
export const LH = 1300; // logische Höhe

const COLORS = ["#333D29", "#7F4F24", "#3E6A8A", "#B4483A", "#5C7A2E", "#D9A441"];
const SIZES = [4, 9, 18]; // Strichstärken (logische Pixel)
const TEXT_SIZES = [36, 56, 84];
const TEXT_MIN = 16;
const TEXT_MAX = 240;
const FONT = '"Segoe Print", "Segoe UI", sans-serif';
const BGS: NonNullable<Sketch["bg"]>[] = ["plain", "lines", "grid"];

type Tool = "pen" | "eraser" | "text";
type TextItem = Extract<SketchItem, { k: "t" }>;

const HOLD_MS = 450; // so lange stillhalten, dann wird der Strich gerade
const HOLD_SLACK = 6; // kleines Zittern (logische Pixel) zählt noch als Stillhalten
const MIN_LINE = 20; // kürzere Striche nicht begradigen (z. B. Punkte)
const SNAP_DEG = 7; // so nah an waagerecht/senkrecht/diagonal rastet die Linie ein

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Endpunkt einer geraden Linie, nah an 0°/45°/90° eingerastet
function snapEnd(x0: number, y0: number, x: number, y: number): [number, number] {
  const dx = x - x0;
  const dy = y - y0;
  const len = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(ang / step) * step;
  if (Math.abs(ang - snapped) > (SNAP_DEG * Math.PI) / 180) return [x, y];
  return [Math.round(x0 + Math.cos(snapped) * len), Math.round(y0 + Math.sin(snapped) * len)];
}

// Texte aus Version 1.2.1/1.2.2 (y = Mitte der ersten Zeile, ohne Breite) ins Textfeld-Format bringen
function upgrade(items: SketchItem[]): SketchItem[] {
  const c = document.createElement("canvas").getContext("2d");
  return items.map(it => {
    if (it.k !== "t" || it.w) return it;
    let w = 300;
    if (c) {
      c.font = `${it.s}px ${FONT}`;
      w = Math.max(...it.t.split("\n").map(l => c.measureText(l).width)) + it.s * 0.6;
    }
    return { ...it, y: Math.round(it.y - it.s * 0.625), w: Math.round(clamp(w, 80, LW - it.x)) };
  });
}

// Striche auf eine Leinwand zeichnen (ctx bereits auf logische Koordinaten skaliert). Texte liegen darüber.
export function paint(ctx: CanvasRenderingContext2D, items: SketchItem[]) {
  ctx.clearRect(0, 0, LW, LH);
  for (const it of items) {
    if (it.k !== "s") continue;
    ctx.globalCompositeOperation = it.e ? "destination-out" : "source-over";
    ctx.strokeStyle = it.c;
    ctx.fillStyle = it.c;
    ctx.lineWidth = it.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const p = it.p;
    if (p.length <= 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], it.w / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // weich: Kurven durch die Mittelpunkte
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

type Props = {
  title: string;
  sketch?: Sketch;
  onSave: (sketch: Sketch | undefined) => void;
  onClose: () => void;
  onDrag: () => void;
};

export default function SketchEditor({ title, sketch, onSave, onClose, onDrag }: Props) {
  const [items, setItems] = useState<SketchItem[]>(() => upgrade(sketch?.items ?? []));
  // Rückgängig/Wiederholen über Schnappschüsse, damit auch Verschieben und Umfärben zählen
  const [past, setPast] = useState<SketchItem[][]>([]);
  const [future, setFuture] = useState<SketchItem[][]>([]);
  const [bg, setBg] = useState<NonNullable<Sketch["bg"]>>(sketch?.bg ?? "grid");
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sel, setSel] = useState<number | null>(null); // ausgewählter Text (Index)
  const [editing, setEditing] = useState(false);
  const [fit, setFit] = useState(0.4);
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const drawing = useRef<SketchItem | null>(null);
  // Halten zum Begradigen: Timer, Stelle des Stillhaltens, und ob der Strich schon gerade ist
  const hold = useRef<{ timer: number; x: number; y: number; straight: boolean }>({ timer: 0, x: 0, y: 0, straight: false });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pastRef = useRef(past);
  pastRef.current = past;
  const futureRef = useRef(future);
  futureRef.current = future;
  const selRef = useRef(sel);
  selRef.current = sel;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const editStart = useRef<SketchItem[] | null>(null); // Stand vor dem Bearbeiten eines Texts

  // Größe: Blatt passt ins Fenster, Seitenverhältnis bleibt
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const resize = () => setFit(Math.min((el.clientWidth - 16) / LW, (el.clientHeight - 16) / LH));
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ctx = () => {
    const c = canvas.current;
    const x = c?.getContext("2d");
    if (!c || !x) return null;
    const dpr = window.devicePixelRatio || 1;
    x.setTransform(fit * dpr, 0, 0, fit * dpr, 0, 0);
    return x;
  };

  const redraw = (extra?: SketchItem | null) => {
    const x = ctx();
    if (x) paint(x, extra ? [...itemsRef.current, extra] : itemsRef.current);
  };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(LW * fit * dpr);
    c.height = Math.round(LH * fit * dpr);
    redraw();
  }, [fit]);

  useEffect(() => redraw(), [items]);

  const toLogical = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * LW), Math.round(((e.clientY - r.top) / r.height) * LH)];
  };

  // ---------- Verlauf ----------

  const record = (before: SketchItem[]) => {
    setPast(p => [...p, before]);
    setFuture([]);
    setConfirmClear(false);
  };
  const change = (next: SketchItem[]) => {
    record(itemsRef.current);
    setItems(next);
  };
  const updateText = (i: number, patch: Partial<TextItem>) =>
    setItems(list => list.map((it, j) => (j === i && it.k === "t" ? { ...it, ...patch } : it)));

  const undo = () => {
    const p = pastRef.current;
    if (!p.length) return;
    setFuture(f => [...f, itemsRef.current]);
    setItems(p[p.length - 1]);
    setPast(p.slice(0, -1));
    setSel(null);
    setEditing(false);
  };
  const redoStep = () => {
    const f = futureRef.current;
    if (!f.length) return;
    setPast(p => [...p, itemsRef.current]);
    setItems(f[f.length - 1]);
    setFuture(f.slice(0, -1));
    setSel(null);
    setEditing(false);
  };

  // ---------- Texte ----------

  const finishEdit = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const i = selRef.current;
    const before = editStart.current;
    editStart.current = null;
    const list = itemsRef.current;
    const it = i !== null ? list[i] : undefined;
    if (it?.k === "t" && !it.t.trim()) {
      // leerer Text verschwindet wieder
      setItems(list.filter((_, j) => j !== i));
      setSel(null);
      if (before && before.length !== list.length - 1) record(before);
      return;
    }
    if (before && JSON.stringify(before) !== JSON.stringify(list)) record(before);
  };

  const startEdit = (i: number) => {
    if (editingRef.current && selRef.current === i) return;
    finishEdit();
    editStart.current = itemsRef.current;
    setSel(i);
    setEditing(true);
  };

  const newText = (x: number, y: number) => {
    const s = TEXT_SIZES[size];
    const item: TextItem = { k: "t", c: color, s, x: clamp(x, 0, LW - 120), y: clamp(Math.round(y - s * 0.6), 0, LH - s), w: Math.round(clamp(LW - x - 30, 160, 620)), t: "" };
    editStart.current = itemsRef.current;
    setItems(list => [...list, item]);
    setSel(itemsRef.current.length);
    setEditing(true);
  };

  // Eingabefeld beim Bearbeiten fokussieren und mitwachsen lassen
  useEffect(() => {
    if (editing) window.setTimeout(() => editor.current?.focus(), 0);
  }, [editing, sel]);
  useLayoutEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  });

  // Ziehen: Text verschieben, über die Griffe vergrößern bzw. Breite ändern
  const gesture = (e: ReactPointerEvent, i: number, mode: "move" | "scale" | "width") => {
    e.stopPropagation();
    e.preventDefault();
    const it = itemsRef.current[i];
    if (!it || it.k !== "t") return;
    const before = itemsRef.current;
    const [sx, sy] = toLogical(e);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const [x, y] = toLogical(ev);
      const dx = x - sx;
      const dy = y - sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true;
      if (mode === "move") updateText(i, { x: clamp(it.x + dx, -it.w! + 40, LW - 40), y: clamp(it.y + dy, 0, LH - 20) });
      else if (mode === "width") updateText(i, { w: Math.round(clamp(it.w! + dx, 60, LW - it.x + 200)) });
      else {
        const k = clamp((it.w! + dx) / it.w!, TEXT_MIN / it.s, TEXT_MAX / it.s);
        updateText(i, { s: Math.round(it.s * k), w: Math.round(it.w! * k) });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) record(before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const textDown = (e: ReactPointerEvent, i: number) => {
    if (editingRef.current && selRef.current === i) {
      e.stopPropagation(); // Cursor im Text setzen
      return;
    }
    finishEdit();
    setSel(i);
    gesture(e, i, "move");
  };

  const selected = sel !== null && items[sel]?.k === "t" ? (items[sel] as TextItem) : null;

  const restyle = (patch: Partial<TextItem>) => {
    if (sel === null || !selected) return;
    change(itemsRef.current.map((it, j) => (j === sel && it.k === "t" ? { ...it, ...patch } : it)));
  };
  const deleteText = () => {
    if (sel === null) return;
    editingRef.current = false;
    setEditing(false);
    editStart.current = null;
    change(itemsRef.current.filter((_, j) => j !== sel));
    setSel(null);
  };

  // ---------- Zeichnen ----------

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const [x, y] = toLogical(e);
    if (editingRef.current) {
      finishEdit();
      if (tool === "text") return;
    }
    setSel(null);
    if (tool === "text") return newText(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
    const eraser = tool === "eraser" || e.button === 5; // Radiergummi am Stift
    drawing.current = { k: "s", c: color, w: eraser ? SIZES[size] * 3 : SIZES[size], e: eraser ? 1 : undefined, p: [x, y] };
    hold.current.straight = false;
    armHold(x, y);
    redraw(drawing.current);
  };

  // Nach kurzem Stillhalten: Strich wird zur geraden Linie vom Anfang bis hierher
  const armHold = (x: number, y: number) => {
    const h = hold.current;
    window.clearTimeout(h.timer);
    h.x = x;
    h.y = y;
    h.timer = window.setTimeout(() => {
      const s = drawing.current;
      if (!s || s.k !== "s" || h.straight) return;
      const [x0, y0] = s.p;
      if (Math.hypot(h.x - x0, h.y - y0) < MIN_LINE) return;
      h.straight = true;
      s.p = [x0, y0, ...snapEnd(x0, y0, h.x, h.y)];
      redraw(s);
    }, HOLD_MS);
  };

  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = drawing.current;
    if (!s || s.k !== "s") return;
    const h = hold.current;
    // Schon gerade: nur noch der Endpunkt folgt
    if (h.straight) {
      const [x, y] = toLogical(e);
      s.p = [s.p[0], s.p[1], ...snapEnd(s.p[0], s.p[1], x, y)];
      redraw(s);
      return;
    }
    const [hx, hy] = toLogical(e);
    if (Math.hypot(hx - h.x, hy - h.y) > HOLD_SLACK) armHold(hx, hy);
    // auch Zwischenpunkte schneller Bewegungen mitnehmen
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced && coalesced.length ? coalesced : [e.nativeEvent];
    for (const ev of events) {
      const [x, y] = toLogical(ev);
      const lx = s.p[s.p.length - 2];
      const ly = s.p[s.p.length - 1];
      if (Math.abs(x - lx) + Math.abs(y - ly) >= 3) s.p.push(x, y);
    }
    redraw(s);
  };

  const up = () => {
    const s = drawing.current;
    window.clearTimeout(hold.current.timer);
    hold.current.straight = false;
    drawing.current = null;
    if (s) change([...itemsRef.current, s]);
  };

  useEffect(() => () => window.clearTimeout(hold.current.timer), []);

  const close = () => {
    const list = drawing.current ? [...itemsRef.current, drawing.current] : itemsRef.current;
    const all = list.filter(it => it.k !== "t" || it.t.trim());
    onSave(all.length ? { items: all, bg, at: Date.now() } : undefined);
    onClose();
  };

  // Farbe und Größe wirken auf den ausgewählten Text, sonst auf den Stift
  const pickColor = (c: string) => {
    setColor(c);
    if (selected) restyle({ c });
    else if (tool === "eraser") setTool("pen");
  };
  const pickSize = (i: number) => {
    setSize(i);
    if (selected) restyle({ s: TEXT_SIZES[i] });
  };

  // Tastatur: Strg+Z / Strg+Y, Entf löscht den ausgewählten Text, Esc beendet Bearbeiten/Auswahl/Skizze
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).tagName === "TEXTAREA";
      if (typing) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finishEdit();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === "z" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        undo();
      } else if (e.ctrlKey && (k === "y" || (k === "z" && e.shiftKey))) {
        e.preventDefault();
        e.stopPropagation();
        redoStep();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (selRef.current !== null) setSel(null);
        else close();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current !== null) {
        e.preventDefault();
        deleteText();
      } else if (e.key === "Enter" && selRef.current !== null) {
        e.preventDefault();
        startEdit(selRef.current);
      } else if (!e.ctrlKey && !e.altKey) {
        if (k === "p" || k === "b") setTool("pen");
        if (k === "e") setTool("eraser");
        if (k === "t") setTool("text");
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  const icon = (d: string) => (
    <svg viewBox="0 0 16 16">
      <path d={d} />
    </svg>
  );
  const textSize = selected ? TEXT_SIZES.reduce((b, s, i) => (Math.abs(s - selected.s) < Math.abs(TEXT_SIZES[b] - selected.s) ? i : b), 0) : size;
  const nearTop = selected ? selected.y * fit < 46 : false;

  return (
    <div className="sketch" onMouseDown={e => e.stopPropagation()}>
      <div className="sketch-bar" onMouseDown={e => !(e.target as HTMLElement).closest("button") && onDrag()}>
        {icon("M10.5 2.5l3 3L6 13H3v-3z M9 4l3 3")}
        <strong className="sketch-title" title={title}>{title}</strong>
        <button className="btn primary sketch-done" onClick={close}>{t("Fertig")}</button>
      </div>
      <div className="sketch-tools">
        <button className={tool === "pen" ? "s-btn on" : "s-btn"} onClick={() => setTool("pen")} title={t("Stift (P)")} aria-label={t("Stift (P)")}>
          {icon("M10.5 2.5l3 3L6 13H3v-3z")}
        </button>
        <button className={tool === "eraser" ? "s-btn on" : "s-btn"} onClick={() => { setTool("eraser"); setSel(null); }} title={t("Radierer (E)")} aria-label={t("Radierer (E)")}>
          {icon("M6 13.5h7.5M3.5 9.5l5-5.5 4.5 4.5-5 5.5H6z M6 7l4.5 4.5")}
        </button>
        <button className={tool === "text" ? "s-btn on" : "s-btn"} onClick={() => setTool("text")} title={t("Text (T): aufs Blatt tippen")} aria-label={t("Text (T): aufs Blatt tippen")}>
          {icon("M3.5 4V3h9v1M8 3v10M6 13h4")}
        </button>
        <span className="s-sep" />
        {COLORS.map(c => (
          <button
            key={c}
            className={(selected ? selected.c === c : color === c) ? "s-color on" : "s-color"}
            style={{ background: c }}
            onClick={() => pickColor(c)}
            aria-label={t("Farbe {c}", { c })}
          />
        ))}
        <span className="s-sep" />
        {SIZES.map((w, i) => (
          <button
            key={w}
            className={(selected ? textSize === i : size === i) ? "s-btn on" : "s-btn"}
            onClick={() => pickSize(i)}
            title={t(["Dünn", "Mittel|Stärke", "Dick"][i])}
            aria-label={t(["Dünn", "Mittel|Stärke", "Dick"][i])}
          >
            <i className="s-dot" style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
          </button>
        ))}
        <span className="s-sep" />
        <button className="s-btn" onClick={() => setBg(b => BGS[(BGS.indexOf(b) + 1) % BGS.length])} title={t("Papier: {bg}", { bg: t({ plain: "blanko", lines: "liniert", grid: "kariert" }[bg]) })} aria-label={t("Papier wechseln")}>
          {icon(bg === "plain" ? "M3.5 2.5h9v11h-9z" : bg === "lines" ? "M3.5 2.5h9v11h-9zM5 6h6M5 8.5h6M5 11h6" : "M3.5 2.5h9v11h-9zM6.5 2.5v11M9.5 2.5v11M3.5 6h9M3.5 9.5h9")}
        </button>
        <span className="spacer" />
        <button className="s-btn" onClick={undo} disabled={!past.length} title={t("Rückgängig (Strg+Z)")} aria-label={t("Rückgängig (Strg+Z)")}>
          {icon("M5.5 3.5L3 6l2.5 2.5M3 6h6.5a3.5 3.5 0 0 1 0 7H7")}
        </button>
        <button className="s-btn" onClick={redoStep} disabled={!future.length} title={t("Wiederholen (Strg+Y)")} aria-label={t("Wiederholen (Strg+Y)")}>
          {icon("M10.5 3.5L13 6l-2.5 2.5M13 6H6.5a3.5 3.5 0 0 0 0 7H9")}
        </button>
        <button
          className={confirmClear ? "s-btn danger on" : "s-btn danger"}
          onClick={() => {
            if (!confirmClear) return setConfirmClear(true);
            change([]);
            setSel(null);
            setEditing(false);
          }}
          disabled={!items.length}
          title={t(confirmClear ? "Wirklich leeren?" : "Alles löschen")}
          aria-label={t("Alles löschen")}
        >
          {confirmClear ? <b>?</b> : icon("M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9")}
        </button>
      </div>
      <div className="sketch-area" ref={area}>
        <div className={`sketch-paper bg-${bg}`} style={{ width: LW * fit, height: LH * fit, backgroundSize: bg === "plain" ? undefined : `${50 * fit}px ${50 * fit}px` }}>
          <canvas
            ref={canvas}
            className={`sketch-canvas tool-${tool}`}
            style={{ width: LW * fit, height: LH * fit }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          <div className={`sketch-texts tool-${tool}`}>
            {items.map((it, i) =>
              it.k !== "t" ? null : (
                <div
                  key={i}
                  className={["s-text", sel === i && "sel", sel === i && editing && "editing"].filter(Boolean).join(" ")}
                  style={{ left: it.x * fit, top: it.y * fit, width: (it.w ?? 300) * fit, fontSize: it.s * fit, color: it.c, fontFamily: FONT }}
                  onPointerDown={e => textDown(e, i)}
                  onDoubleClick={() => startEdit(i)}
                  title={sel === i ? undefined : t("Antippen: auswählen und verschieben, Doppelklick: bearbeiten")}
                >
                  {sel === i && editing ? (
                    <textarea
                      ref={editor}
                      className="s-editor"
                      value={it.t}
                      rows={1}
                      placeholder={t("Text tippen…")}
                      onChange={e => updateText(i, { t: e.target.value })}
                      onBlur={finishEdit}
                    />
                  ) : (
                    <span className="s-content">{it.t}</span>
                  )}
                  {sel === i && !editing && (
                    <>
                      <span className="s-h corner" onPointerDown={e => gesture(e, i, "scale")} title={t("Ziehen: größer/kleiner")} />
                      <span className="s-h side" onPointerDown={e => gesture(e, i, "width")} title={t("Ziehen: breiter/schmaler")} />
                      <span className={nearTop ? "s-textbar below" : "s-textbar"} onPointerDown={e => e.stopPropagation()}>
                        <button onClick={() => restyle({ s: Math.max(TEXT_MIN, Math.round(it.s / 1.2)) })} title={t("Kleiner")} aria-label={t("Kleiner")}>A−</button>
                        <button onClick={() => restyle({ s: Math.min(TEXT_MAX, Math.round(it.s * 1.2)) })} title={t("Größer")} aria-label={t("Größer")}>A+</button>
                        <button onClick={() => startEdit(i)} title={t("Bearbeiten")} aria-label={t("Bearbeiten")}>{icon("M10.5 2.5l3 3L6 13H3v-3z")}</button>
                        <button className="del" onClick={deleteText} title={t("Löschen")} aria-label={t("Löschen")}>{icon("M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 9h5.6l.7-9")}</button>
                      </span>
                    </>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
