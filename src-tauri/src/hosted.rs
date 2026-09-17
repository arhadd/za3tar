// Hosted mode — Sign in with Za3tar. With an account token, every provider
// call goes through the Za3tar proxy (proxy/ in this repo) instead of the
// provider directly, so a person needs no keys of their own. Own keys in
// Settings still work; the token, when present, takes precedence.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

pub const DEFAULT_BASE: &str = "https://hooks.web0build.com/za3tar";

/// (base url, token) when signed in.
pub fn hosted() -> Option<(String, String)> {
    let token = std::env::var("ZA3TAR_TOKEN").ok()?.trim().to_string();
    if token.is_empty() {
        return None;
    }
    let base = std::env::var("ZA3TAR_BASE")
        .ok()
        .map(|b| b.trim().trim_end_matches('/').to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE.to_string());
    Some((base, token))
}

/// Turn a proxy error body into a sentence the app can show.
pub fn error_message(status: reqwest::StatusCode, body: &str) -> String {
    let msg = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v["error"].as_str().map(|s| s.to_string()));
    match (status.as_u16(), msg) {
        (401, _) => "your Za3tar sign-in is no longer valid — sign in again in Settings".into(),
        (402, Some(m)) => m,
        (_, Some(m)) => format!("Za3tar host: {m}"),
        (code, None) => format!("Za3tar host returned {code}"),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Account {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
pub struct Me {
    pub account: Account,
    pub caps: serde_json::Value,
    pub usage: serde_json::Value,
    pub month: String,
}

/// Redeem an invite code; on success the token is saved to Settings and
/// applied to the environment, so the next call is already hosted.
#[tauri::command]
pub async fn hosted_sign_in(
    app: AppHandle,
    code: String,
    name: String,
    base: Option<String>,
) -> Result<Account, String> {
    let base = base
        .map(|b| b.trim().trim_end_matches('/').to_string())
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| DEFAULT_BASE.to_string());
    let r = reqwest::Client::new()
        .post(format!("{base}/v1/auth/redeem"))
        .json(&serde_json::json!({ "code": code.trim(), "name": name.trim() }))
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Za3tar host unreachable: {e}"))?;
    let status = r.status();
    let body = r.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(error_message(status, &body));
    }
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let token = v["token"].as_str().ok_or("no token in reply")?.to_string();
    let acc = Account {
        id: v["account"]["id"].as_str().unwrap_or_default().to_string(),
        name: v["account"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
    };
    let mut st = crate::settings::get_settings(app.clone());
    st.za3tar_token = token;
    st.za3tar_base = if base == DEFAULT_BASE {
        String::new()
    } else {
        base
    };
    if st.user_name.trim().is_empty() {
        st.user_name = name.trim().to_string();
    }
    crate::settings::save_settings(app, st)?;
    Ok(acc)
}

#[tauri::command]
pub fn hosted_sign_out(app: AppHandle) -> Result<(), String> {
    let mut st = crate::settings::get_settings(app.clone());
    st.za3tar_token.clear();
    crate::settings::save_settings(app, st)?;
    std::env::remove_var("ZA3TAR_TOKEN");
    Ok(())
}

#[tauri::command]
pub async fn hosted_me() -> Result<Me, String> {
    let (base, token) = hosted().ok_or("not signed in")?;
    let r = reqwest::Client::new()
        .get(format!("{base}/v1/me"))
        .bearer_auth(token)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("Za3tar host unreachable: {e}"))?;
    let status = r.status();
    let body = r.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(error_message(status, &body));
    }
    serde_json::from_str(&body).map_err(|e| e.to_string())
}
