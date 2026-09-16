// Talk — the voice session. gpt-live-1 does the listening and speaking over
// WebRTC straight from the webview; this module does the three things the
// webview cannot: create the session with the API key, hold the sideband
// WebSocket (bearer header) that carries client delegations, and run
// Za3tar's brain for each delegated turn. See src/live.ts for the other half.

use std::collections::HashMap;
use std::sync::Mutex;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const MODEL: &str = "gpt-live-1";
const VOICE: &str = "marin";

#[derive(Default)]
pub struct LiveState {
    /// session id → outbound sender for the sideband
    senders: Mutex<HashMap<String, mpsc::UnboundedSender<String>>>,
}

fn key() -> Result<String, String> {
    std::env::var("OPENAI_API_KEY")
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "no OpenAI key — add it under Settings to use Talk".to_string())
}

/// Create a live session for the webview's WebRTC offer; returns the API's
/// response (session id + SDP answer) untouched.
#[tauri::command]
pub async fn live_session_create(
    sdp: String,
    instructions: String,
) -> Result<serde_json::Value, String> {
    if !sdp.starts_with("v=0") {
        return Err("invalid SDP offer".into());
    }
    let body = serde_json::json!({
        "session": {
            "model": MODEL,
            "store": false,
            "instructions": instructions,
            "audio": { "output": { "voice": VOICE } },
            "delegation": { "type": "client" }
        },
        "transport": { "type": "webrtc", "sdp": sdp }
    });
    let r = reqwest::Client::new()
        .post("https://api.openai.com/v1/live/sessions")
        .bearer_auth(key()?)
        .json(&body)
        .timeout(std::time::Duration::from_secs(25))
        .send()
        .await
        .map_err(|e| format!("voice service unreachable: {e}"))?;
    let status = r.status();
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        let msg = v["error"]["message"]
            .as_str()
            .unwrap_or("voice service could not start")
            .to_string();
        return Err(format!("{status}: {msg}"));
    }
    Ok(v)
}

/// Attach to the session's sideband and relay every event to the webview as
/// `live-event`. Outbound messages come through `live_send`.
#[tauri::command]
pub async fn live_attach(app: AppHandle, session_id: String) -> Result<(), String> {
    let url = format!(
        "wss://api.openai.com/v1/live/sessions/{}/attach",
        urlencoding::encode(&session_id)
    );
    let mut req = url.into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", key()?)
            .parse()
            .map_err(|_| "bad key")?,
    );
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .map_err(|e| format!("sideband: {e}"))?;
    let (mut sink, mut stream) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    app.state::<LiveState>()
        .senders
        .lock()
        .map_err(|_| "state")?
        .insert(session_id.clone(), tx);

    // outbound
    tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });
    // inbound → webview
    let app2 = app.clone();
    let sid = session_id.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            if let Message::Text(t) = msg {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&t) {
                    let _ = app2.emit("live-event", v);
                }
            }
        }
        let _ = app2.emit("live-event", serde_json::json!({"type": "sideband.closed"}));
        if let Ok(mut m) = app2.state::<LiveState>().senders.lock() {
            m.remove(&sid);
        }
    });
    Ok(())
}

/// Send one event on the sideband — commentary that answers a delegation,
/// or an instruction append.
#[tauri::command]
pub fn live_send(
    app: AppHandle,
    session_id: String,
    event_type: String,
    delegation_id: Option<String>,
    content: String,
) -> Result<(), String> {
    let msg = serde_json::json!({
        "type": event_type,
        "event_id": format!("za-{}", nanos()),
        "delegation_id": delegation_id,
        "content": content.chars().take(1600).collect::<String>(),
    });
    let st = app.state::<LiveState>();
    let m = st.senders.lock().map_err(|_| "state")?;
    let tx = m.get(&session_id).ok_or("sideband not attached")?;
    tx.send(msg.to_string())
        .map_err(|_| "sideband closed".to_string())
}

#[tauri::command]
pub fn live_detach(app: AppHandle, session_id: String) -> Result<(), String> {
    if let Ok(mut m) = app.state::<LiveState>().senders.lock() {
        m.remove(&session_id); // dropping the sender ends the outbound task
    }
    Ok(())
}

fn nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

