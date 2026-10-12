import { isAnimal } from "../sprites";
import type { AnimalKind } from "../sprites";

// Highscores fürs Spiel "Dammbau". Liegen in den normalen Daten, damit Export/Import sie mitnehmen.

export type DamScore = { score: number; layers: number; at: string; animal: AnimalKind }; // at: YYYY-MM-DD
export type DamScores = { top: DamScore[]; byAnimal: Partial<Record<AnimalKind, DamScore[]>> };

export const TOP_N = 5;
export const emptyScores = (): DamScores => ({ top: [], byAnimal: {} });

const byScore = (a: DamScore, b: DamScore) => b.score - a.score || b.layers - a.layers;

const validScore = (s: any): s is DamScore =>
  s && Number.isFinite(s.score) && s.score >= 0 && Number.isFinite(s.layers) && typeof s.at === "string" && isAnimal(s.animal);

// Gespeicherte oder importierte Highscores prüfen; Ungültiges fliegt raus
export function sanitizeScores(d: any): DamScores {
  if (!d || typeof d !== "object") return emptyScores();
  const top = (Array.isArray(d.top) ? d.top : []).filter(validScore).sort(byScore).slice(0, TOP_N);
  const byAnimal: DamScores["byAnimal"] = {};
  if (d.byAnimal && typeof d.byAnimal === "object") {
    for (const [k, list] of Object.entries(d.byAnimal)) {
      if (isAnimal(k) && Array.isArray(list)) byAnimal[k] = list.filter(validScore).sort(byScore).slice(0, TOP_N);
    }
  }
  return { top, byAnimal };
}

// Neues Ergebnis eintragen. record: bester Wert insgesamt, animalRecord: bester Wert für dieses Tier
export function addScore(s: DamScores, e: DamScore): { scores: DamScores; record: boolean; animalRecord: boolean } {
  const best = s.top[0]?.score ?? 0;
  const own = s.byAnimal[e.animal] ?? [];
  const bestOwn = own[0]?.score ?? 0;
  const scores: DamScores = {
    top: [...s.top, e].sort(byScore).slice(0, TOP_N),
    byAnimal: { ...s.byAnimal, [e.animal]: [...own, e].sort(byScore).slice(0, TOP_N) },
  };
  return { scores, record: e.score > 0 && e.score > best, animalRecord: e.score > 0 && e.score > bestOwn };
}
