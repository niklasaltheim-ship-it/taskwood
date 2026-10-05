use std::path::Path;

// Datensicherung: Lesen und Schreiben einer vom Nutzer gewählten JSON-Datei.
// Nur .json, damit die Befehle nicht als allgemeiner Dateizugriff dienen können.
fn json_path(path: &str) -> Result<&Path, String> {
    let p = Path::new(path);
    match p.extension().and_then(|e| e.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("json") => Ok(p),
        _ => Err("Nur .json-Dateien sind erlaubt".into()),
    }
}

#[tauri::command]
fn write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(json_path(&path)?, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(json_path(&path)?).map_err(|e| e.to_string())
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

#[tauri::command]
fn quit(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_text, read_text, cli_task, third_party_licenses, quit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
