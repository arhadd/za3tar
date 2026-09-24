// Compose — make something. A workspace is not only a place that lists what
// you owe; it is a place where things get written. This is the one command
// behind that: an instruction plus whatever context the app hands over, out
// comes a draft the user edits, sends, or keeps as a note on a thread.

const COMPOSE_SYSTEM: &str = r#"You are Za3tar, writing something for the user — a message, a note, a brief, a summary, a plan, an agenda, whatever they asked for.

Rules:
- Write the thing itself. No preamble, no "here is", no sign-off unless the piece needs one.
- Use only what the CONTEXT and the instruction give you. If a fact is missing, leave a short [bracket] for the user to fill rather than inventing it.
- Match the form to the ask: a WhatsApp message is a few lines, a brief has headings, an agenda is a list. Keep it as short as the job allows.
- Plain, direct, warm. No corporate filler, no exclamation marks, no emoji unless the user asked for a message where one fits.
- Names, numbers, product and company names stay exactly as they appear in the context."#;

/// One piece of writing. `context` is whatever the app decided is relevant
/// (the workspace snapshot, a thread, a meeting's outcomes).
#[tauri::command]
pub async fn compose(
    instruction: String,
    context: Option<String>,
    previous: Option<String>,
) -> Result<String, String> {
    let instruction = instruction.trim();
    if instruction.is_empty() {
        return Err("say what to write".into());
    }
    let mut user = String::new();
    if let Some(c) = context.as_deref().map(str::trim).filter(|c| !c.is_empty()) {
        user.push_str("# CONTEXT\n");
        user.push_str(c);
        user.push_str("\n\n");
    }
    if let Some(p) = previous.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        user.push_str("# THE CURRENT DRAFT (revise this)\n");
        user.push_str(p);
        user.push_str("\n\n");
    }
    if let Some(u) = crate::anthropic::user_context_line() {
        user.push_str(&u);
    }
    user.push_str("# WHAT TO WRITE\n");
    user.push_str(instruction);

    let (text, _) = crate::anthropic::complete(
        &crate::anthropic::with_language(COMPOSE_SYSTEM),
        &user,
        2048,
    )
    .await?;
    Ok(text)
}
