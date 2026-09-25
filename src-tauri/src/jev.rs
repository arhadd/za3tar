// Jev — the fast, typed judgment beside the writing model. TypeSafe's
// "System One" model does not write text: hand it a state and typed questions
// (pick one of these / score on this scale / is this true) and it answers
// every one in well under a second, with a confidence. Claude keeps
// everything that produces words; Jev takes the small decisions the app
// used to spend a full completion on — which workspace, which thread, what
// kind of ask this is — so the interface can react while the user types.
//
// Own key: TYPESAFE_API_KEY (Settings or .env). Signed in with Za3tar: the
// call goes through the proxy like every other provider.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const URL: &str = "https://api.typesafe.ai/v1/systemone";
const MODEL: &str = "jev-latest";

fn read_key() -> Result<String, String> {
    std::env::var("TYPESAFE_API_KEY")
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "TYPESAFE_API_KEY not set (add it in Settings or .env)".to_string())
}

/// True when a fast read is possible right now.
pub fn available() -> bool {
    crate::hosted::hosted().is_some() || read_key().is_ok()
}

/// One System One call. `state` is a string, object or array; `questions` is
/// the name → {type, instructions, criteria} map from the TypeSafe API.
/// Returns the `answers` object as-is.
pub async fn system_one(state: Value, questions: Value) -> Result<(Value, String), String> {
    let body = json!({ "model": MODEL, "state": state, "questions": questions });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;
    let req = if let Some((base, token)) = crate::hosted::hosted() {
        client
            .post(format!("{base}/v1/typesafe/systemone"))
            .bearer_auth(token)
    } else {
        client.post(URL).bearer_auth(read_key()?)
    };
    let resp = req
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("jev request failed: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        if crate::hosted::hosted().is_some() {
            return Err(crate::hosted::error_message(status, &text));
        }
        let msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v["detail"]["message"]
                    .as_str()
                    .or(v["error"].as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_default();
        return Err(format!("jev {status}: {msg}"));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("parse jev response: {e}"))?;
    let model = v["model"].as_str().unwrap_or(MODEL).to_string();
    Ok((v["answers"].clone(), model))
}

// ── the ask box ────────────────────────────────────────────────────────

/// What the frontend knows about a workspace; enough to tell one from another.
#[derive(Deserialize, Clone)]
pub struct WorkspaceIn {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// names (and orgs) of the people filed under it
    #[serde(default)]
    pub people: Vec<String>,
}

/// A hand outside the app (an ACP route to another agent).
#[derive(Deserialize, Clone)]
pub struct RouteIn {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Deserialize, Clone)]
pub struct ThreadIn {
    pub id: String,
    pub workspace: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
}

/// How Za3tar read what the user typed, before they pressed enter.
#[derive(Serialize, Default)]
pub struct AskRead {
    /// catch_up | write | do | nudge | question
    pub intent: String,
    pub intent_confidence: f64,
    /// workspace id, or "" when the text does not say
    pub workspace: String,
    pub workspace_confidence: f64,
    /// thread id, or "" when none fits
    pub thread: String,
    pub thread_confidence: f64,
    /// probability the request needs something outside the app
    pub outside: f64,
    /// route id when one hand clearly should take this, else ""
    pub hand: String,
    pub hand_confidence: f64,
    pub model: String,
    pub ms: u64,
}

fn choice<'a>(answers: &'a Value, name: &str) -> (&'a str, f64) {
    let a = &answers[name];
    (
        a["choice"].as_str().unwrap_or(""),
        a["confidence"].as_f64().unwrap_or(0.0),
    )
}

