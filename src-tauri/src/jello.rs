// The Jello bridge — za3tar's proper integration with the fleet. Jello (the
// user's always-on Hermes agent) already holds the calendar (tyme), WhatsApp,
// and the rest of the user's world; za3tar just needs to hand it work. The
// transport is the existing `hx` CLI bridge (ssh → web0-core → hermes), so
// there are no new servers, tokens, or listeners — if hx works in a terminal,
// it works here. Nothing is sent without an explicit click in the UI.

use std::path::PathBuf;

fn hx_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ZA3TAR_HX") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var_os("HOME")?;
    let p = PathBuf::from(home).join("bin/hx");
    p.exists().then_some(p)
}

/// Send one message to the jello profile and return its reply. Runs on a
/// blocking thread — the ssh round-trip plus an agent turn can take a while.
#[tauri::command]
pub async fn send_to_jello(message: String) -> Result<String, String> {
    let hx =
        hx_path().ok_or("hx bridge not found — expected ~/bin/hx (or set ZA3TAR_HX)")?;
    tauri::async_runtime::spawn_blocking(move || {
        let out = std::process::Command::new(&hx)
            .args(["-p", "jello", "-z", &message])
            .output()
            .map_err(|e| format!("run hx: {e}"))?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if !out.status.success() {
            return Err(if stderr.is_empty() {
                format!("hx exited with {}", out.status)
            } else {
                stderr
            });
        }
        Ok(if stdout.is_empty() {
            "sent to jello".to_string()
        } else {
            stdout
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
