// Notes generation via Claude. Takes the merged transcript (and any rough notes
// the user typed) and produces structured markdown notes that mirror how the
// meeting was actually spoken — Arabic in Arabic script, English terms/names/
// numbers left in Latin. This code-switching output contract is the thing no
// global notetaker does.

use crate::anthropic;

const SYSTEM_PROMPT: &str = r#"You are za3tar, an expert meeting-notes writer for Arabic-speaking teams.
You turn a meeting transcript into clear, structured notes.

LANGUAGE CONTRACT (most important rule):
- Mirror how the meeting was actually spoken. Write Arabic content in Arabic script.
- Keep English technical terms, product names, company names, people's names, and
  numbers in Latin script. Do NOT transliterate them into Arabic (write "Vercel",
  "deploy", "budget", "447" — not فيرسيل, ديبلوي, بدجت).
- Do not translate to English and do not switch everything to formal Arabic.
  Preserve the code-switching exactly as a bilingual colleague would write it.
- The transcript lines are labelled [me ...] (the user) and [them ...] (other
  participants). An in-person recording is labelled [voice1 ...], [voice2 ...]
  instead — the voices are unidentified, so work out who is who from names and
  roles revealed in the conversation (the Context may name the user). Use these
  labels ONLY to attribute who said what. NEVER print the raw labels or the
  bracket tags in the notes. Refer to the user by the
  name given in Context if present, otherwise in the first person (أنا). Refer to
  others by name if the transcript reveals it, otherwise as "الطرف الآخر".

FORMAT:
- Sections as H2 headings, in this order:
  ## الملخص
  ## القرارات
  ## المهام
  ## نقاط للمتابعة
- Concise bullets under each. In المهام, start each bullet with the owner in bold
  if known (e.g. **Ala:** …). If a section has nothing, put a single "—".
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
        md.push_str("\n\n---\n_🫧 هالملخص طويل ووصل للحد الأقصى — ممكن يكون ناقص من الآخر._");
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
