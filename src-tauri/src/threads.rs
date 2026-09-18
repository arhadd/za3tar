// Threads — the initiatives inside a workspace. A thread is the unit that
// moves over weeks: it has a "where it stands" line that whoever moves it
// updates, and it collects meetings, briefs, decisions and open items over
// time. Stored once in app_data_dir/threads.json; an entry carries its
// thread id in meta.json (library.rs). Entries with no thread are unfiled.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Thread {
    pub id: String,
    pub workspace: String,
    pub title: String,
    /// where it stands, in a line or two — the living state, not history
    #[serde(default)]
    pub summary: String,
    /// "active" | "parked" | "done"
    #[serde(default = "active")]
    pub status: String,
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub created: u64,
    /// last time the summary or status moved
    #[serde(default)]
    pub updated: u64,
}

fn active() -> String {
    "active".into()
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("threads.json"))
}

fn read(app: &AppHandle) -> Vec<Thread> {
    path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(app: &AppHandle, list: &[Thread]) -> Result<(), String> {
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

fn slug(title: &str) -> String {
    let s: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if s.is_empty() {
        format!("t-{}", now())
    } else {
        s
    }
}

/// Every thread, most recently moved first.
#[tauri::command]
pub fn list_threads(app: AppHandle) -> Result<Vec<Thread>, String> {
    let mut list = read(&app);
    list.sort_by_key(|t| std::cmp::Reverse(t.updated.max(t.created)));
    Ok(list)
}

#[tauri::command]
pub fn create_thread(
    app: AppHandle,
    workspace: String,
    title: String,
    summary: Option<String>,
    owner: Option<String>,
) -> Result<Thread, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("a thread needs a title".into());
    }
    let mut list = read(&app);
    let ws = crate::workspaces::or_default(&workspace);
    let base = format!("{ws}-{}", slug(&title));
    let mut id = base.clone();
    let mut n = 2;
    while list.iter().any(|t| t.id == id) {
        id = format!("{base}-{n}");
        n += 1;
    }
    let t = Thread {
        id,
        workspace: ws,
        title,
        summary: summary.unwrap_or_default().trim().to_string(),
        status: active(),
        owner: owner.unwrap_or_default().trim().to_string(),
        created: now(),
        updated: now(),
    };
    list.push(t.clone());
    write(&app, &list)?;
    Ok(t)
}

/// Move a thread: new summary line, status, owner, or title. `updated`
/// only advances when the summary or status actually changed.
#[tauri::command]
pub fn update_thread(
    app: AppHandle,
    id: String,
    title: String,
    summary: String,
    status: String,
    owner: String,
) -> Result<Thread, String> {
    if !["active", "parked", "done"].contains(&status.as_str()) {
        return Err(format!("unknown thread status: {status}"));
    }
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("a thread needs a title".into());
    }
    let mut list = read(&app);
    let Some(t) = list.iter_mut().find(|t| t.id == id) else {
        return Err("no such thread".into());
    };
    let summary = summary.trim().to_string();
    if t.summary != summary || t.status != status {
        t.updated = now();
    }
    t.title = title;
    t.summary = summary;
    t.status = status;
    t.owner = owner.trim().to_string();
    let out = t.clone();
    write(&app, &list)?;
    Ok(out)
}

#[tauri::command]
pub fn delete_thread(app: AppHandle, id: String) -> Result<(), String> {
    let mut list = read(&app);
    list.retain(|t| t.id != id);
    write(&app, &list)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs() {
        assert_eq!(
            slug("Jello House — build to host NYE"),
            "jello-house-build-to-host-nye"
        );
        assert!(slug("زعتر").starts_with("t-"));
    }
}
