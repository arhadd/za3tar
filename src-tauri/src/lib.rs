pub mod actions;
pub mod anthropic;
pub mod asr;
mod capture;
pub mod library;
pub mod notes;

use capture::CaptureState;

// (the scaffold `greet` command was removed — nothing called it)

/// Open System Settings straight to the pane where the "System Audio Recording"
/// grant lives, so the user can enable the "them" track without hunting for it.
#[tauri::command]
fn open_system_audio_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
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
            open_system_audio_settings,
            capture::start_recording,
            capture::stop_recording,
            capture::is_recording,
            asr::transcribe,
            notes::generate_notes,
            actions::extract_actions,
            actions::load_actions,
            actions::set_action_done,
            actions::draft_followup,
            actions::export_calendar,
            actions::open_external,
            library::list_recordings,
            library::load_recording,
            library::set_recording_title,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
