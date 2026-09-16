// Workspaces — the walls between contexts. A meeting, its people, decisions
// and follow-ups belong to exactly one workspace, so a client's work never
// bleeds into personal notes or another client's. Stored once in
// app_data_dir/workspaces.json; a recording carries its workspace id in
// meta.json (library.rs). Recordings with no id belong to the default
// "personal" workspace, so existing libraries need no migration.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const DEFAULT_ID: &str = "personal";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created: u64,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("workspaces.json"))
}

fn read(app: &AppHandle) -> Vec<Workspace> {
    path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(app: &AppHandle, list: &[Workspace]) -> Result<(), String> {
    let p = path(app)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
    std::fs::write(p, json).map_err(|e| e.to_string())
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// "Jello House" → "jello-house"; falls back to a timestamp for names with
/// no ascii letters (Arabic names keep their display name, get a stable id).
fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').to_string();
    let s = s
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if s.is_empty() {
        format!("ws-{}", now())
    } else {
        s
    }
}

/// Every workspace, default first. The default always exists even if the
/// file doesn't.
#[tauri::command]
pub fn list_workspaces(app: AppHandle) -> Result<Vec<Workspace>, String> {
    let mut list = read(&app);
    if !list.iter().any(|w| w.id == DEFAULT_ID) {
        list.insert(
            0,
            Workspace {
                id: DEFAULT_ID.into(),
                name: "Personal".into(),
                created: 0,
            },
        );
    }
    Ok(list)
}

#[tauri::command]
pub fn create_workspace(app: AppHandle, name: String) -> Result<Workspace, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("a workspace needs a name".into());
    }
    let mut list = list_workspaces(app.clone())?;
    let base = slug(&name);
    let mut id = base.clone();
    let mut n = 2;
    while list.iter().any(|w| w.id == id) {
        id = format!("{base}-{n}");
        n += 1;
    }
    let ws = Workspace {
        id,
        name,
        created: now(),
    };
    list.push(ws.clone());
    write(&app, &list)?;
    Ok(ws)
}

#[tauri::command]
pub fn rename_workspace(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("a workspace needs a name".into());
    }
    let mut list = list_workspaces(app.clone())?;
    let Some(ws) = list.iter_mut().find(|w| w.id == id) else {
        return Err("no such workspace".into());
    };
    ws.name = name;
    write(&app, &list)
}

/// Resolve an empty/missing id to the default workspace.
pub fn or_default(id: &str) -> String {
    let t = id.trim();
    if t.is_empty() {
        DEFAULT_ID.to_string()
    } else {
        t.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs() {
        assert_eq!(slug("Jello House"), "jello-house");
        assert_eq!(slug("  BYNK / ops  "), "bynk-ops");
        assert!(slug("زعتر").starts_with("ws-"));
    }

    #[test]
    fn defaults() {
        assert_eq!(or_default(""), "personal");
        assert_eq!(or_default(" glg "), "glg");
    }
}
