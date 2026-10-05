import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { APP_NAME, CONTACT, PUBLISHER } from "./about";
import { systemLang, t } from "./i18n";
import type { LangSetting } from "./i18n";
import LICENSE_TEXT from "../LICENSE?raw";

type Props = {
  language: LangSetting;
  calm: boolean;
  bubbles: boolean;
  onChange: (patch: { language?: LangSetting; calm?: boolean; bubbles?: boolean }) => void;
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

  const auto = systemLang() === "de" ? "Deutsch" : "English";

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && p.onClose()}>
      <div className={page === "settings" || page === "about" ? "dialog settings" : "dialog settings wide-text"} onKeyDown={e => e.key === "Escape" && p.onClose()} tabIndex={-1}>
        {page === "settings" && (
          <>
            <h2>{t("Einstellungen")}</h2>
            <label className="field">
              {t("Sprache")}
              <select value={p.language} onChange={e => p.onChange({ language: e.target.value as LangSetting })}>
                <option value="auto">{t("Automatisch ({lang})", { lang: auto })}</option>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="check-row">
              <input type="checkbox" checked={p.calm} onChange={e => p.onChange({ calm: e.target.checked })} />
              {t("Ruhemodus: Tiere bewegen sich nicht")}
            </label>
            <label className="check-row">
              <input type="checkbox" checked={p.bubbles} onChange={e => p.onChange({ bubbles: e.target.checked })} />
              {t("Sprechblasen vom Tier")}
            </label>
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
            <p className="about-line">{t("Version {v}", { v: version || "1.0.0" })} · © 2026 {PUBLISHER}</p>
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
