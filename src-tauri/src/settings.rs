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
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Settings {
    #[serde(default)]
    pub elevenlabs_api_key: String,
    #[serde(default)]
    pub anthropic_api_key: String,
    #[serde(default)]
    pub openai_api_key: String,
    /// TypeSafe (Jev) — fast typed judgments; optional
    #[serde(default)]
    pub typesafe_api_key: String,
    #[serde(default)]
    pub user_name: String,
    /// "english" (default) | "match" | "arabic" — what Za3tar writes in
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub agent_name: String,
    #[serde(default)]
    pub agent_command: String,
    /// hosted mode: the account token from Sign in with Za3tar
    #[serde(default)]
    pub za3tar_token: String,
    /// hosted mode: proxy base URL (empty = the default host)
    #[serde(default)]
    pub za3tar_base: String,
    /// when setup was finished (ISO date). Empty = never onboarded.
    #[serde(default)]
    pub onboarded: String,
}

/// env var name, reader, writer — one binding per settings field.
type VarBinding = (
    &'static str,
    fn(&Settings) -> &str,
    fn(&mut Settings) -> &mut String,
);

const VARS: [VarBinding; 10] = [
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
    (
        "TYPESAFE_API_KEY",
        |s| &s.typesafe_api_key,
        |s| &mut s.typesafe_api_key,
    ),
    ("ZA3TAR_USER", |s| &s.user_name, |s| &mut s.user_name),
    ("ZA3TAR_LANGUAGE", |s| &s.language, |s| &mut s.language),
    ("ZA3TAR_TOKEN", |s| &s.za3tar_token, |s| &mut s.za3tar_token),
    ("ZA3TAR_BASE", |s| &s.za3tar_base, |s| &mut s.za3tar_base),
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
    Ok(crate::paths::data_dir(app)?.join("settings.json"))
}

pub(crate) fn read(app: &AppHandle) -> Settings {
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

/// Fields that hold a secret. They never go back to the webview; the UI gets
/// a hint (set or not, last four) and sends an empty string to mean "keep".
const SECRETS: [(&str, &str); 5] = [
    ("elevenlabs_api_key", "ELEVENLABS_API_KEY"),
    ("anthropic_api_key", "ANTHROPIC_API_KEY"),
    ("openai_api_key", "OPENAI_API_KEY"),
    ("typesafe_api_key", "TYPESAFE_API_KEY"),
    ("za3tar_token", "ZA3TAR_TOKEN"),
];

fn secret_mut<'a>(s: &'a mut Settings, field: &str) -> Option<&'a mut String> {
    Some(match field {
        "elevenlabs_api_key" => &mut s.elevenlabs_api_key,
        "anthropic_api_key" => &mut s.anthropic_api_key,
        "openai_api_key" => &mut s.openai_api_key,
        "typesafe_api_key" => &mut s.typesafe_api_key,
        "za3tar_token" => &mut s.za3tar_token,
        _ => return None,
    })
}

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct KeyHint {
    pub has_key: bool,
    pub last4: String,
}

fn hint(v: &str) -> KeyHint {
    let v = v.trim();
    if v.is_empty() {
        return KeyHint::default();
    }
    let chars: Vec<char> = v.chars().collect();
    // short values would be mostly revealed by their last four
    let last4 = if chars.len() >= 12 {
        chars[chars.len() - 4..].iter().collect()
    } else {
        String::new()
    };
    KeyHint {
        has_key: true,
        last4,
    }
}

/// What the webview sees: settings with every secret blanked, plus a hint
/// per secret field.
#[derive(Serialize)]
pub struct SettingsOut {
    #[serde(flatten)]
    pub settings: Settings,
    pub keys: std::collections::HashMap<&'static str, KeyHint>,
}

/// Current settings for the UI. Secrets come back masked. Falls back to the
/// live env so a .env-based dev setup shows as configured.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> SettingsOut {
    let mut s = read(&app);
    for (var, _, get_mut) in VARS {
        let slot = get_mut(&mut s);
        if slot.is_empty() {
            if let Ok(v) = std::env::var(var) {
                *slot = v;
            }
        }
    }
    let mut keys = std::collections::HashMap::new();
    for (field, _) in SECRETS {
        if let Some(slot) = secret_mut(&mut s, field) {
            keys.insert(field, hint(slot));
            slot.clear();
        }
    }
    SettingsOut { settings: s, keys }
}

