// The actions layer — rungs 2 and 3 of the za3tar ladder.
//
// Rung 2 (synthesize): the transcript becomes structured outcomes — decisions,
// action items with owners and due dates, open questions — persisted as
// actions.json next to the recording. Same code-switching contract as notes.
//
// Rung 3 (execute): each outcome can leave the app — a WhatsApp follow-up or
// recap email drafted in the meeting's own language mix, action items exported
// to Calendar as an .ics, and done/todo state that survives reopening.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::anthropic;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ActionItem {
    #[serde(default)]
    pub id: u32,
    pub title: String,
    pub owner: String, // "me" | "them" | a name revealed in the meeting
    #[serde(default)]
    pub due_label: Option<String>, // as spoken: "بكرا", "end of week"
    #[serde(default)]
    pub due_date: Option<String>, // resolved ISO date when inferable
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub done: bool,
}

/// A decision is a record, not a sentence: it has an id, a status that moves
/// from proposed (the extractor's suggestion) to confirmed (a human agreed)
/// or superseded (a later meeting changed it), and an optional note saying
/// why. actions.json files written before this shape held plain strings —
/// `de_decisions` reads both, so nothing needs migrating.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Decision {
    #[serde(default)]
    pub id: u32,
    pub text: String,
    #[serde(default = "proposed")]
    pub status: String, // "proposed" | "confirmed" | "superseded"
    #[serde(default)]
    pub note: String,
}

fn proposed() -> String {
    "proposed".into()
}

#[derive(Deserialize)]
#[serde(untagged)]
enum DecisionIn {
    Text(String),
    Record(Decision),
}

