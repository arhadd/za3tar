// Transcription via ElevenLabs Scribe. We transcribe the two tracks separately
// — mic.wav ("me") and system.wav ("them") — so speaker attribution is exact
// and needs no diarization: the track *is* the speaker. Words from both tracks
// are then merged by timestamp into one ordered transcript.
//
// ASR lives behind this module so a second engine can be added later without
// touching the rest of the app.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

const ELEVENLABS_URL: &str = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL: &str = "scribe_v2";

/// One speaker turn in the merged transcript.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Segment {
    pub speaker: String, // "me" | "them"
    pub start: f64,
    pub text: String,
}

/// Load a persisted transcript (written by `transcribe`) from a recording dir.
pub fn load_transcript(dir: &Path) -> Result<Vec<Segment>, String> {
    let path = dir.join("transcript.json");
    let json = std::fs::read_to_string(&path)
        .map_err(|_| "no transcript yet — transcribe first".to_string())?;
    serde_json::from_str(&json).map_err(|e| format!("parse transcript: {e}"))
}

#[derive(Deserialize)]
struct ElevenWord {
    text: String,
    #[serde(default)]
    start: Option<f64>,
    #[serde(rename = "type", default)]
    kind: Option<String>,
    #[serde(default)]
    speaker_id: Option<String>,
}

#[derive(Deserialize)]
struct ElevenResponse {
    #[serde(default)]
    language_code: Option<String>,
    #[serde(default)]
    text: String,
    #[serde(default)]
    words: Vec<ElevenWord>,
}

/// A single timed word tagged with its track (and, when diarization ran,
/// which voice on that track spoke it).
struct TaggedWord {
    speaker: String,
    start: f64,
    text: String,
    diarized_id: Option<String>,
}

fn read_key() -> Result<String, String> {
    std::env::var("ELEVENLABS_API_KEY")
        .map_err(|_| "ELEVENLABS_API_KEY not set (add it to .env)".to_string())
}

async fn transcribe_track(
    client: &reqwest::Client,
    api_key: &str,
    path: &Path,
    speaker: &str,
    diarize: bool,
) -> Result<Vec<TaggedWord>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read {path:?}: {e}"))?;
    // an essentially-empty file (e.g. a silent/failed track) → no words, not an error
    if bytes.len() < 1024 {
        return Ok(vec![]);
    }

    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .text("model_id", MODEL)
        .part("file", part);
    if diarize {
        form = form.text("diarize", "true");
    }

    let resp = client
        .post(ELEVENLABS_URL)
        .header("xi-api-key", api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("elevenlabs request failed: {e}"))?;

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("elevenlabs {status}: {}", truncate(&body, 300)));
    }

    let parsed: ElevenResponse =
        serde_json::from_str(&body).map_err(|e| format!("parse elevenlabs response: {e}"))?;

    // prefer word-level timings; fall back to a single segment if absent
    let mut out = Vec::new();
    if parsed.words.is_empty() {
        if !parsed.text.trim().is_empty() {
            out.push(TaggedWord {
                speaker: speaker.to_string(),
                start: 0.0,
                text: parsed.text.trim().to_string(),
                diarized_id: None,
            });
        }
    } else {
        for w in parsed.words {
            if w.kind.as_deref() == Some("spacing") {
                continue;
            }
            let t = w.text.trim();
            if t.is_empty() {
                continue;
            }
            out.push(TaggedWord {
                speaker: speaker.to_string(),
                start: w.start.unwrap_or(0.0),
                text: t.to_string(),
                diarized_id: w.speaker_id.clone(),
            });
        }
    }
    let _ = parsed.language_code; // detected language available if we want it later
    Ok(out)
}

/// Coalesce time-sorted tagged words into speaker turns.
fn coalesce(mut words: Vec<TaggedWord>) -> Vec<Segment> {
    words.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    let mut segments: Vec<Segment> = Vec::new();
    for w in words {
        if let Some(last) = segments.last_mut() {
            if last.speaker == w.speaker {
                last.text.push(' ');
                last.text.push_str(&w.text);
                continue;
            }
        }
        segments.push(Segment {
            speaker: w.speaker,
            start: w.start,
            text: w.text,
        });
    }
    segments
}

