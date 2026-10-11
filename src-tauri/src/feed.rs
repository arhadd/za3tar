// The live feed — what an assistant is doing elsewhere, as it happens. A
// route can name a second command, `live`, that speaks the za3tar-live line
// (live/za3tar_live.py): it prints status and change events and answers
// read-only GETs. This module keeps that command running while the app is
// open, restarts it when ssh drops or the Mac wakes from sleep, and relays it
// to the webview as `feed-event`.
//
// Read-only both ways: the line only carries GETs, and the far side refuses
// any path outside the session list.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot, Notify};

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

/// how often we check the far side still answers; a sleeping Mac or a dead
/// network leaves ssh hanging rather than exiting
const BEAT: Duration = Duration::from_secs(15);

struct Line {
    tx: mpsc::UnboundedSender<String>,
    pending: Pending,
}

struct Feed {
    command: String,
    stop: Arc<AtomicBool>,
    wake: Arc<Notify>,
    line: Arc<Mutex<Option<Line>>>,
    next_id: Arc<AtomicU64>,
}

#[derive(Default)]
pub struct FeedState {
    feeds: Mutex<HashMap<String, Feed>>,
}

fn emit(app: &AppHandle, route: &str, kind: &str, body: serde_json::Value) {
    let mut v = serde_json::json!({ "route": route, "kind": kind });
    if let (Some(o), Some(b)) = (v.as_object_mut(), body.as_object()) {
        for (k, val) in b {
            o.insert(k.clone(), val.clone());
        }
    }
    let _ = app.emit("feed-event", v);
}

/// Keep a route's live line running. The command comes from the saved
/// routes, never from the webview. Starting a feed that already runs the same
/// command is a no-op, so the webview can call this freely.
#[tauri::command]
pub fn feed_start(app: AppHandle, route: String) -> Result<(), String> {
    let saved = crate::acp::saved_routes(&app)?
        .into_iter()
        .find(|r| r.id == route)
        .ok_or_else(|| format!("no route named {route}"))?;
    let command = saved.live.trim().to_string();
    if !saved.enabled || command.is_empty() {
        return feed_stop(app, route);
    }
    let st = app.state::<FeedState>();
    let mut feeds = st.feeds.lock().map_err(|_| "state")?;
    if feeds.get(&route).is_some_and(|f| f.command == command) {
        return Ok(());
    }
    if let Some(old) = feeds.remove(&route) {
        old.stop.store(true, Ordering::SeqCst);
        old.wake.notify_one();
    }
    let feed = Feed {
        command: command.clone(),
        stop: Arc::new(AtomicBool::new(false)),
        wake: Arc::new(Notify::new()),
        line: Arc::new(Mutex::new(None)),
        next_id: Arc::new(AtomicU64::new(1)),
    };
    let (stop, wake, line, next_id) = (
        feed.stop.clone(),
        feed.wake.clone(),
        feed.line.clone(),
        feed.next_id.clone(),
    );
    feeds.insert(route.clone(), feed);
    tauri::async_runtime::spawn(supervise(
        app.clone(),
        route,
        command,
        stop,
        wake,
        line,
        next_id,
    ));
    Ok(())
}

#[tauri::command]
pub fn feed_stop(app: AppHandle, route: String) -> Result<(), String> {
    let st = app.state::<FeedState>();
    let mut feeds = st.feeds.lock().map_err(|_| "state")?;
    if let Some(f) = feeds.remove(&route) {
        f.stop.store(true, Ordering::SeqCst);
        f.wake.notify_one();
    }
    Ok(())
}

/// One read over the live line, e.g. `/api/sessions?order=recent&limit=6`.
#[tauri::command]
pub async fn feed_get(
    app: AppHandle,
    route: String,
    path: String,
) -> Result<serde_json::Value, String> {
    let (tx, pending, id) = {
        let st = app.state::<FeedState>();
        let feeds = st.feeds.lock().map_err(|_| "state")?;
        let f = feeds.get(&route).ok_or("no live feed for this route")?;
        let line = f.line.lock().map_err(|_| "state")?;
        let l = line.as_ref().ok_or("live feed is not connected")?;
        (
            l.tx.clone(),
            l.pending.clone(),
            f.next_id.fetch_add(1, Ordering::SeqCst),
        )
    };
    let (stx, srx) = oneshot::channel();
    pending.lock().map_err(|_| "state")?.insert(id, stx);
    tx.send(serde_json::json!({ "id": id, "get": path }).to_string())
        .map_err(|_| "live feed closed".to_string())?;
    let v = tokio::time::timeout(Duration::from_secs(20), srx)
        .await
        .map_err(|_| "live feed: no reply in 20s".to_string())?
        .map_err(|_| "live feed closed".to_string())?;
    if let Some(e) = v.get("error").and_then(|e| e.as_str()) {
        return Err(e.to_string());
    }
    Ok(v["result"].clone())
}

