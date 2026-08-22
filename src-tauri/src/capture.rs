// Orchestrates the native `za3tar-capture` helper: spawns it, streams its
// JSON-line events to the frontend, and stops it cleanly so the WAV files
// finalize. The heavy Core Audio work lives in the Swift helper; Rust just
// supervises the process.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

/// Live recording, if any. Holds the children so we can signal + reap them.
/// Two helper processes per recording — the mic's echo-cancellation unit and
/// the system-audio process tap cannot share a process (VP reconfigures the
/// output device and the tap's IO stops firing), so each track gets its own.
#[derive(Default)]
pub struct CaptureState(pub Mutex<Option<Recording>>);

pub struct Recording {
    children: Vec<(Child, i32)>,
    pub dir: PathBuf,
}

#[derive(Serialize, Clone)]
pub struct StartedRecording {
    pub dir: String,
}

/// Locate the signed helper binary. Overridable for dev via ZA3TAR_CAPTURE_BIN;
/// otherwise look next to the app's resources, then in the dev source tree.
fn helper_path(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ZA3TAR_CAPTURE_BIN") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    // bundled: alongside the app resources
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("binaries/za3tar-capture");
        if p.exists() {
            return Some(p);
        }
    }
    // dev: the tree we built into during M1
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/za3tar-capture");
    if dev.exists() {
        return Some(dev);
    }
    None
}

#[tauri::command]
pub fn start_recording(
    app: AppHandle,
    state: State<'_, CaptureState>,
) -> Result<StartedRecording, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("already recording".into());
    }

    let helper = helper_path(&app)
        .ok_or_else(|| "capture helper not found — build it with capture/build.sh".to_string())?;

    // recordings/<unix-seconds>/ under the app data dir
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings")
        .join(stamp.to_string());
    std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;

    let mut children = Vec::new();
    for only in ["--only=system", "--only=mic"] {
        let mut child = Command::new(&helper)
            .arg(&base)
            .arg(only)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("failed to launch capture helper ({only}): {e}"))?;

        let pid = child.id() as i32;

        // forward the helper's JSON-line events to the frontend
        if let Some(stdout) = child.stdout.take() {
            let app2 = app.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().map_while(Result::ok) {
                    let payload: serde_json::Value = serde_json::from_str(&line)
                        .unwrap_or_else(|_| serde_json::json!({ "event": "log", "message": line }));
                    let _ = app2.emit("capture-event", payload);
                }
                // stdout closed => helper exited
                let _ = app2.emit("capture-event", serde_json::json!({ "event": "closed" }));
            });
        }
        children.push((child, pid));
    }

    *guard = Some(Recording {
        children,
        dir: base.clone(),
    });

    Ok(StartedRecording {
        dir: base.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn stop_recording(state: State<'_, CaptureState>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let Some(mut rec) = guard.take() else {
        return Err("not recording".into());
    };

    // SIGTERM lets the helpers finalize the WAV files (SIGKILL would truncate
    // them). Signal both first, then reap, so they wind down in parallel.
    #[cfg(unix)]
    for (_, pid) in &rec.children {
        unsafe {
            libc::kill(*pid, libc::SIGTERM);
        }
    }
    for (child, _) in rec.children.iter_mut() {
        let _ = child.wait();
    }
    Ok(rec.dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn is_recording(state: State<'_, CaptureState>) -> bool {
    state.0.lock().map(|g| g.is_some()).unwrap_or(false)
}