/// Write settings to disk exactly as given (owner-only) and apply them.
pub(crate) fn write(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    write_private(&path, json.as_bytes())?;
    apply(settings, false);
    Ok(())
}

/// Write a file readable by its owner only (0600), tightening an existing one.
fn write_private(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        opts.mode(0o600);
        if path.exists() {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
    }
    let mut f = opts.open(path).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

/// Merge what the webview sent over what is stored: an empty secret means
/// "unchanged", a secret named in `clear` is removed.
fn merge(stored: &Settings, mut incoming: Settings, clear: &[String]) -> Settings {
    let mut stored = stored.clone();
    for (field, _) in SECRETS {
        let keep = secret_mut(&mut stored, field)
            .map(|s| s.clone())
            .unwrap_or_default();
        if let Some(slot) = secret_mut(&mut incoming, field) {
            if clear.iter().any(|c| c == field) {
                slot.clear();
            } else if slot.trim().is_empty() {
                *slot = keep;
            }
        }
    }
    incoming
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    settings: Settings,
    clear: Option<Vec<String>>,
) -> Result<(), String> {
    let clear = clear.unwrap_or_default();
    let merged = merge(&read(&app), settings, &clear);
    write(&app, &merged)?;
    for (field, var) in SECRETS {
        if clear.iter().any(|c| c == field) {
            std::env::remove_var(var);
        }
    }
    Ok(())
}

/// What the app can do right now, from the keys actually in the environment
/// (settings or .env). Home uses this to say what is missing on a fresh copy.
#[derive(Serialize)]
pub struct Capabilities {
    pub transcription: bool,
    pub notes: bool,
    pub talk: bool,
    /// Jev is reachable: the ask box reads what you type as you type
    pub fast: bool,
    pub user_name: String,
    pub language: String,
    /// signed in with Za3tar (providers through the proxy)
    pub hosted: bool,
    /// setup has been done at least once
    pub onboarded: bool,
}

fn has(var: &str) -> bool {
    std::env::var(var)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
pub fn capabilities(app: AppHandle) -> Capabilities {
    let hosted = crate::hosted::hosted().is_some();
    let onboarded = !read(&app).onboarded.trim().is_empty();
    Capabilities {
        transcription: hosted || has("ELEVENLABS_API_KEY"),
        notes: hosted || has("ANTHROPIC_API_KEY"),
        talk: hosted || has("OPENAI_API_KEY"),
        fast: crate::jev::available(),
        hosted,
        onboarded,
        user_name: std::env::var("ZA3TAR_USER").unwrap_or_default(),
        language: crate::anthropic::language(),
    }
}

/// Mark setup as done (or, with false, ask for it again next launch).
#[tauri::command]
pub fn set_onboarded(app: AppHandle, done: bool) -> Result<(), String> {
    let mut s = read(&app);
    s.onboarded = if done { chrono_date() } else { String::new() };
    write(&app, &s)
}

/// Today as YYYY-MM-DD without pulling in a date crate.
fn chrono_date() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs / 86_400;
    // civil-from-days (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hints_never_carry_the_key() {
        assert_eq!(hint(""), KeyHint::default());
        let h = hint("sk-abcdefghijklmnop1234");
        assert!(h.has_key);
        assert_eq!(h.last4, "1234");
        assert_eq!(hint("short").last4, "");
    }

    #[test]
    fn empty_secret_keeps_the_stored_one() {
        let stored = Settings {
            openai_api_key: "sk-old".into(),
            anthropic_api_key: "sk-ant".into(),
            za3tar_token: "za3_t".into(),
            ..Default::default()
        };
        let incoming = Settings {
            openai_api_key: "sk-new".into(),
            user_name: "Lina".into(),
            ..Default::default()
        };
        let m = merge(&stored, incoming, &["anthropic_api_key".into()]);
        assert_eq!(m.openai_api_key, "sk-new");
        assert_eq!(m.anthropic_api_key, "");
        assert_eq!(m.za3tar_token, "za3_t");
        assert_eq!(m.user_name, "Lina");
    }
}