/// Run the line, and run it again when it drops, backing off while it keeps
/// failing, until the feed is stopped.
async fn supervise(
    app: AppHandle,
    route: String,
    command: String,
    stop: Arc<AtomicBool>,
    wake: Arc<Notify>,
    line: Arc<Mutex<Option<Line>>>,
    next_id: Arc<AtomicU64>,
) {
    let mut wait = 5;
    while !stop.load(Ordering::SeqCst) {
        emit(
            &app,
            &route,
            "status",
            serde_json::json!({ "status": "connecting" }),
        );
        let began = Instant::now();
        let why = run_once(&app, &route, &command, &stop, &wake, &line, &next_id).await;
        if let Ok(mut l) = line.lock() {
            *l = None;
        }
        if stop.load(Ordering::SeqCst) {
            break;
        }
        emit(
            &app,
            &route,
            "status",
            serde_json::json!({ "status": "down", "error": why }),
        );
        if began.elapsed() > Duration::from_secs(60) {
            wait = 5;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(wait)) => {}
            _ = wake.notified() => {}
        }
        wait = (wait * 2).min(60);
    }
}

/// One run of the line, until it ends. Returns why it ended.
async fn run_once(
    app: &AppHandle,
    route: &str,
    command: &str,
    stop: &AtomicBool,
    wake: &Notify,
    line: &Mutex<Option<Line>>,
    next_id: &AtomicU64,
) -> String {
    let mut child = match tokio::process::Command::new("/bin/sh")
        .args(["-c", command])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => return format!("could not start the live command: {e}"),
    };
    let (Some(mut stdin), Some(stdout), Some(stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        return "live command has no pipes".into();
    };

    // ssh says why it could not connect on stderr; keep its last line
    let last_err = Arc::new(Mutex::new(String::new()));
    let last_err2 = last_err.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            if !l.trim().is_empty() {
                if let Ok(mut e) = last_err2.lock() {
                    *e = l.trim().chars().take(300).collect();
                }
            }
        }
    });

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    tauri::async_runtime::spawn(async move {
        while let Some(l) = rx.recv().await {
            if stdin.write_all(format!("{l}\n").as_bytes()).await.is_err() {
                break;
            }
            let _ = stdin.flush().await;
        }
        // dropping stdin tells the far side we are gone; it stops its backend
    });
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    if let Ok(mut l) = line.lock() {
        *l = Some(Line {
            tx: tx.clone(),
            pending: pending.clone(),
        });
    }

    let mut lines = BufReader::new(stdout).lines();
    let mut beat = tokio::time::interval(BEAT);
    beat.tick().await;
    let mut ping: Option<u64> = None;
    let mut why: Option<String> = None;
    loop {
        tokio::select! {
            l = lines.next_line() => {
                let Ok(Some(l)) = l else { break };
                let Ok(v) = serde_json::from_str::<serde_json::Value>(&l) else { continue };
                if let Some(id) = v["id"].as_u64() {
                    if ping == Some(id) {
                        ping = None;
                    } else if let Some(s) = pending.lock().ok().and_then(|mut m| m.remove(&id)) {
                        let _ = s.send(v);
                    }
                } else if let Some(status) = v["status"].as_str() {
                    if status == "down" {
                        why = v["error"].as_str().map(str::to_string);
                    } else {
                        emit(app, route, "status", serde_json::json!({ "status": status }));
                    }
                } else if let Some(event) = v["event"].as_str() {
                    emit(app, route, "event", serde_json::json!({ "event": event }));
                }
            }
            _ = beat.tick() => {
                // the last ping had a whole beat to come back
                if ping.is_some() {
                    why = Some("no answer from the live line (offline or asleep?)".into());
                    break;
                }
                let id = next_id.fetch_add(1, Ordering::SeqCst);
                let _ = tx.send(serde_json::json!({ "id": id, "ping": true }).to_string());
                ping = Some(id);
            }
            _ = wake.notified() => {
                if stop.load(Ordering::SeqCst) { break; }
            }
        }
    }

    // Close our end first so the far side stops its backend cleanly; kill
    // only if it does not leave on its own.
    if let Ok(mut l) = line.lock() {
        *l = None;
    }
    drop(tx);
    if tokio::time::timeout(Duration::from_secs(5), child.wait())
        .await
        .is_err()
    {
        let _ = child.kill().await;
    }
    why.or_else(|| {
        last_err
            .lock()
            .ok()
            .map(|e| e.clone())
            .filter(|e| !e.is_empty())
    })
    .unwrap_or_else(|| "the live line closed".into())
}
