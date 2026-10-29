import { useState } from "react";
import Pet, { STASH_MAX, clipNames, stashName } from "./pet/Pet";
import type { PetEvent } from "./pet/Pet";
import type { MoodState } from "./pet/types";
import { ANIMALS, animalName } from "./sprites";
import type { AnimalKind } from "./sprites";
import { t } from "./i18n";
import type { DemoMode } from "./game/DamGame";
import LogMonth from "./LogMonth";
import type { Task } from "./data";
import { iso } from "./dates";
import { THEMES } from "./sprites";

// Versteckte Testansicht (Strg+Shift+D): jede Stimmung und jedes Ereignis per Klick abspielen

const MOODS: [MoodState, string][] = [
  ["sleep", "Schläft (0)"],
  ["relaxed", "Entspannt (1–3)"],
  ["busy", "Fleißig (4–7)"],
  ["stress", "Gestresst (8+)"],
  ["bored", "Gelangweilt"],
  ["focus", "Timer läuft"],
  ["alarm", "Timer abgelaufen"],
  ["event", "Termin beginnt"],
];

const EVENTS: [string, string][] = [
  ["done", "Erledigt"],
  ["allDone", "Letzte erledigt"],
  ["added", "Neue Aufgabe"],
  ["wave", "Fenster geöffnet"],
  ["land", "Losgelassen"],
];

const GAME: [DemoMode | null, string][] = [
  [null, "Spiel starten"],
  ["perfect", "Perfekt-Serie"],
  ["close", "Knapp getroffen"],
  ["miss", "Verfehlt"],
  ["record", "Neuer Rekord"],
  ["pause", "Pause"],
];

// Beispiel-Logbuch der letzten Wochen (nur für die Vorschau, wird nicht gespeichert)
function sampleLog(): Task[] {
  const out: Task[] = [];
  const now = new Date();
  for (let back = 0; back < 45; back++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (day.getDay() % 6 === 0 && back % 3) continue;
    const n = (back * 7) % 5;
    for (let i = 0; i < n; i++) {
      const created = day.getTime() + (9 + i) * 3600000;
      const done = (back + i) % 4 !== 0 && back > 0;
      out.push({ id: `demo-${back}-${i}`, projectId: "demo", text: `${t("Beispiel")} ${back}.${i + 1}`, createdAt: created, order: back * 10 + i, log: iso(day), doneAt: done ? created + 3600000 * (1 + i) : undefined });
    }
  }
  return out;
}

export default function PetLab({ kind: initial, onClose, onGame }: { kind: AnimalKind; onClose: () => void; onGame: (demo: DemoMode | null) => void }) {
  const [kind, setKind] = useState<AnimalKind>(initial);
  const [mood, setMood] = useState<MoodState>("relaxed");
  const [event, setEvent] = useState<PetEvent | null>(null);
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState<boolean | undefined>(undefined);
  const [cuddle, setCuddle] = useState<boolean | undefined>(undefined);
  const [still, setStill] = useState(false);
  const [stash, setStash] = useState(3);
  const [logPreview, setLogPreview] = useState(false);

  const fire = (type: string) => setEvent({ type, at: Date.now() });
  const toggle = (v: boolean | undefined) => (v ? undefined : true);

  return (
    <div className="lab" onKeyDown={e => e.key === "Escape" && onClose()}>
      <div className="lab-head">
        <strong>{t("Tier-Testansicht")}</strong>
        <select value={kind} onChange={e => setKind(e.target.value as AnimalKind)}>
          {ANIMALS.map(a => (
            <option key={a.kind} value={a.kind}>
              {animalName(a.kind).replace("­", "")}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>{t("Schließen")}</button>
      </div>

      <div className="lab-stage">
        <Pet
          key={kind + (still ? "-still" : "")}
          kind={kind}
          mood={mood}
          scale={4}
          event={event}
          held={held}
          interactive
          reduced={still}
          forceHover={hover}
          forceCuddle={cuddle}
          stash={stash}
        />
      </div>

      <div className="lab-group">
        <span>{t("Stimmung")}</span>
        {MOODS.map(([m, label]) => (
          <button key={m} className={mood === m ? "chip on" : "chip"} onClick={() => setMood(m)}>{t(label)}</button>
        ))}
      </div>
      <div className="lab-group">
        <span>{t("Ereignis")}</span>
        {EVENTS.map(([e, label]) => (
          <button key={e} className="chip" onClick={() => fire(e)}>{t(label)}</button>
        ))}
        <button className={held ? "chip on" : "chip"} onClick={() => setHeld(h => !h)}>{t("Wird verschoben")}</button>
        <button className={hover ? "chip on" : "chip"} onClick={() => setHover(toggle)}>{t("Maus drüber")}</button>
        <button className={cuddle ? "chip on" : "chip"} onClick={() => { setCuddle(toggle); setHover(h => h ?? true); }}>{t("Maus still (anschmiegen)")}</button>
        <button className={still ? "chip on" : "chip"} onClick={() => setStill(s => !s)}>{t("Reduzierte Bewegung")}</button>
      </div>
      <div className="lab-group">
        <span>{stashName(kind, stash) ? t("Vorrat ({s})", { s: stashName(kind, stash)! }) : t("(dieses Tier sammelt nichts)")}</span>
        {Array.from({ length: STASH_MAX + 1 }, (_, n) => (
          <button key={n} className={stash === n ? "chip small on" : "chip small"} onClick={() => setStash(n)}>{n}</button>
        ))}
      </div>
      <div className="lab-group">
        <span>{t("Einzelne Clips")}</span>
        {clipNames(kind).map(c => (
          <button key={c} className="chip small" onClick={() => fire(c)}>{c}</button>
        ))}
      </div>
      <div className="lab-group">
        <span>{t("Dammbau (Vorführung, speichert nichts)")}</span>
        {GAME.map(([d, label]) => (
          <button key={label} className="chip small" onClick={() => onGame(d)}>{t(label)}</button>
        ))}
      </div>
      <div className="lab-group">
        <span>{t("Logbuch")}</span>
        <button className={logPreview ? "chip small on" : "chip small"} onClick={() => setLogPreview(v => !v)}>{t("Logbuch-Monat (Beispieldaten)")}</button>
      </div>
      {logPreview && <LogMonth tasks={sampleLog()} color={THEMES[kind].accent} />}
      <p className="lab-note">{t("Maus über das Tier bewegen: die Augen folgen. Stillhalten: es schmiegt sich an. Hin und her: streicheln.")}</p>
    </div>
  );
}
