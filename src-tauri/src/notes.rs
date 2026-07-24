// Notes generation via Claude. Takes the merged transcript (and any rough notes
// the user typed) and produces structured markdown notes that mirror how the
// meeting was actually spoken — Arabic in Arabic script, English terms/names/
// numbers left in Latin. This code-switching output contract is the thing no
// global notetaker does.

use serde::Deserialize;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-5";

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
  participants). Use these ONLY to attribute who said what. NEVER print the raw
  labels "me"/"them" or the bracket tags in the notes. Refer to the user by the
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

#[derive(Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<ContentBlock>,
    #[serde(default)]
    stop_reason: Option<String>,
    #[serde(default)]
    error: Option<AnthropicError>,
}

#[derive(Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

#[derive(Deserialize)]
struct AnthropicError {
    message: String,
}

fn read_key() -> Result<String, String> {
    std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY not set (add it to .env)".to_string())
}

fn build_user_prompt(transcript: &str, rough_notes: Option<&str>, title: Option<&str>) -> String {
    let mut p = String::from("# Context\n");
    p.push_str(&format!(
        "Meeting: {}\n",
        title.unwrap_or("(untitled meeting)")
    ));
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
    let api_key = read_key()?;
    let user = build_user_prompt(transcript, rough_notes, title);

    let body = serde_json::json!({
        // Headroom for long meetings: 1500 truncated real notes mid-sentence.
        // Meeting notes almost never exceed this; if a meeting ever does, we
        // surface it below rather than silently cutting off.
        "model": MODEL,
        "max_tokens": 8192,
        "system": SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": user }],
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(ANTHROPIC_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let parsed: AnthropicResponse =
        serde_json::from_str(&text).map_err(|e| format!("parse anthropic response: {e}"))?;

    if let Some(err) = parsed.error {
        return Err(format!("anthropic error: {}", err.message));
    }
    if !status.is_success() {
        return Err(format!("anthropic {status}"));
    }

    let truncated = parsed.stop_reason.as_deref() == Some("max_tokens");
    let mut md = parsed
        .content
        .into_iter()
        .filter(|b| b.kind == "text")
        .map(|b| b.text)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if md.is_empty() {
        return Err("empty response from notes model".into());
    }
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