fn de_decisions<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Vec<Decision>, D::Error> {
    let raw: Vec<DecisionIn> = Vec::deserialize(d)?;
    Ok(raw
        .into_iter()
        .enumerate()
        .map(|(i, x)| match x {
            DecisionIn::Text(text) => Decision {
                id: i as u32 + 1,
                text,
                status: proposed(),
                note: String::new(),
            },
            DecisionIn::Record(mut r) => {
                if r.id == 0 {
                    r.id = i as u32 + 1;
                }
                r
            }
        })
        .collect())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct MeetingActions {
    #[serde(default, deserialize_with = "de_decisions")]
    pub decisions: Vec<Decision>,
    #[serde(default)]
    pub actions: Vec<ActionItem>,
    #[serde(default)]
    pub questions: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Draft {
    #[serde(default)]
    pub subject: Option<String>,
    pub body: String,
}

const EXTRACT_SYSTEM: &str = r#"You are za3tar's outcome extractor for Arabic-speaking teams.
From a meeting transcript (and optional notes), extract what was ACTUALLY agreed — not what could be.

LANGUAGE CONTRACT (most important rule):
- Mirror how the meeting was spoken. Arabic content in Arabic script.
- Keep English technical terms, product/company/people names, and numbers in
  Latin script (write "deploy", "Vercel", "447" — never transliterate).
- Transcript lines are labelled [me ...] (the user) and [them ...] (other
  participants). In-person recordings use [voice1 ...], [voice2 ...] instead —
  unidentified voices; work out who is who from names/roles revealed in the
  conversation (the Context may name the user). Use labels only for
  attribution; never print them.

OUTPUT: only valid JSON, no markdown fences, exactly this shape:
{
  "decisions": ["…"],
  "actions": [{"title": "…", "owner": "me" | "them" | "<Name>", "due_label": "…" | null, "due_date": "YYYY-MM-DD" | null, "detail": "…" | null}],
  "questions": ["…"]
}

RULES:
- decisions: things the meeting settled. actions: concrete commitments someone
  took. questions: raised but left open. Empty arrays are fine — never invent.
- title: short imperative, in the language it was spoken.
- owner: a name if the transcript reveals one, else "me"/"them" by who
  committed. For in-person [voiceN] transcripts, prefer real names; use "me"
  only when a voice is identifiable as the user; never output "voiceN".
- due_date only when the meeting implies one; resolve relative dates ("بكرا",
  "الأسبوع الجاي", "end of month") from the meeting date in Context.
- detail: one clarifying sentence, or null."#;

const WHATSAPP_SYSTEM: &str = r#"You are za3tar drafting the user's post-meeting WhatsApp follow-up to the other participant(s).

LANGUAGE CONTRACT: mirror the meeting's own language mix — Arabic in Arabic
script, English terms/names/numbers in Latin. Write as the user ("me" in the
transcript; for in-person [voiceN] transcripts, the user is named in Context),
in their natural voice.

SHAPE: a short WhatsApp message — one warm opening line recapping the meeting,
then a plain-line list of what was agreed and who's doing what (their items and
mine), then the immediate next step. WhatsApp formatting only: plain lines,
*bold* sparingly, at most one emoji. No markdown headers, no signature.

OUTPUT: only valid JSON, no fences: {"subject": null, "body": "…"}"#;

const EMAIL_SYSTEM: &str = r#"You are za3tar drafting the user's post-meeting recap email to the other participant(s).

LANGUAGE CONTRACT: mirror the meeting's own language mix — Arabic in Arabic
script, English terms/names/numbers in Latin. Write as the user ("me" in the
transcript; for in-person [voiceN] transcripts, the user is named in Context).
Slightly more formal than chat, still human.

SHAPE: short subject; body = 1–2 sentence recap, a bullet list of decisions,
a bullet list of action items with owners (and dates when known), one closing
line. No signature block.

OUTPUT: only valid JSON, no fences: {"subject": "…", "body": "…"}"#;

/// Pull the JSON object out of a model response — tolerates ```json fences or
/// stray prose around it by slicing from the first `{` to the last `}`.
fn extract_json(s: &str) -> &str {
    match (s.find('{'), s.rfind('}')) {
        (Some(a), Some(b)) if b > a => &s[a..=b],
        _ => s.trim(),
    }
}

fn actions_path(dir: &Path) -> PathBuf {
    dir.join("actions.json")
}

pub fn load(dir: &Path) -> Option<MeetingActions> {
    let json = std::fs::read_to_string(actions_path(dir)).ok()?;
    serde_json::from_str(&json).ok()
}

fn save(dir: &Path, actions: &MeetingActions) -> Result<(), String> {
    let json = serde_json::to_string_pretty(actions).map_err(|e| e.to_string())?;
    std::fs::write(actions_path(dir), json).map_err(|e| e.to_string())
}

fn build_context(dir: &Path, title: Option<&str>, today: Option<&str>) -> Result<String, String> {
    let segments = crate::asr::load_transcript(dir)?;
    let transcript = crate::asr::render(&segments);
    let notes = std::fs::read_to_string(dir.join("notes.md")).ok();

    let mut p = String::from("# Context\n");
    p.push_str(&format!(
        "Meeting: {}\n",
        title.unwrap_or("(untitled meeting)")
    ));
    if let Some(u) = anthropic::user_context_line() {
        p.push_str(&u);
    }
    if let Some(t) = today {
        p.push_str(&format!("Meeting date (today): {t}\n"));
    }
    if let Some(n) = notes {
        p.push_str("\n# Meeting notes (already written)\n");
        p.push_str(&n);
        p.push('\n');
    }
    p.push_str("\n# Transcript\n");
    p.push_str(&transcript);
    Ok(p)
}

/// Rung 2: transcript → structured outcomes, persisted as actions.json.
#[tauri::command]
pub async fn extract_actions(
    dir: String,
    title: Option<String>,
    today: Option<String>,
) -> Result<MeetingActions, String> {
    let path = PathBuf::from(&dir);
    let user = build_context(&path, title.as_deref(), today.as_deref())?;

    let (raw, _) = anthropic::complete(EXTRACT_SYSTEM, &user, 4096).await?;
    let mut parsed: MeetingActions =
        serde_json::from_str(extract_json(&raw)).map_err(|e| format!("parse actions: {e}"))?;

    // stable ids for done-state tracking; fresh extraction resets state
    for (i, a) in parsed.actions.iter_mut().enumerate() {
        a.id = i as u32 + 1;
        a.done = false;
    }
    for (i, d) in parsed.decisions.iter_mut().enumerate() {
        d.id = i as u32 + 1;
        d.status = proposed();
        d.note.clear();
    }
    save(&path, &parsed)?;
    Ok(parsed)
}

#[tauri::command]
pub fn load_actions(dir: String) -> Result<Option<MeetingActions>, String> {
    Ok(load(Path::new(&dir)))
}

#[tauri::command]
pub fn set_action_done(dir: String, id: u32, done: bool) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    let mut actions = load(&path).ok_or("no actions extracted yet")?;
    for a in actions.actions.iter_mut() {
        if a.id == id {
            a.done = done;
        }
    }
    save(&path, &actions)
}

