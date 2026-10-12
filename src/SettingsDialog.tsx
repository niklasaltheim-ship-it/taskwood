import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { disable as autostartOff, enable as autostartOn, isEnabled as autostartIsOn } from "@tauri-apps/plugin-autostart";
import { APP_NAME, CONTACT, PUBLISHER } from "./about";
import { systemLang, t } from "./i18n";
import type { LangSetting } from "./i18n";
import { QUICK_LABEL } from "./settings";
import type { Settings } from "./settings";
import LICENSE_TEXT from "../LICENSE?raw";

type Props = {
  settings: Settings;
  shortcutFailed: boolean;
  onImportIcs: () => void;
  icsMessage: string | null;
  onChange: (patch: Partial<Settings>) => void;
  onExport: () => void;
  onImport: () => void;
  confirmImport: boolean;
  onConfirmImport: () => void;
  message: string | null;
  onClose: () => void;
};

type Page = "settings" | "about" | "license" | "thirdparty";

export default function SettingsDialog(p: Props) {
  const [page, setPage] = useState<Page>("settings");
  const [version, setVersion] = useState("");
  const [thirdParty, setThirdParty] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  // Drittanbieter-Lizenzen sind ins Programm eingebettet; erst beim Öffnen laden
  useEffect(() => {
    if (page !== "thirdparty" || thirdParty !== null) return;
    invoke<string>("third_party_licenses").then(setThirdParty).catch(() => setThirdParty("—"));
  }, [page]);

  // Autostart liegt bei Windows (Registry), nicht in den gespeicherten Einstellungen
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    autostartIsOn().then(setAutostart).catch(() => setAutostart(null));
  }, []);
  const toggleAutostart = async (on: boolean) => {
    try {
      await (on ? autostartOn() : autostartOff());
      setAutostart(await autostartIsOn());
    } catch {}
  };

  const auto = systemLang() === "de" ? "Deutsch" : "English";
  const s = p.settings;
  const toggle = (key: keyof Settings, label: string, hint?: string) => (
    <label className="check-row">
      <input type="checkbox" checked={!!s[key]} onChange={e => p.onChange({ [key]: e.target.checked })} />
      <span>
        {label}
        {hint && <small className="check-hint">{hint}</small>}
      </span>
    </label>
  );

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && p.onClose()}>
      <div className={page === "settings" || page === "about" ? "dialog settings" : "dialog settings wide-text"} onKeyDown={e => e.key === "Escape" && p.onClose()} tabIndex={-1}>
        {page === "settings" && (
          <>
            <h2>{t("Einstellungen")}</h2>
            <label className="field">
              {t("Sprache")}
              <select value={s.language} onChange={e => p.onChange({ language: e.target.value as LangSetting })}>
                <option value="auto">{t("Automatisch ({lang})", { lang: auto })}</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
            <fieldset className="set-group">
              <legend>{t("Alltag")}</legend>
              {autostart !== null && (
                <label className="check-row">
                  <input type="checkbox" checked={autostart} onChange={e => toggleAutostart(e.target.checked)} />
                  <span>{t("Mit Windows starten")}</span>
                </label>
              )}
              {toggle("quickAdd", t("Schnelleingabe mit {key}", { key: t(QUICK_LABEL) }), t("Aus jedem Programm: Aufgabe tippen, Enter, fertig."))}
              {s.quickAdd && p.shortcutFailed && <p className="field-error">{t("Das Tastenkürzel ist schon von einem anderen Programm belegt.")}</p>}
              {toggle("today", t("Heute-Ansicht"), t("Alles Fällige aus allen Projekten auf einen Blick."))}
              {toggle("search", t("Suche über alle Projekte"))}
              {toggle("timer", t("Timer"))}
              {toggle("icsImport", t("Kalender-Import (.ics)"), t("Stundenpläne und Termine aus anderen Kalendern übernehmen."))}
              {s.icsImport && (
                <div className="settings-row">
                  <button className="btn" onClick={p.onImportIcs}>{t(".ics-Datei importieren…")}</button>
                </div>
              )}
              {s.icsImport && p.icsMessage && <p className="settings-note">{p.icsMessage}</p>}
            </fieldset>
            <fieldset className="set-group">
              <legend>{t("Tiere")}</legend>
              {toggle("bubbles", t("Sprechblasen vom Tier"))}
              {toggle("calm", t("Ruhemodus: Tiere bewegen sich nicht"))}
              {toggle("seasons", t("Jahreszeiten"), t("Schal und Schnee im Winter, Blumen im Frühling, Schmetterling im Sommer, Blätter im Herbst."))}
              {toggle("accessories", t("Accessoires"), t("Werden durch erledigte Aufgaben freigeschaltet. Auswahl im Projekt-Dialog."))}
              {toggle("visits", t("Besuche"), t("Tiere anderer Projekte schauen ab und zu vorbei."))}
              {toggle("game", t("Spiel „Dammbau“"), t("Im Ordner-Menü unter „Pause machen“."))}
              {s.game && toggle("gameSound", t("Töne im Spiel"))}
            </fieldset>
            <div className="field">
              {t("Datensicherung")}
              <div className="settings-row">
                <button className="btn" onClick={p.onExport}>{t("Daten exportieren…")}</button>
                <button className={p.confirmImport ? "btn danger sure" : "btn"} onClick={() => (p.confirmImport ? p.onImport() : p.onConfirmImport())}>
                  {t(p.confirmImport ? "Ersetzt alle Daten. Weiter?" : "Daten importieren…")}
                </button>
              </div>
              {p.message && <p className="settings-note">{p.message}</p>}
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setPage("about")}>{t("Über Taskwood")}</button>
              <span className="spacer" />
              <button className="btn primary" onClick={p.onClose}>{t("Fertig")}</button>
            </div>
          </>
        )}

        {page === "about" && (
          <>
            <h2>{APP_NAME}</h2>
            <p className="about-line">{t("Version {v}", { v: version || "1.2.0" })} · © 2026 {PUBLISHER}</p>
            <p className="about-line">{t("Lizenz: MIT")}</p>
            <div className="settings-row">
              <button className="btn" onClick={() => setPage("license")}>{t("Lizenztext")}</button>
              <button className="btn" onClick={() => setPage("thirdparty")}>{t("Drittanbieter-Lizenzen")}</button>
            </div>
            <div className="field">
              {t("Datenschutz")}
              <p className="about-text">{t("Alle Daten bleiben lokal auf deinem Gerät. Die App sendet keine Daten.")}</p>
            </div>
            <div className="field">
              {t("Kontakt")}
              <p className="about-text">{CONTACT}</p>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => setPage("settings")}>{t("Zurück")}</button>
              <span className="spacer" />
              <button className="btn primary" onClick={p.onClose}>{t("Fertig")}</button>
            </div>
          </>
        )}

        {(page === "license" || page === "thirdparty") && (
          <>
            <h2>{t(page === "license" ? "Lizenztext" : "Drittanbieter-Lizenzen")}</h2>
            <pre className="license-text">{page === "license" ? LICENSE_TEXT : thirdParty ?? "…"}</pre>
            <div className="actions">
              <button className="btn" onClick={() => setPage("about")}>{t("Zurück")}</button>
              <span className="spacer" />
              <button className="btn primary" onClick={p.onClose}>{t("Fertig")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
