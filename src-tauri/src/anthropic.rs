// Shared Claude client. notes.rs and actions.rs both talk to the same API with
// the same error handling; the only things that vary are the prompts, an
// optional assistant prefill (used to force JSON output), and the token budget.

use serde::Deserialize;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-5";

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

/// Optional user identity (ZA3TAR_USER in .env). Injected into prompt context
/// so the models can attribute "me" correctly — essential for in-person
/// [voiceN] transcripts where no track identifies the app's owner.
pub fn user_context_line() -> Option<String> {
    std::env::var("ZA3TAR_USER")
        .ok()
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .map(|n| format!("The app user (\"me\") is: {n}\n"))
}

/// One completion. Returns (text, truncated).
pub async fn complete(system: &str, user: &str, max_tokens: u32) -> Result<(String, bool), String> {
    let body = serde_json::json!({
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
    });

    let client = reqwest::Client::new();
    // signed in with Za3tar → through the proxy; otherwise your own key
    let req = if let Some((base, token)) = crate::hosted::hosted() {
        client
            .post(format!("{base}/v1/anthropic/messages"))
            .bearer_auth(token)
            .header("content-type", "application/json")
    } else {
        client
            .post(ANTHROPIC_URL)
            .header("x-api-key", read_key()?)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
    };
    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("anthropic request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if crate::hosted::hosted().is_some() && !status.is_success() {
        return Err(crate::hosted::error_message(status, &text));
    }
    let parsed: AnthropicResponse =
        serde_json::from_str(&text).map_err(|e| format!("parse anthropic response: {e}"))?;

    if let Some(err) = parsed.error {
        return Err(format!("anthropic error: {}", err.message));
    }
    if !status.is_success() {
        return Err(format!("anthropic {status}"));
    }

    let truncated = parsed.stop_reason.as_deref() == Some("max_tokens");
    let full = parsed
        .content
        .into_iter()
        .filter(|b| b.kind == "text")
        .map(|b| b.text)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();

    if full.is_empty() {
        return Err("empty response from model".into());
    }
    Ok((full, truncated))
}

/// The language Za3tar writes in. ZA3TAR_LANGUAGE (Settings) is
/// "english" (default), "match" (mirror the conversation's own mix) or
/// "arabic". Input is always understood in any mix; this only shapes output.
pub fn language() -> String {
    match std::env::var("ZA3TAR_LANGUAGE")
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .as_str()
    {
        "match" | "mirror" => "match".into(),
        "arabic" | "ar" => "arabic".into(),
        _ => "english".into(),
    }
}

/// Append the output-language rule to a system prompt. It overrides any
/// language contract written into the prompt itself.
pub fn with_language(system: &str) -> String {
    let rule = match language().as_str() {
        "match" => "OUTPUT LANGUAGE (overrides any language rule above): mirror how the conversation was actually spoken — Arabic content in Arabic script, English content in English, mixed stays mixed. Keep technical terms, product/company/people names and numbers in Latin script; never transliterate them.",
        "arabic" => "OUTPUT LANGUAGE (overrides any language rule above): write in Arabic (Levantine register is fine), but keep technical terms, product/company/people names and numbers in Latin script; never transliterate them.",
        _ => "OUTPUT LANGUAGE (overrides any language rule above): write in plain English. You understand Arabic, Arabizi and mixed input fully; render what was said in English, keep names as the person wrote or said them, and keep a short Arabic phrase verbatim only when translating it would lose the meaning (quote it, then say what it means).",
    };
    format!("{system}\n\n{rule}")
}