/// A human moved a decision: proposed → confirmed, or → superseded (with why).
#[tauri::command]
pub fn set_decision_status(
    dir: String,
    id: u32,
    status: String,
    note: Option<String>,
) -> Result<(), String> {
    if !["proposed", "confirmed", "superseded"].contains(&status.as_str()) {
        return Err(format!("unknown decision status: {status}"));
    }
    let path = PathBuf::from(&dir);
    let mut actions = load(&path).ok_or("no actions extracted yet")?;
    let Some(d) = actions.decisions.iter_mut().find(|d| d.id == id) else {
        return Err("decision not found".into());
    };
    d.status = status;
    if let Some(n) = note {
        d.note = n.trim().to_string();
    }
    save(&path, &actions)
}

/// One decision somewhere in the library, with its meeting for context.
#[derive(Serialize, Clone)]
pub struct DecisionRef {
    pub dir: String,
    pub meeting_title: String,
    pub meeting_created: u64,
    pub person: String,
    pub workspace: String,
    pub decision: Decision,
}

/// Every decision across all recordings, newest meeting first — the ledger
/// of what's been settled, and what's still only proposed.
#[tauri::command]
pub fn list_decisions(app: tauri::AppHandle) -> Result<Vec<DecisionRef>, String> {
    let mut out = Vec::new();
    for rec in crate::library::list_recordings(app)? {
        let Some(acts) = load(Path::new(&rec.dir)) else {
            continue;
        };
        for d in acts.decisions {
            out.push(DecisionRef {
                dir: rec.dir.clone(),
                meeting_title: rec.title.clone(),
                meeting_created: rec.created,
                person: rec.person.clone(),
                workspace: rec.workspace.clone(),
                decision: d,
            });
        }
    }
    Ok(out)
}

/// Rung 3: draft the follow-up in the meeting's own language mix.
/// kind: "whatsapp" | "email"
#[tauri::command]
pub async fn draft_followup(
    dir: String,
    kind: String,
    title: Option<String>,
) -> Result<Draft, String> {
    let path = PathBuf::from(&dir);
    let mut user = build_context(&path, title.as_deref(), None)?;
    if let Some(actions) = load(&path) {
        user.push_str("\n# Extracted outcomes (JSON)\n");
        user.push_str(&serde_json::to_string(&actions).unwrap_or_default());
    }

    let system = match kind.as_str() {
        "whatsapp" => WHATSAPP_SYSTEM,
        "email" => EMAIL_SYSTEM,
        other => return Err(format!("unknown draft kind: {other}")),
    };
    let (raw, _) = anthropic::complete(system, &user, 2048).await?;
    let draft: Draft =
        serde_json::from_str(extract_json(&raw)).map_err(|e| format!("parse draft: {e}"))?;
    if draft.body.trim().is_empty() {
        return Err("empty draft".into());
    }
    Ok(draft)
}

