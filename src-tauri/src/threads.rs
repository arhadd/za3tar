// Threads — the initiatives inside a workspace. A thread is the unit that
// moves over weeks: it has a "where it stands" line that whoever moves it
// updates, and it collects meetings, briefs, decisions and open items over
// time. Stored once in app_data_dir/threads.json; an entry carries its
// thread id in meta.json (library.rs). Entries with no thread are unfiled.
//
// With a thread store set (ZA3TAR_THREAD_STORE, see store/README.md) the
// record lives there instead, shared with whoever else moves these threads,
// and threads.json is only the last copy read — what the app shows when the
// store can't be reached. Every write names the version it read; if someone
// else moved the thread since, the store refuses and we reload.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

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
    /// the store's version of this thread when it was read (0 = local only)
    #[serde(default)]
    pub version: u64,
    /// who moved it last, as the store recorded it
    #[serde(default)]
    pub updated_by: String,
}

fn active() -> String {
    "active".into()
}

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::paths::data_dir(app)?.join("threads.json"))
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

// ---- the shared store -------------------------------------------------------

fn store_cmd() -> Option<String> {
    std::env::var("ZA3TAR_THREAD_STORE")
        .ok()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
}

/// Who a write is from, as the store records it.
fn writer() -> String {
    std::env::var("ZA3TAR_USER")
        .ok()
        .map(|u| u.trim().to_lowercase())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| "za3tar-app".into())
}

enum StoreErr {
    /// someone moved the thread since we read it; here is where it is now
    Moved(Thread),
    Failed(String),
}

impl From<StoreErr> for String {
    fn from(e: StoreErr) -> String {
        match e {
            StoreErr::Moved(t) => format!("{} moved since you opened it", t.title),
            StoreErr::Failed(m) => m,
        }
    }
}

/// Run one store command. `sub` is always one of our fixed words; anything a
/// person typed travels as JSON on stdin, never through the shell.
async fn store(
    cmd: &str,
    sub: &str,
    input: Option<serde_json::Value>,
) -> Result<serde_json::Value, StoreErr> {
    use tokio::io::AsyncWriteExt;
    let mut child = tokio::process::Command::new("/bin/sh")
        .arg("-c")
        .arg(format!("{cmd} {sub}"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| StoreErr::Failed(format!("thread store: {e}")))?;
    if let Some(mut stdin) = child.stdin.take() {
        let body = input.map(|v| v.to_string()).unwrap_or_default();
        let _ = stdin.write_all(body.as_bytes()).await;
    }
    let out = tokio::time::timeout(std::time::Duration::from_secs(20), child.wait_with_output())
        .await
        .map_err(|_| StoreErr::Failed("thread store: no answer in 20s".into()))?
        .map_err(|e| StoreErr::Failed(format!("thread store: {e}")))?;
    let body: serde_json::Value = serde_json::from_slice(&out.stdout).map_err(|_| {
        let err = String::from_utf8_lossy(&out.stderr);
        StoreErr::Failed(format!("thread store unreachable: {}", err.trim()))
    })?;
    match out.status.code() {
        Some(0) => Ok(body),
        Some(3) => match body.get("current").and_then(from_store) {
            Some(t) => Err(StoreErr::Moved(t)),
            None => Err(StoreErr::Failed("thread store: version conflict".into())),
        },
        _ => Err(StoreErr::Failed(
            body.get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("thread store failed")
                .to_string(),
        )),
    }
}

/// The store's record, in the app's shape.
fn from_store(v: &serde_json::Value) -> Option<Thread> {
    let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
    let n = |k: &str| v.get(k).and_then(|x| x.as_u64()).unwrap_or(0);
    let id = s("id");
    if id.is_empty() {
        return None;
    }
    Some(Thread {
        id,
        workspace: s("workspace"),
        title: s("title"),
        summary: s("where_it_stands"),
        status: s("status"),
        owner: s("owner"),
        created: n("created_ts"),
        updated: n("moved_ts"),
        version: n("version"),
        updated_by: s("updated_by"),
    })
}

/// Put one thread into the local copy (or drop it).
fn cache_one(app: &AppHandle, id: &str, t: Option<&Thread>) {
    let mut list = read(app);
    list.retain(|x| x.id != id);
    if let Some(t) = t {
        list.push(t.clone());
    }
    let _ = write(app, &list);
}

/// A refused write: keep the latest in the local copy, and give the person
/// their words back so nothing they typed is lost.
fn moved(app: &AppHandle, latest: Thread, yours: &str) -> String {
    cache_one(app, &latest.id.clone(), Some(&latest));
    let by = if latest.updated_by.is_empty() {
        "someone else".to_string()
    } else {
        latest.updated_by.clone()
    };
    format!(
        "{} was moved by {by} since you opened it — the latest is loaded. Your edit was not saved: {yours}",
        latest.title
    )
}

fn version_of(app: &AppHandle, id: &str) -> u64 {
    read(app)
        .into_iter()
        .find(|t| t.id == id)
        .map(|t| t.version)
        .unwrap_or(0)
}

// ---- commands ---------------------------------------------------------------

/// Every thread, most recently moved first. From the store when there is
/// one (refreshing the local copy); the local copy when it can't be reached.
#[tauri::command]
pub async fn list_threads(app: AppHandle) -> Result<Vec<Thread>, String> {
    let mut list = match store_cmd() {
        Some(cmd) => match store(&cmd, "list", None).await {
            Ok(v) => {
                let list: Vec<Thread> = v
                    .as_array()
                    .map(|a| a.iter().filter_map(from_store).collect())
                    .unwrap_or_default();
                let _ = write(&app, &list);
                list
            }
            Err(e) => {
                eprintln!("threads: {}", String::from(e));
                read(&app)
            }
        },
        None => read(&app),
    };
    list.sort_by_key(|t| std::cmp::Reverse(t.updated.max(t.created)));
    Ok(list)
}

#[tauri::command]
pub async fn create_thread(
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
    let ws = crate::workspaces::or_default(&workspace);
    if let Some(cmd) = store_cmd() {
        let op = serde_json::json!({
            "op": "create",
            "workspace": ws,
            "title": title,
            "where_it_stands": summary.unwrap_or_default().trim(),
            "owner": owner.unwrap_or_default().trim(),
            "by": writer(),
            "source": "za3tar app",
        });
        let v = store(&cmd, "put", Some(op)).await?;
        let t = from_store(&v).ok_or("thread store sent back no thread")?;
        cache_one(&app, &t.id.clone(), Some(&t));
        return Ok(t);
    }
    let mut list = read(&app);
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
        version: 0,
        updated_by: String::new(),
    };
    list.push(t.clone());
    write(&app, &list)?;
    Ok(t)
}

