// Notes generation via Claude. Takes the merged transcript (and any rough notes
// the user typed) and produces structured markdown notes. Input is understood
// in any mix of Arabic, Arabizi and English; the language the notes are
// written in is the user's setting (anthropic::with_language), and nothing in
// this prompt competes with it.

use crate::anthropic;

const SYSTEM_PROMPT: &str = r#"You are za3tar, an expert meeting-notes writer for teams that work in Arabic, English, or both.
You turn a meeting transcript into clear, structured notes.

WHO SAID WHAT:
- The transcript lines are labelled [me ...] (the user) and [them ...] (other
  participants). An in-person recording is labelled [voice1 ...], [voice2 ...]
  instead — the voices are unidentified, so work out who is who from names and
  roles revealed in the conversation (the Context may name the user). Use these
  labels ONLY to attribute who said what. NEVER print the raw labels or the
  bracket tags in the notes. Refer to the user by the name given in Context if
  present, otherwise in the first person. Refer to others by name if the
  transcript reveals it, otherwise as "the other side".
- Keep technical terms, product names, company names, people's names and
  numbers in Latin script. Never transliterate them.

FORMAT:
- Sections as H2 headings, in this order, written in the output language:
  ## Summary
  ## Decisions
  ## Actions
  ## Follow-ups
- Concise bullets under each. In Actions, start each bullet with the owner in
  bold if known (e.g. **Ala:** …). If a section has nothing, put a single "—".
- Output ONLY the markdown notes. No preamble, no explanation."#;

fn build_user_prompt(transcript: &str, rough_notes: Option<&str>, title: Option<&str>) -> String {
    let mut p = String::from("# Context\n");
    p.push_str(&format!(
        "Meeting: {}\n",
        title.unwrap_or("(untitled meeting)")
    ));
    if let Some(u) = anthropic::user_context_line() {
        p.push_str(&u);
    }
    if let Some(notes) = rough_notes {
        let notes = notes.trim();
        if !notes.is_empty() {
            p.push_str("\n# My rough notes (written during the meeting — treat as priorities)\n");
            p.push_str(notes);
            p.push('\n');
        }
    }
    p.push_str("\n# Transcript\n");
    p.push_str(transcript);
    p
}

pub async fn generate(
    transcript: &str,
    rough_notes: Option<&str>,
    title: Option<&str>,
) -> Result<String, String> {
    let user = build_user_prompt(transcript, rough_notes, title);
    // 8192-token headroom: 1500 truncated real notes mid-sentence.
    let (mut md, truncated) =
        anthropic::complete(&anthropic::with_language(SYSTEM_PROMPT), &user, 8192).await?;
    // If the model still hit the ceiling on an unusually long meeting, mark it
    // instead of handing back notes that look complete but stop mid-thought.
    if truncated {
        md.push_str("

---
_🫧 These notes hit the length limit and may be missing the end of the meeting. Check the transcript._");
    }
    Ok(md)
}

#[tauri::command]
pub async fn generate_notes(
    dir: String,
    rough_notes: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    let path = std::path::PathBuf::from(&dir);
    let segments = crate::asr::load_transcript(&path)?;
    let transcript = crate::asr::render(&segments);
    let md = generate(&transcript, rough_notes.as_deref(), title.as_deref()).await?;
    // persist next to the recording
    let _ = std::fs::write(path.join("notes.md"), &md);
    Ok(md)
}