/// Build an .ics for every not-done action that has a resolved date, write it
/// next to the recording, and open it (macOS hands it to Calendar).
#[tauri::command]
pub fn export_calendar(dir: String, title: Option<String>) -> Result<String, String> {
    let path = PathBuf::from(&dir);
    let actions = load(&path).ok_or("no actions extracted yet")?;
    let meeting = title.unwrap_or_else(|| "za3tar meeting".into());

    let dated: Vec<&ActionItem> = actions
        .actions
        .iter()
        .filter(|a| !a.done && a.due_date.as_deref().map(valid_ics_date).unwrap_or(false))
        .collect();
    if dated.is_empty() {
        return Err("no open action items with a date — nothing to put on the calendar".into());
    }

    let ics = build_ics(&meeting, &dated);
    let ics_path = path.join("actions.ics");
    std::fs::write(&ics_path, ics).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&ics_path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(ics_path.to_string_lossy().to_string())
}

fn valid_ics_date(d: &str) -> bool {
    let b = d.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && d.chars()
            .enumerate()
            .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// Escape per RFC 5545: backslash, comma, semicolon, newline.
fn ics_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(',', "\\,")
        .replace(';', "\\;")
        .replace('\n', "\\n")
}

fn build_ics(meeting: &str, actions: &[&ActionItem]) -> String {
    let mut out = String::from(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//za3tar//actions//EN\r\nCALSCALE:GREGORIAN\r\n",
    );
    for a in actions {
        let date = a.due_date.as_deref().unwrap_or_default().replace('-', "");
        let owner = if a.owner == "me" {
            String::new()
        } else {
            format!(" ({})", a.owner)
        };
        let mut desc = format!("from meeting: {meeting}");
        if let Some(d) = &a.detail {
            desc.push_str(&format!("\n{d}"));
        }
        out.push_str("BEGIN:VEVENT\r\n");
        out.push_str(&format!("UID:za3tar-{date}-{}@za3tar\r\n", a.id));
        out.push_str(&format!("DTSTART;VALUE=DATE:{date}\r\n"));
        out.push_str(&format!(
            "SUMMARY:{}\r\n",
            ics_escape(&format!("{}{owner}", a.title))
        ));
        out.push_str(&format!("DESCRIPTION:{}\r\n", ics_escape(&desc)));
        out.push_str("END:VEVENT\r\n");
    }
    out.push_str("END:VCALENDAR\r\n");
    out
}

/// One open action item somewhere in the library, with enough meeting context
/// to render and to chase.
#[derive(Serialize, Clone)]
pub struct OpenAction {
    pub dir: String,
    pub meeting_title: String,
    pub meeting_created: u64,
    pub person: String,
    pub workspace: String,
    pub action: ActionItem,
}

/// Follow-through: every not-done action item across all recordings, newest
/// meeting first. This is the view that makes za3tar working memory instead
/// of a per-meeting tool.
#[tauri::command]
pub fn list_open_actions(app: tauri::AppHandle) -> Result<Vec<OpenAction>, String> {
    let mut out = Vec::new();
    for rec in crate::library::list_recordings(app)? {
        let Some(acts) = load(Path::new(&rec.dir)) else {
            continue;
        };
        for a in acts.actions.into_iter().filter(|a| !a.done) {
            out.push(OpenAction {
                dir: rec.dir.clone(),
                meeting_title: rec.title.clone(),
                meeting_created: rec.created,
                person: rec.person.clone(),
                workspace: rec.workspace.clone(),
                action: a,
            });
        }
    }
    Ok(out)
}

const NUDGE_SYSTEM: &str = r#"You are za3tar drafting a short, warm WhatsApp nudge about ONE open action item from an earlier meeting.

LANGUAGE CONTRACT: mirror the meeting's own language mix — Arabic in Arabic
script, English terms/names/numbers in Latin. Write as the user ("me" in the
transcript; for in-person [voiceN] transcripts, the user is named in Context).