/// In-person mode: the meeting happened in one room, so every voice is on the
/// mic track and the me/them split can't come from the tracks. When the system
/// track is silent and diarization found several voices on the mic, relabel
/// them "voice1", "voice2", … by how much they spoke. Deliberately NOT
/// "me"/"them" — word count can't tell which voice is the laptop's owner, so
/// the labels stay neutral and the notes/actions models attribute people by
/// the names and roles revealed in the conversation. A voice needs a few words
/// to count — one-word blips are usually crosstalk, not a person.
fn relabel_in_person(words: &mut [TaggedWord]) {
    use std::collections::HashMap;
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for w in words.iter() {
        if let Some(id) = w.diarized_id.as_deref() {
            *counts.entry(id).or_default() += 1;
        }
    }
    let mut ranked: Vec<(&str, usize)> = counts.into_iter().filter(|(_, n)| *n >= 3).collect();
    if ranked.len() < 2 {
        return; // one real voice — the existing "me" labels are already right
    }
    ranked.sort_by(|a, b| b.1.cmp(&a.1));

    let mut label: HashMap<String, String> = HashMap::new();
    for (rank, (id, _)) in ranked.iter().enumerate() {
        label.insert(id.to_string(), format!("voice{}", rank + 1));
    }
    for w in words.iter_mut() {
        if let Some(id) = w.diarized_id.as_deref() {
            if let Some(name) = label.get(id) {
                w.speaker = name.clone();
            }
            // below-threshold voices keep the track label ("me")
        }
    }
}

/// Transcribe both tracks in a recording directory and return a merged transcript.
pub async fn transcribe_dir(dir: &Path) -> Result<Vec<Segment>, String> {
    let api_key = read_key()?;
    let client = reqwest::Client::new();

    let mic = dir.join("mic.wav");
    let system = dir.join("system.wav");

    // Transcribe both tracks concurrently — they're independent uploads, so
    // there's no reason to pay for one round-trip then the other. The mic track
    // is diarized because in an in-person meeting it carries every voice.
    let mic_fut = async {
        if mic.exists() {
            transcribe_track(&client, &api_key, &mic, "me", true).await
        } else {
            Ok(vec![])
        }
    };
    let system_fut = async {
        if system.exists() {
            transcribe_track(&client, &api_key, &system, "them", false).await
        } else {
            Ok(vec![])
        }
    };
    let (mic_words, system_words) = tokio::join!(mic_fut, system_fut);

    let mut mic_words = mic_words?;
    let system_words = system_words?;

    // Call mode (voices on the system track) → the track *is* the speaker and
    // mic diarization is ignored. Silent system track → in-person mode.
    if system_words.is_empty() {
        relabel_in_person(&mut mic_words);
    }

    let mut all = Vec::new();
    all.extend(mic_words);
    all.extend(system_words);
    if all.is_empty() {
        return Err("no speech found in either track".into());
    }
    Ok(coalesce(all))
}

/// Render a transcript as plain lines for the notes model / display.
pub fn render(segments: &[Segment]) -> String {
    segments
        .iter()
        .map(|s| format!("[{} {}] {}", s.speaker, fmt_ts(s.start), s.text))
        .collect::<Vec<_>>()
        .join("\n")
}

fn fmt_ts(sec: f64) -> String {
    let s = sec as u64;
    format!("{:02}:{:02}", s / 60, s % 60)
}

/// Char-boundary-safe truncation. Slicing bytes (`&s[..n]`) panics when `n`
/// lands inside a multi-byte codepoint — and API error bodies are often Arabic.
fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let head: String = s.chars().take(n).collect();
        format!("{head}…")
    }
}

#[tauri::command]
pub async fn transcribe(dir: String) -> Result<Vec<Segment>, String> {
    let path = PathBuf::from(dir);
    let segments = transcribe_dir(&path).await?;
    // persist alongside the audio
    if let Ok(json) = serde_json::to_string_pretty(&segments) {
        let _ = std::fs::write(path.join("transcript.json"), json);
    }
    Ok(segments)
}