const BRAIN_SYSTEM: &str = r#"You are Za3tar, the assistant inside the Za3tar app, answering a SPOKEN conversation. The user talks in Arabic, English, or both; answer in the same mix, short, like a sharp colleague — one to three sentences, no lists, no markdown. Never invent state: everything you know is in the SNAPSHOT.

You can act on the app with ops. Use the exact ids from the snapshot.
- {"op":"park","ref":"<action ref>"} / "unpark" / "done"  — action refs look like 1789448400#2
- {"op":"confirm","ref":"<decision ref>"} / "supersede"     — decision refs look like d:1789448400#1
- {"op":"move_thread","id":"<thread id>","summary":"<new where-it-stands line>","status":"active|parked|done"}  (omit fields you are not changing)
- {"op":"open_thread","id":"<thread id>"}
- {"op":"go","view":"overview|threads|meetings|people|decisions|followups"}
- {"op":"brief","title":"…","notes":"…"}   — when the user dictates something to file
- {"op":"record"} / {"op":"stop_recording"}
- {"op":"workspace","id":"<workspace id>"}   — switch workspace
- {"op":"open_meeting","id":"<meeting id>"}   — meeting ids are the numbers in [brackets] under meetings & briefs
- {"op":"draft","kind":"whatsapp|email"}      — draft the follow-up for the OPEN meeting (open one first if needed; ops run in order)
- {"op":"nudge","ref":"<action ref>"}          — draft a WhatsApp nudge about one open item
- {"op":"person","name":"…","phone":"…","email":"…","org":"…","role":"…"}  — save contact details (only the fields given)
- {"op":"create_workspace","name":"…","description":"…"}   — a new context (a client, a project family, personal)
- {"op":"create_thread","workspace":"<workspace id>","title":"…","summary":"<where it stands>","owner":"…"}  — an initiative inside a workspace; ids of workspaces you just created are their name slugified (lowercase, dashes)
- {"op":"file_meeting","id":"<meeting id>","thread":"<thread id>"}  — file an entry under a thread
- {"op":"route","route":"<route id>","message":"…"}  — hand work to one of the ROUTES in the snapshot (other agents with hands: calendar, WhatsApp, checking on people, the By Jello app, anything outside this Mac). Use it ONLY for that, or when the user names the route ("ask Jello…"). Phrase the message as a clear, self-contained request with the context it needs. Say you are handing it off; the route's own answer gets spoken after yours.

If the SNAPSHOT says MODE: onboarding, you are meeting a new user: your job is to turn what they tell you into workspaces (one per client / company / big area, plus Personal which exists), then one thread per thing in motion with a where-it-stands line in their words, then the people they name. Ask one question at a time, keep it light, reflect back what you created, and when there are two or three threads suggest they record their next meeting or paste a message as a brief. Do not invent anything they did not say.

If the SNAPSHOT says MODE: sorting, there are entries not filed under any thread: propose which thread each belongs to (or a new thread), and file them with file_meeting when the user agrees.

Rules: act when the user clearly asked; ask one short question when the target is ambiguous. Confirm what you did in plain words ("parked the tent thing", "moved Jello House"). If nothing needs doing, just answer.

OUTPUT: only JSON, no fences: {"say":"…","ops":[…]}"#;

/// One delegated turn: the workspace snapshot + the recent transcript in,
/// a spoken reply + ops out.
#[tauri::command]
pub async fn live_turn(
    snapshot: String,
    transcript: String,
    typed: Option<bool>,
) -> Result<serde_json::Value, String> {
    let mut user = String::from("# SNAPSHOT\n");
    if typed.unwrap_or(false) {
        user.push_str("(this is a TYPED chat, not voice: you may use two or three short lines and plain lists)\n");
    }
    user.push_str(&snapshot);
    if let Some(u) = crate::anthropic::user_context_line() {
        user.push('\n');
        user.push_str(&u);
    }
    user.push_str("\n\n# CONVERSATION (latest last)\n");
    user.push_str(&transcript);
    user.push_str("\n\nReply to the last thing the user said.");
    let (raw, _) = crate::anthropic::complete(BRAIN_SYSTEM, &user, 1024).await?;
    let json = match (raw.find('{'), raw.rfind('}')) {
        (Some(a), Some(b)) if b > a => &raw[a..=b],
        _ => raw.trim(),
    };
    let v: serde_json::Value = serde_json::from_str(json)
        .unwrap_or_else(|_| serde_json::json!({"say": raw.trim(), "ops": []}));
    Ok(v)
}
