pub mod asr;
mod capture;
pub mod notes;

use capture::CaptureState;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // load API keys from .env in dev (searches CWD and ancestors); in a bundled
    // app the keys come from the process environment / settings.
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(CaptureState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            capture::start_recording,
            capture::stop_recording,
            capture::is_recording,
            asr::transcribe,
            notes::generate_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
