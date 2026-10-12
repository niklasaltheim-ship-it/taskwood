import { useState } from "react";
import Pet, { STASH_MAX, clipNames, stashName } from "./pet/Pet";
import type { PetEvent } from "./pet/Pet";
import type { MoodState } from "./pet/types";
import { ANIMALS, animalName } from "./sprites";
import type { AnimalKind } from "./sprites";
import { t } from "./i18n";
import type { DemoMode } from "./game/DamGame";

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

export default function PetLab({ kind: initial, onClose, onGame }: { kind: AnimalKind; onClose: () => void; onGame: (demo: DemoMode | null) => void }) {
  const [kind, setKind] = useState<AnimalKind>(initial);
  const [mood, setMood] = useState<MoodState>("relaxed");
  const [event, setEvent] = useState<PetEvent | null>(null);
  const [held, setHeld] = useState(false);
  const [hover, setHover] = useState<boolean | undefined>(undefined);
  const [cuddle, setCuddle] = useState<boolean | undefined>(undefined);
  const [still, setStill] = useState(false);
  const [stash, setStash] = useState(3);

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
      <p className="lab-note">{t("Maus über das Tier bewegen: die Augen folgen. Stillhalten: es schmiegt sich an.")}</p>
    </div>
  );
}