/// Read one typed ask: what kind of request, which workspace, which thread,
/// and whether it needs hands outside the app. One call, ~0.7 s.
#[tauri::command]
pub async fn read_ask(
    text: String,
    workspaces: Vec<WorkspaceIn>,
    threads: Vec<ThreadIn>,
    routes: Vec<RouteIn>,
    current_workspace: Option<String>,
) -> Result<AskRead, String> {
    let text = text.trim().to_string();
    if text.chars().count() < 3 {
        return Err("too short to read".into());
    }
    let ws_name = |id: &str| {
        workspaces
            .iter()
            .find(|w| w.id == id)
            .map(|w| w.name.clone())
            .unwrap_or_default()
    };

    let mut ws_criteria = serde_json::Map::new();
    for w in &workspaces {
        let mut d = w.name.clone();
        if !w.description.trim().is_empty() {
            d.push_str(": ");
            d.push_str(w.description.trim());
        }
        if !w.people.is_empty() {
            d.push_str(". People: ");
            d.push_str(&w.people.join(", "));
        }
        ws_criteria.insert(w.id.clone(), Value::String(d));
    }
    ws_criteria.insert("unknown".into(), Value::Null);

    let mut th_criteria = serde_json::Map::new();
    for t in threads.iter().take(200) {
        let mut d = format!("{} ({})", t.title, ws_name(&t.workspace));
        if !t.summary.trim().is_empty() {
            d.push_str(" — ");
            d.push_str(t.summary.trim());
        }
        th_criteria.insert(t.id.clone(), Value::String(d));
    }
    th_criteria.insert("none".into(), Value::Null);

    let mut questions = json!({
        "intent": {
            "type": "choice",
            "instructions": "What kind of request is `ask`?",
            "criteria": {
                "catch_up": "Wants to know where something stands, what happened, what is open, or a summary of the state of things",
                "write": "Wants something written as a draft: a message, an update, a note, an agenda, a brief, an email, a plan",
                "do": "Wants a change made in the workspace: park or close an item, confirm a decision, move or create a thread, file an entry, set an owner or a date",
                "nudge": "Wants to chase, remind or follow up with another person about something they owe",
                "question": "A general question, a request for advice, or anything else"
            }
        },
        "workspace": {
            "type": "choice",
            "instructions": "Which workspace is `ask` about? Pick unknown when the text does not say.",
            "criteria": Value::Object(ws_criteria)
        },
        "outside": {
            "type": "noul",
            "instructions": "`ask` can only be fulfilled by acting outside this app: sending an email or message, booking a calendar slot, changing files or code, searching the web, or running another agent. Reading, summarising, drafting text, and updating threads, items or decisions inside the workspace do NOT count."
        }
    });
    if !routes.is_empty() {
        let mut hand_criteria = serde_json::Map::new();
        for r in &routes {
            let d = if r.description.trim().is_empty() {
                r.label.clone()
            } else {
                format!("{}: {}", r.label, r.description.trim())
            };
            hand_criteria.insert(r.id.clone(), Value::String(d));
        }
        hand_criteria.insert(
            "none".into(),
            Value::String("Za3tar itself, inside this app: reading, summarising, drafting text, updating threads, items and decisions".into()),
        );
        questions["hand"] = json!({
            "type": "choice",
            "instructions": "Who should take `ask`? Pick an agent only when the ask names it or needs something only it can reach (its chats, calendar, email, files, the web). Otherwise none.",
            "criteria": Value::Object(hand_criteria)
        });
    }
    if th_criteria.len() > 1 {
        questions["thread"] = json!({
            "type": "choice",
            "instructions": "Which thread is `ask` about? Pick none when no thread fits.",
            "criteria": Value::Object(th_criteria)
        });
    }

    let mut state = json!({ "ask": text });
    if let Some(cur) = current_workspace.as_deref().filter(|c| !c.is_empty()) {
        state["currently_open_workspace"] = Value::String(ws_name(cur));
    }
    if let Some(u) = std::env::var("ZA3TAR_USER")
        .ok()
        .filter(|u| !u.trim().is_empty())
    {
        state["app_user"] = Value::String(u.trim().to_string());
    }

    let t0 = std::time::Instant::now();
    let (answers, model) = system_one(state, questions).await?;
    let ms = t0.elapsed().as_millis() as u64;

    let (intent, ic) = choice(&answers, "intent");
    let (ws, wc) = choice(&answers, "workspace");
    let (th, tc) = choice(&answers, "thread");
    let (hand, hc) = choice(&answers, "hand");
    let mut out = AskRead {
        intent: intent.to_string(),
        intent_confidence: ic,
        workspace: if ws == "unknown" {
            String::new()
        } else {
            ws.to_string()
        },
        workspace_confidence: wc,
        thread: if th == "none" {
            String::new()
        } else {
            th.to_string()
        },
        thread_confidence: tc,
        outside: answers["outside"]["noul"].as_f64().unwrap_or(0.0),
        hand: if hand == "none" {
            String::new()
        } else {
            hand.to_string()
        },
        hand_confidence: hc,
        model,
        ms,
    };
    // a confident thread implies its workspace
    if !out.thread.is_empty() && out.thread_confidence >= 0.6 {
        if let Some(t) = threads.iter().find(|t| t.id == out.thread) {
            if out.workspace.is_empty() || out.workspace_confidence < out.thread_confidence {
                out.workspace = t.workspace.clone();
                out.workspace_confidence = out.workspace_confidence.max(out.thread_confidence);
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real call. `TYPESAFE_API_KEY=… cargo test read_ask_live -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn read_ask_live() {
        let _ = dotenvy::from_path("../.env");
        let ws = |id: &str, name: &str, d: &str, people: &[&str]| WorkspaceIn {
            id: id.into(),
            name: name.into(),
            description: d.into(),
            people: people.iter().map(|p| p.to_string()).collect(),
        };
        let th = |id: &str, w: &str, t: &str, s: &str| ThreadIn {
            id: id.into(),
            workspace: w.into(),
            title: t.into(),
            summary: s.into(),
        };
        let workspaces = vec![
            ws(
                "gala",
                "Annual gala",
                "Madar Events: venue, hotel block, stage, catering",
                &["Lina", "Sami"],
            ),
            ws(
                "acme",
                "Acme account",
                "Client account: quarterly offsite for Acme",
                &["Dana of Acme", "Rami of Acme"],
            ),
            ws("personal", "Personal", "Home life", &["Maya"]),
        ];
        let threads = vec![
            th(
                "gala-rooms",
                "gala",
                "Gala rooms",
                "two hotel floors confirmed; overflow block unresolved",
            ),
            th(
                "stage-build",
                "gala",
                "Stage build",
                "supplier quote for the stage does not reconcile",
            ),
            th(
                "acme-offsite",
                "acme",
                "Acme offsite",
                "client walkthrough Monday",
            ),
        ];
        let routes = vec![RouteIn {
            id: "ops".into(),
            label: "Ops agent".into(),
            description:
                "an always-on agent on a server: reads the team chats, calendar, email and the web"
                    .into(),
        }];
        for ask in [
            "ask the ops agent to check the latest on the stage build group",
            "write an update for lina on the hotel rooms",
            "where are we on the stage quote?",
            "nudge dana about the headcount",
            "park the walkthrough until next week",
            "put the supplier meeting on my calendar thursday 3pm",
        ] {
            let r = read_ask(
                ask.into(),
                workspaces.clone(),
                threads.clone(),
                routes.clone(),
                None,
            )
            .await
            .expect("read_ask");
            println!(
                "{ask:?}\n   {} ({:.2}) · ws {} ({:.2}) · thread {} ({:.2}) · outside {:.0}% · hand {} ({:.2}) · {} ms",
                r.intent, r.intent_confidence, r.workspace, r.workspace_confidence, r.thread,
                r.thread_confidence, r.outside * 100.0, r.hand, r.hand_confidence, r.ms
            );
            assert!(!r.intent.is_empty());
        }
    }

    #[test]
    fn choice_reads_missing_as_empty() {
        let v = json!({ "intent": { "choice": "write", "confidence": 0.9 } });
        assert_eq!(choice(&v, "intent"), ("write", 0.9));
        assert_eq!(choice(&v, "thread"), ("", 0.0));
    }
}