SHAPE: 1–3 lines. Friendly, zero passive aggression: a light check-in on the
item, referencing the meeting naturally ("من اجتماعنا يوم..."), and an easy
out ("إذا بدك إشي مني قلي"). If the item is owned by the user themselves,
instead draft a status update TO the other side about it. At most one emoji.

OUTPUT: only valid JSON, no fences: {"subject": null, "body": "…"}"#;

/// Chase one open action: a WhatsApp-ready nudge in the meeting's language.
#[tauri::command]
pub async fn draft_nudge(dir: String, id: u32, title: Option<String>) -> Result<Draft, String> {
    let path = PathBuf::from(&dir);
    let actions = load(&path).ok_or("no actions for this meeting")?;
    let item = actions
        .actions
        .iter()
        .find(|a| a.id == id)
        .ok_or("action not found")?;

    let mut user = build_context(&path, title.as_deref(), None)?;
    user.push_str("\n# The action item to nudge about (JSON)\n");
    user.push_str(&serde_json::to_string(item).unwrap_or_default());

    let (raw, _) = anthropic::complete(NUDGE_SYSTEM, &user, 1024).await?;
    let draft: Draft =
        serde_json::from_str(extract_json(&raw)).map_err(|e| format!("parse nudge: {e}"))?;
    if draft.body.trim().is_empty() {
        return Err("empty nudge".into());
    }
    Ok(draft)
}

/// Open a URL with the system handler. Only the schemes the execute rung needs.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let ok = ["https://", "mailto:", "whatsapp://"]
        .iter()
        .any(|p| url.starts_with(p));
    if !ok {
        return Err("unsupported url scheme".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg(&url)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("no app available for that link".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ics_escapes_and_shapes() {
        let a = ActionItem {
            id: 1,
            title: "send the budget, v2; final".into(),
            owner: "Sara".into(),
            due_label: Some("بكرا".into()),
            due_date: Some("2026-07-25".into()),
            detail: Some("line1\nline2".into()),
            done: false,
        };
        let ics = build_ics("kickoff", &[&a]);
        assert!(ics.contains("DTSTART;VALUE=DATE:20260725"));
        assert!(ics.contains("SUMMARY:send the budget\\, v2\\; final (Sara)"));
        assert!(ics.contains("DESCRIPTION:from meeting: kickoff\\nline1\\nline2"));
        assert!(ics.starts_with("BEGIN:VCALENDAR"));
        assert!(ics.trim_end().ends_with("END:VCALENDAR"));
    }

    #[test]
    fn decisions_read_old_strings_and_new_records() {
        let old = r#"{"decisions":["نستخدم Vercel"],"actions":[],"questions":[]}"#;
        let a: MeetingActions = serde_json::from_str(old).unwrap();
        assert_eq!(a.decisions[0].id, 1);
        assert_eq!(a.decisions[0].text, "نستخدم Vercel");
        assert_eq!(a.decisions[0].status, "proposed");
        let new = r#"{"decisions":[{"id":7,"text":"x","status":"confirmed"}]}"#;
        let b: MeetingActions = serde_json::from_str(new).unwrap();
        assert_eq!(b.decisions[0].id, 7);
        assert_eq!(b.decisions[0].status, "confirmed");
    }

    #[test]
    fn date_validation() {
        assert!(valid_ics_date("2026-07-25"));
        assert!(!valid_ics_date("25/07/2026"));
        assert!(!valid_ics_date("بكرا"));
        assert!(!valid_ics_date("2026-7-5"));
    }

    #[test]
    fn json_extraction() {
        assert_eq!(extract_json("```json\n{\"a\":1}\n```"), "{\"a\":1}");
        assert_eq!(extract_json("{\"a\":1}"), "{\"a\":1}");
        assert_eq!(
            extract_json("Here it is:\n{\"a\": {\"b\": 2}}\ndone"),
            "{\"a\": {\"b\": 2}}"
        );
    }
}
