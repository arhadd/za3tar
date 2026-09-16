// In-app settings — the piece that makes za3tar installable by someone who
// isn't developing it. Keys and identity live in app_data_dir/settings.json;
// applying them means exporting to the process environment, so the ASR/notes/
// actions code keeps reading the same env vars it always has.
//
// Precedence: at startup, an already-set env var (shell or .env in the dev
// checkout) wins and settings only fill the gaps. An explicit in-app save
// applies unconditionally — the user just told us what they want.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Settings {
    #[serde(default)]
    pub elevenlabs_api_key: String,
    #[serde(default)]
    pub anthropic_api_key: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default)]
    pub user_name: String,
    #[serde(default)]
    pub agent_name: String,
    #[serde(default)]
    pub agent_command: String,
}

/// env var name, reader, writer — one binding per settings field.
type VarBinding = (
    &'static str,
    fn(&Settings) -> &str,
    fn(&mut Settings) -> &mut String,
);

const VARS: [VarBinding; 6] = [
    (
        "ELEVENLABS_API_KEY",
        |s| &s.elevenlabs_api_key,
        |s| &mut s.elevenlabs_api_key,
    ),
    (
        "ANTHROPIC_API_KEY",
        |s| &s.anthropic_api_key,
        |s| &mut s.anthropic_api_key,
    ),
    (
        "OPENAI_API_KEY",
        |s| &s.openai_api_key,
        |s| &mut s.openai_api_key,
    ),
    ("ZA3TAR_USER", |s| &s.user_name, |s| &mut s.user_name),
    (
        "ZA3TAR_AGENT_NAME",
        |s| &s.agent_name,
        |s| &mut s.agent_name,
    ),
    (
        "ZA3TAR_AGENT_CMD",
        |s| &s.agent_command,
        |s| &mut s.agent_command,
    ),
];

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("settings.json"))
}

fn read(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn apply(settings: &Settings, only_missing: bool) {
    for (var, get, _) in VARS {
        let val = get(settings).trim();
        if val.is_empty() {
            continue;
        }
        if only_missing && std::env::var(var).map(|v| !v.is_empty()).unwrap_or(false) {
            continue;
        }
        std::env::set_var(var, val);
    }
}

/// Called once at startup, after .env loading — fills whatever's still unset.
pub fn apply_at_startup(app: &AppHandle) {
    apply(&read(app), true);
}

/// Current settings for the UI. Values come back as stored (it's the user's
/// own machine and their own keys); the UI renders them in password fields.
/// Falls back to the live env so a .env-based dev setup shows as configured.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let mut s = read(&app);
    for (var, _, get_mut) in VARS {
        let slot = get_mut(&mut s);
        if slot.is_empty() {
            if let Ok(v) = std::env::var(var) {
                *slot = v;
            }
        }
    }
    s
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    apply(&settings, false);
    Ok(())
}
