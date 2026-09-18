// Routes — the hands Za3tar can hand work to. A route is a command. An
// "acp" route speaks the Agent Client Protocol over stdio (JSON-RPC lines),
// which is how an editor talks to an agent: we send prompts, the agent
// streams message chunks, tool calls and permission requests back, and we
// answer the permission requests. A "oneshot" route is the older shape:
// message as the final argument, reply on stdout (agent.rs).
//
// Everything the agent does is relayed to the webview as `acp-event`, so the
// user sees the work, not a spinner. Nothing runs without a prompt from the
// app, and dangerous tool calls stop at an on-screen approve/deny.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Route {
    pub id: String,
    pub label: String,
    /// one line the brain reads to decide when to use this route
    #[serde(default)]
    pub description: String,
    /// "acp" | "oneshot"
    #[serde(default = "oneshot")]
    pub kind: String,
    pub command: String,
    /// working directory the agent session is bound to (its side)
    #[serde(default)]
    pub cwd: String,
    #[serde(default = "yes")]
    pub enabled: bool,
}
fn oneshot() -> String {
    "oneshot".into()
}
fn yes() -> bool {
    true
}

fn routes_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("routes.json"))
}

fn defaults() -> Vec<Route> {
    vec![Route {
        id: "jello".into(),
        label: "Jello".into(),
        description: "the always-on operator: calendar, WhatsApp delivery, checking on people, the By Jello app, anything outside this Mac".into(),
        kind: "acp".into(),
        cwd: "/srv/jello".into(),
        command: "ssh web0-core \"sudo -u web0 bash -l -c 'cd /home/web0 && export HERMES_HOME=/home/web0/.hermes && export PATH=/home/web0/.hermes/node/bin:/home/web0/.hermes/hermes-agent/venv/bin:\\$PATH && hermes -p jello acp'\"".into(),
        enabled: true,
    }]
}

#[tauri::command]
pub fn list_routes(app: AppHandle) -> Result<Vec<Route>, String> {
    let p = routes_path(&app)?;
    Ok(std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(defaults))
}

#[tauri::command]
pub fn save_routes(app: AppHandle, routes: Vec<Route>) -> Result<(), String> {
    let p = routes_path(&app)?;
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&routes).map_err(|e| e.to_string())?;
    std::fs::write(p, json).map_err(|e| e.to_string())
}

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<serde_json::Value>>>>;

struct Conn {
    tx: mpsc::UnboundedSender<String>,
    pending: Pending,
    next_id: Arc<AtomicU64>,
    session_id: Option<String>,
    /// agent text since the last prompt started
    text: Arc<Mutex<String>>,
    child: Arc<Mutex<Option<tokio::process::Child>>>,
}

#[derive(Default)]
pub struct AcpState {
    conns: Mutex<HashMap<String, Conn>>,
}

fn emit(app: &AppHandle, route: &str, kind: &str, body: serde_json::Value) {
    let mut v = serde_json::json!({ "route": route, "kind": kind });
    if let (Some(o), Some(b)) = (v.as_object_mut(), body.as_object()) {
        for (k, val) in b {
            o.insert(k.clone(), val.clone());
        }
    }
    let _ = app.emit("acp-event", v);
}

async fn call(
    tx: &mpsc::UnboundedSender<String>,
    pending: &Pending,
    next_id: &AtomicU64,
    method: &str,
    params: serde_json::Value,
    timeout: std::time::Duration,
) -> Result<serde_json::Value, String> {
    let id = next_id.fetch_add(1, Ordering::SeqCst);
    let (stx, srx) = oneshot::channel();
    pending.lock().map_err(|_| "state")?.insert(id, stx);
    let msg = serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
    tx.send(msg.to_string())
        .map_err(|_| "route closed".to_string())?;
    let v = tokio::time::timeout(timeout, srx)
        .await
        .map_err(|_| format!("{method}: no reply in time"))?
        .map_err(|_| "route closed".to_string())?;
    if let Some(err) = v.get("error") {
        return Err(err["message"].as_str().unwrap_or("route error").to_string());
    }
    Ok(v["result"].clone())
}

