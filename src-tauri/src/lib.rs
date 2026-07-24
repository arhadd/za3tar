pub mod actions;
pub mod anthropic;
pub mod asr;
mod capture;
pub mod library;
pub mod notes;
pub mod settings;

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
    // load API keys from .env in dev (searches CWD and ancestors). A bundled
    // .app launched from Finder has no useful CWD, so fall back to the dev
    // checkout's .env until keys move into real app settings.
    let _ = dotenvy::dotenv();
    if std::env::var("ANTHROPIC_API_KEY").is_err() {
        if let Some(home) = std::env::var_os("HOME") {
            let _ = dotenvy::from_path(std::path::Path::new(&home).join("za3tar/.env"));
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // in-app settings fill whatever the env/.env didn't provide
            settings::apply_at_startup(app.handle());
            Ok(())
        })
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
            actions::list_open_actions,
            actions::draft_nudge,
            settings::get_settings,
            settings::save_settings,
            library::list_recordings,
            library::load_recording,
            library::set_recording_title,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
