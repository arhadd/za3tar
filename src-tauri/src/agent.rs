// The agent bridge — za3tar's integration with *your* agent. Whatever
// always-on assistant you run (a Hermes/OpenClaw profile, a Claude agent, a
// script) already holds your calendar, WhatsApp, and the rest of your world;
// za3tar just hands it work over a versioned envelope protocol
// (docs/AGENT-PROTOCOL.md). The transport is any command you configure that
// accepts the message as its final argument and prints the reply on stdout —
// if it works in a terminal, it works here. Nothing is sent without an
// explicit click in the UI.

/// Resolve the transport command line (without the message argument).
/// Precedence: the workspace's own runtime (workspaces.rs) → ZA3TAR_AGENT_CMD
/// (in-app setting or env) → legacy hx bridge (ZA3TAR_HX or ~/bin/hx, kept
/// for setups that predate the generic bridge).
fn agent_cmd(app: &tauri::AppHandle, workspace: Option<&str>) -> Option<String> {
    if let Some(cmd) = workspace.and_then(|w| crate::workspaces::runtime_for(app, w)) {
        return Some(cmd);
    }
    if let Ok(cmd) = std::env::var("ZA3TAR_AGENT_CMD") {
        let cmd = cmd.trim().to_string();
        if !cmd.is_empty() {
            return Some(cmd);
        }
    }
    let hx = std::env::var("ZA3TAR_HX")
        .map(std::path::PathBuf::from)
        .ok()
        .filter(|p| p.exists())
        .or_else(|| {
            let home = std::env::var_os("HOME")?;
            let p = std::path::PathBuf::from(home).join("bin/hx");
            p.exists().then_some(p)
        })?;
    Some(format!("{} -p jello -z", hx.display()))
}

/// Whether a bridge is configured at all — the UI hides the agent features
/// entirely when this is false.
#[tauri::command]
pub fn agent_available(app: tauri::AppHandle, workspace: Option<String>) -> bool {
    agent_cmd(&app, workspace.as_deref()).is_some()
}

/// Send one message to the agent and return its reply. Runs on a blocking
/// thread — the transport round-trip plus an agent turn can take a while.
#[tauri::command]
pub async fn send_to_agent(
    app: tauri::AppHandle,
    message: String,
    workspace: Option<String>,
) -> Result<String, String> {
    let cmd = agent_cmd(&app, workspace.as_deref()).ok_or(
        "no agent connected — set the agent command in ⚙ settings \
         (any command that takes the message as an argument and prints the reply)",
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        // `sh -c '<cmd> "$0"' <message>` — the user's command line keeps its
        // own quoting/env, the message always arrives as one argument.
        let out = std::process::Command::new("/bin/sh")
            .args(["-c", &format!("{cmd} \"$0\""), &message])
            .output()
            .map_err(|e| format!("run agent command: {e}"))?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if !out.status.success() {
            return Err(if stderr.is_empty() {
                format!("agent command exited with {}", out.status)
            } else {
                stderr
            });
        }
        Ok(if stdout.is_empty() {
            "sent to the agent".to_string()
        } else {
            stdout
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
