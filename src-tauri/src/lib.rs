use std::path::Path;
use tauri::{Manager, WindowEvent};

// Datensicherung: Lesen und Schreiben einer vom Nutzer gewählten JSON-Datei.
// Nur bestimmte Endungen, damit die Befehle nicht als allgemeiner Dateizugriff dienen können.
fn checked_path<'a>(path: &'a str, ext: &str) -> Result<&'a Path, String> {
    let p = Path::new(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(e) if e.eq_ignore_ascii_case(ext) => Ok(p),
        _ => Err(format!("Nur .{ext}-Dateien sind erlaubt")),
    }
}

fn json_path(path: &str) -> Result<&Path, String> {
    checked_path(path, "json")
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(json_path(&path)?, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(json_path(&path)?).map_err(|e| e.to_string())
}

// Kalender-Import: nur .ics-Dateien lesen
#[tauri::command]
fn read_ics(path: String) -> Result<String, String> {
    let bytes = std::fs::read(checked_path(&path, "ics")?).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

// Listen-Import per Drag & Drop: nur .md- und .txt-Dateien, höchstens 1 MB
#[tauri::command]
fn read_list(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    match p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) {
        Some(e) if e == "md" || e == "markdown" || e == "txt" => {}
        _ => return Err("Nur .md- und .txt-Dateien sind erlaubt".to_string()),
    }
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    if bytes.len() > 1_000_000 {
        return Err("Datei zu groß".to_string());
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

// Startparameter für Sicherung ohne Klicks: --export <datei> bzw. --import <datei>
#[tauri::command]
fn cli_task() -> Option<(String, String)> {
    let args: Vec<String> = std::env::args().collect();
    args.windows(2).find_map(|w| match w[0].as_str() {
        "--export" => Some(("export".to_string(), w[1].clone())),
        "--import" => Some(("import".to_string(), w[1].clone())),
        _ => None,
    })
}

// Lizenztexte der Drittanbieter, fest ins Programm eingebettet (Über-Dialog, kein Netz nötig)
#[tauri::command]
fn third_party_licenses() -> &'static str {
    include_str!("../../THIRD_PARTY_LICENSES.txt")
}

// Position und Größe in einem Schritt setzen (logische Pixel), z. B. wenn ein Besuch das kleine
// Fenster nach links verbreitert: so springt das Tier nicht zwischen den beiden Änderungen.
#[tauri::command]
fn set_bounds(window: tauri::WebviewWindow, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    window.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())
}

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // Hauptfenster zu: ganze App beenden (sonst lebt das versteckte Schnelleingabe-Fenster weiter).
        // Schnelleingabe mit Alt+F4: nur verstecken, damit das Tastenkürzel weiter funktioniert.
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } if window.label() == "quick" => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Destroyed if window.label() == "main" => window.app_handle().exit(0),
            _ => {}
        })
        // Hauptfenster hier anlegen statt aus der Konfiguration: nur so darf die Seite die
        // Zwischenablage lesen ("Liste einfügen"), ohne dass WebView2 jedes Mal nachfragt
        .setup(|app| {
            let config = app.config().app.windows.iter().find(|w| w.label == "main").cloned().expect("Fenster main fehlt in tauri.conf.json");
            tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.enable_clipboard_access().build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![write_text, read_text, read_ics, read_list, set_bounds, cli_task, third_party_licenses, quit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