/// Move a thread: new summary line, status, owner, or title. `updated`
/// only advances when the summary or status actually changed.
#[tauri::command]
pub async fn update_thread(
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
    if let Some(cmd) = store_cmd() {
        let op = serde_json::json!({
            "op": "update",
            "id": id,
            "expected_version": version_of(&app, &id),
            "title": title,
            "where_it_stands": summary.trim(),
            "status": status,
            "owner": owner.trim(),
            "by": writer(),
            "source": "za3tar app",
        });
        return match store(&cmd, "put", Some(op)).await {
            Ok(v) => {
                let t = from_store(&v).ok_or("thread store sent back no thread")?;
                cache_one(&app, &id, Some(&t));
                Ok(t)
            }
            Err(StoreErr::Moved(latest)) => Err(moved(&app, latest, summary.trim())),
            Err(e) => Err(e.into()),
        };
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
pub async fn delete_thread(app: AppHandle, id: String) -> Result<(), String> {
    if let Some(cmd) = store_cmd() {
        let op = serde_json::json!({
            "op": "delete",
            "id": id,
            "expected_version": version_of(&app, &id),
            "by": writer(),
            "source": "za3tar app",
        });
        return match store(&cmd, "put", Some(op)).await {
            Ok(_) => {
                cache_one(&app, &id, None);
                Ok(())
            }
            Err(StoreErr::Moved(latest)) => Err(moved(&app, latest, "(delete)")),
            Err(e) => Err(e.into()),
        };
    }
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
            slug("Gala venue — book it for March"),
            "gala-venue-book-it-for-march"
        );
        assert!(slug("زعتر").starts_with("t-"));
    }

    #[test]
    fn reads_the_store_shape() {
        let v = serde_json::json!({
            "id": "za3tar-company", "workspace": "za3tar", "title": "Za3tar",
            "where_it_stands": "Launch next week.", "owner": "Ala", "status": "active",
            "version": 4, "updated_by": "jello", "created_ts": 10, "moved_ts": 20,
            "provenance": {"by": "jello", "source": "whatsapp"}
        });
        let t = from_store(&v).unwrap();
        assert_eq!(t.summary, "Launch next week.");
        assert_eq!((t.version, t.updated, t.created), (4, 20, 10));
        assert_eq!(t.updated_by, "jello");
        assert!(from_store(&serde_json::json!({"error": "x"})).is_none());
    }

    #[tokio::test]
    async fn store_exit_codes() {
        let ok = store(
            "printf '{\"id\":\"a\",\"version\":2}'; true #",
            "list",
            None,
        )
        .await;
        assert!(matches!(ok, Ok(v) if v["version"] == 2));
        let moved = store(
            "printf '{\"error\":\"x\",\"current\":{\"id\":\"a\",\"title\":\"A\",\"version\":5}}'; exit 3 #",
            "put",
            Some(serde_json::json!({})),
        )
        .await;
        assert!(matches!(moved, Err(StoreErr::Moved(t)) if t.version == 5));
        let failed = store("printf '{\"error\":\"no thread\"}'; exit 4 #", "put", None).await;
        assert!(matches!(failed, Err(StoreErr::Failed(m)) if m == "no thread"));
        let down = store("echo 'ssh: connect refused' >&2; exit 255 #", "list", None).await;
        assert!(matches!(down, Err(StoreErr::Failed(m)) if m.contains("connect refused")));
    }
}
