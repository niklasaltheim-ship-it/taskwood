import type { LangSetting } from "./i18n";

export const SETTINGS = "taskwood-settings";

// calm: Ruhemodus, die Tiere zeigen nur ein ruhiges Standbild ihrer Stimmung
// large: großes Aufgabenfenster; language: Standard Englisch, "auto" = Systemsprache
// Die übrigen Schalter blenden einzelne Funktionen ein oder aus (Autostart liegt bei Windows, nicht hier).
export type Settings = {
  bubbles: boolean;
  calm: boolean;
  large: boolean;
  language: LangSetting;
  quickAdd: boolean; // Schnelleingabe per Strg+Alt+T
  today: boolean; // Heute-Ansicht
  search: boolean; // Suche über alle Projekte
  timer: boolean;
  icsImport: boolean; // Kalender-Import (.ics)
  seasons: boolean; // Jahreszeiten-Deko
  accessories: boolean; // freischaltbare Accessoires
  visits: boolean; // Tiere anderer Projekte schauen vorbei
  autostartInit: boolean; // Autostart wurde beim ersten Start einmal eingeschaltet
  game: boolean; // Spiel "Dammbau" im Ordner-Menü
  gameSound: boolean; // Töne im Spiel
};

export const DEFAULT_SETTINGS: Settings = {
  bubbles: true,
  calm: false,
  large: false,
  language: "en",
  quickAdd: true,
  today: true,
  search: true,
  timer: true,
  icsImport: true,
  seasons: true,
  accessories: true,
  visits: true,
  autostartInit: false,
  game: true,
  gameSound: true,
};

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const QUICK_KEY = "CommandOrControl+Alt+T";
export const QUICK_LABEL = "Strg+Alt+T";