/// Start a route's process, handshake, open a session. Returns the session id.
#[tauri::command]
pub async fn acp_start(
    app: AppHandle,
    route: String,
    command: String,
    cwd: Option<String>,
) -> Result<String, String> {
    acp_stop(app.clone(), route.clone())?;
    let mut child = tokio::process::Command::new("/bin/sh")
        .args(["-c", &command])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("start route: {e}"))?;
    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let pending: Pending = Arc::new(Mutex::new(HashMap::new()));
    let next_id = Arc::new(AtomicU64::new(1));
    let text = Arc::new(Mutex::new(String::new()));

    // writer
    tauri::async_runtime::spawn(async move {
        while let Some(line) = rx.recv().await {
            if stdin
                .write_all(format!("{line}\n").as_bytes())
                .await
                .is_err()
            {
                break;
            }
            let _ = stdin.flush().await;
        }
    });
    // reader → responses, events, permission requests
    let app2 = app.clone();
    let r2 = route.clone();
    let pending2 = pending.clone();
    let text2 = text.clone();
    let tx2 = tx.clone();
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            let method = v["method"].as_str();
            if method.is_none() {
                if let Some(id) = v["id"].as_u64() {
                    if let Ok(mut m) = pending2.lock() {
                        if let Some(s) = m.remove(&id) {
                            let _ = s.send(v);
                        }
                    }
                }
                continue;
            }
            match method.unwrap() {
                "session/update" => {
                    let u = &v["params"]["update"];
                    if u["sessionUpdate"] == "agent_message_chunk" {
                        if let Some(t) = u["content"]["text"].as_str() {
                            if let Ok(mut b) = text2.lock() {
                                b.push_str(t);
                            }
                        }
                    }
                    emit(&app2, &r2, "update", serde_json::json!({ "update": u }));
                }
                "session/request_permission" => {
                    emit(
                        &app2,
                        &r2,
                        "permission",
                        serde_json::json!({ "rpc_id": v["id"], "params": v["params"] }),
                    );
                }
                other => {
                    // requests we did not offer (fs, terminal) → refuse politely
                    if let Some(id) = v.get("id") {
                        let resp = serde_json::json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":format!("{other} not supported by Za3tar")}});
                        let _ = tx2.send(resp.to_string());
                    }
                }
            }
        }
        emit(&app2, &r2, "closed", serde_json::json!({}));
        if let Ok(mut m) = app2.state::<AcpState>().conns.lock() {
            m.remove(&r2);
        }
    });

    let child = Arc::new(Mutex::new(Some(child)));
    {
        let st = app.state::<AcpState>();
        let mut m = st.conns.lock().map_err(|_| "state")?;
        m.insert(
            route.clone(),
            Conn {
                tx: tx.clone(),
                pending: pending.clone(),
                next_id: next_id.clone(),
                session_id: None,
                text: text.clone(),
                child: child.clone(),
            },
        );
    }
    emit(
        &app,
        &route,
        "status",
        serde_json::json!({ "status": "connecting" }),
    );
    call(
        &tx,
        &pending,
        &next_id,
        "initialize",
        serde_json::json!({"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false}}),
        std::time::Duration::from_secs(60),
    )
    .await?;
    let sess = call(
        &tx,
        &pending,
        &next_id,
        "session/new",
        serde_json::json!({"cwd": cwd.unwrap_or_else(|| "/".into()), "mcpServers": []}),
        std::time::Duration::from_secs(120),
    )
    .await?;
    let sid = sess["sessionId"]
        .as_str()
        .ok_or("no session id")?
        .to_string();
    {
        let st = app.state::<AcpState>();
        let mut m = st.conns.lock().map_err(|_| "state")?;
        if let Some(c) = m.get_mut(&route) {
            c.session_id = Some(sid.clone());
        }
    }
    emit(
        &app,
        &route,
        "status",
        serde_json::json!({ "status": "ready", "session": sid }),
    );
    Ok(sid)
}

/// Send a prompt and wait for the turn to end. The stream arrives as events
/// meanwhile; the return carries the agent's full text for that turn.
#[tauri::command]
pub async fn acp_prompt(
    app: AppHandle,
    route: String,
    text: String,
) -> Result<serde_json::Value, String> {
    let (tx, pending, next_id, sid, buf) = {
        let st = app.state::<AcpState>();
        let m = st.conns.lock().map_err(|_| "state")?;
        let c = m.get(&route).ok_or("route not started")?;
        (
            c.tx.clone(),
            c.pending.clone(),
            c.next_id.clone(),
            c.session_id.clone().ok_or("route has no session")?,
            c.text.clone(),
        )
    };
    if let Ok(mut b) = buf.lock() {
        b.clear();
    }
    emit(
        &app,
        &route,
        "status",
        serde_json::json!({ "status": "working" }),
    );
    let res = call(
        &tx,
        &pending,
        &next_id,
        "session/prompt",
        serde_json::json!({"sessionId": sid, "prompt": [{"type":"text","text": text}]}),
        std::time::Duration::from_secs(600),
    )
    .await;
    emit(
        &app,
        &route,
        "status",
        serde_json::json!({ "status": "ready" }),
    );
    let r = res?;
    let text = buf.lock().map(|b| b.clone()).unwrap_or_default();
    Ok(serde_json::json!({ "stopReason": r["stopReason"], "text": text.trim() }))
}

/// Answer a permission request the agent raised (rpc_id from the event).
#[tauri::command]
pub fn acp_permission(
    app: AppHandle,
    route: String,
    rpc_id: serde_json::Value,
    option_id: String,
) -> Result<(), String> {
    let st = app.state::<AcpState>();
    let m = st.conns.lock().map_err(|_| "state")?;
    let c = m.get(&route).ok_or("route not started")?;
    let resp = serde_json::json!({"jsonrpc":"2.0","id":rpc_id,"result":{"outcome":{"outcome":"selected","optionId":option_id}}});
    c.tx.send(resp.to_string())
        .map_err(|_| "route closed".to_string())
}

#[tauri::command]
pub fn acp_cancel(app: AppHandle, route: String) -> Result<(), String> {
    let st = app.state::<AcpState>();
    let m = st.conns.lock().map_err(|_| "state")?;
    let c = m.get(&route).ok_or("route not started")?;
    let sid = c.session_id.clone().ok_or("no session")?;
    let msg =
        serde_json::json!({"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId": sid}});
    c.tx.send(msg.to_string())
        .map_err(|_| "route closed".to_string())
}

#[tauri::command]
pub fn acp_stop(app: AppHandle, route: String) -> Result<(), String> {
    let st = app.state::<AcpState>();
    let mut m = st.conns.lock().map_err(|_| "state")?;
    if let Some(c) = m.remove(&route) {
        if let Ok(mut ch) = c.child.lock() {
            if let Some(mut child) = ch.take() {
                let _ = child.start_kill();
            }
        }
    }
    Ok(())
}
