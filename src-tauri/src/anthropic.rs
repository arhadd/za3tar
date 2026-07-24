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
pub async fn complete(
    system: &str,
    user: &str,
    max_tokens: u32,
) -> Result<(String, bool), String> {
    let api_key = read_key()?;

    let body = serde_json::json!({
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
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
