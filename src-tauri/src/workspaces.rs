// Workspaces — the walls between contexts. A meeting, its people, decisions
// and follow-ups belong to exactly one workspace, so a client's work never
// bleeds into personal notes or another client's. Stored once in
// app_data_dir/workspaces.json; a recording carries its workspace id in
// meta.json (library.rs). Recordings with no id belong to the default
// "personal" workspace, so existing libraries need no migration.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const DEFAULT_ID: &str = "personal";

/// Something a workspace points at: a repo, a folder on this Mac, a URL, a
/// chat channel, a doc, a data source. `target` is a path or URL; the app
/// opens it with the system handler.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Link {
    #[serde(default)]
    pub kind: String, // "source" | "repo" | "folder" | "url" | "channel" | "doc"
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub target: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created: u64,
    /// what this workspace is, in a sentence or two
    #[serde(default)]
    pub description: String,
    /// where its information comes from, and the files/links behind it
    #[serde(default)]
    pub links: Vec<Link>,
    /// optional runtime override: the command Za3tar uses for work in THIS
    /// workspace (a different agent per client). Empty = the global one.
    #[serde(default)]
    pub runtime_command: String,
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::paths::data_dir(app)?.join("workspaces.json"))
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

/// "Madar Events" → "madar-events"; falls back to a timestamp for names with
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
                description: String::new(),
                links: Vec::new(),
                runtime_command: String::new(),
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
        description: String::new(),
        links: Vec::new(),
        runtime_command: String::new(),
    };
    list.push(ws.clone());
    write(&app, &list)?;
    Ok(ws)
}

/// Edit everything about a workspace except its id.
#[tauri::command]
pub fn update_workspace(
    app: AppHandle,
    id: String,
    name: String,
    description: String,
    links: Vec<Link>,
    runtime_command: String,
) -> Result<Workspace, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("a workspace needs a name".into());
    }
    let mut list = list_workspaces(app.clone())?;
    let Some(ws) = list.iter_mut().find(|w| w.id == id) else {
        return Err("no such workspace".into());
    };
    ws.name = name;
    ws.description = description.trim().to_string();
    ws.links = links
        .into_iter()
        .map(|l| Link {
            kind: l.kind.trim().to_string(),
            label: l.label.trim().to_string(),
            target: l.target.trim().to_string(),
        })
        .filter(|l| !l.label.is_empty() || !l.target.is_empty())
        .collect();
    ws.runtime_command = runtime_command.trim().to_string();
    let out = ws.clone();
    write(&app, &list)?;
    Ok(out)
}

/// The runtime command a workspace wants, if it set one.
pub fn runtime_for(app: &AppHandle, id: &str) -> Option<String> {
    read(app)
        .into_iter()
        .find(|w| w.id == or_default(id))
        .map(|w| w.runtime_command)
        .filter(|c| !c.trim().is_empty())
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
        assert_eq!(slug("Madar Events"), "madar-events");
        assert_eq!(slug("  ACME / ops  "), "acme-ops");
        assert!(slug("زعتر").starts_with("ws-"));
    }

    #[test]
    fn defaults() {
        assert_eq!(or_default(""), "personal");
        assert_eq!(or_default(" glg "), "glg");
    }
}
