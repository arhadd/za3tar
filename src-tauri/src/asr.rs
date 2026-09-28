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

/// What actually goes over the wire for one track.
struct Upload {
    bytes: Vec<u8>,
    file_name: &'static str,
    mime: &'static str,
}

/// Get a track ready to send: repair its WAV header, skip it if it holds no
/// sound, and compress it to AAC. Raw 16 kHz WAV is ~115 MB an hour per track,
/// and two of those uploading at once is what dropped mid-send on long
/// meetings; AAC at 32 kbps is ~8x smaller and Scribe reads it the same.
/// Falls back to the WAV if afconvert isn't there or fails.
async fn prepare_upload(path: &Path) -> Result<Option<Upload>, String> {
    let _ = repair_wav_header(path);
    let wav = std::fs::read(path).map_err(|e| format!("read {path:?}: {e}"))?;
    let data_start = wav_data_offset(&wav).unwrap_or(44.min(wav.len()));
    if wav.len() < 1024 || wav[data_start..].iter().all(|&b| b == 0) {
        return Ok(None);
    }

    let m4a = path.with_extension("upload.m4a");
    let converted = tokio::process::Command::new("/usr/bin/afconvert")
        .args(["-f", "m4af", "-d", "aac", "-b", "32000"])
        .arg(path)
        .arg(&m4a)
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false);
    let compressed = if converted {
        std::fs::read(&m4a).ok()
    } else {
        None
    };
    let _ = std::fs::remove_file(&m4a);

    Ok(Some(match compressed {
        Some(bytes) if bytes.len() > 1024 => Upload {
            bytes,
            file_name: "audio.m4a",
            mime: "audio/mp4",
        },
        _ => Upload {
            bytes: wav,
            file_name: "audio.wav",
            mime: "audio/wav",
        },
    }))
}

/// Byte offset where the `data` chunk's samples begin, walking the chunks
/// (AVAudioFile puts a ~4 KB padding chunk before `data`, so it isn't 44).
fn wav_data_offset(wav: &[u8]) -> Option<usize> {
    let mut off = 12;
    while off + 8 <= wav.len() {
        let size = u32::from_le_bytes(wav[off + 4..off + 8].try_into().ok()?) as usize;
        if &wav[off..off + 4] == b"data" {
            return Some(off + 8);
        }
        off += 8 + size + (size & 1);
    }
    None
}

/// Rewrite the RIFF and data sizes from the real file length. The capture
/// helper does this on a clean stop, but if it dies mid-recording (e.g. the
/// mic device changes) the header still claims ~0 bytes of audio, and
/// afconvert would then produce an empty file.
fn repair_wav_header(path: &Path) -> std::io::Result<()> {
    use std::io::{Read, Seek, SeekFrom, Write};
    let mut f = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)?;
    let len = f.metadata()?.len();
    let mut head = vec![0u8; len.min(64 * 1024) as usize];
    f.read_exact(&mut head)?;
    if len < 12 || &head[0..4] != b"RIFF" || &head[8..12] != b"WAVE" {
        return Ok(());
    }
    let Some(data_start) = wav_data_offset(&head) else {
        return Ok(());
    };
    let data_len = (len - data_start as u64) as u32;
    f.seek(SeekFrom::Start(data_start as u64 - 4))?;
    f.write_all(&data_len.to_le_bytes())?;
    f.seek(SeekFrom::Start(4))?;
    f.write_all(&((len - 8) as u32).to_le_bytes())?;
    Ok(())
}

/// reqwest's Display stops at "error sending request for url"; the cause
/// (timeout, reset, DNS, TLS) is in the source chain.
fn error_chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        out.push_str(": ");
        out.push_str(&s.to_string());
        src = s.source();
    }
    out
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
    let Some(upload) = prepare_upload(path).await? else {
        // empty or all-zero track (e.g. nothing played through the speakers) → no words
        return Ok(vec![]);
    };

    // One retry on a transport failure: a long upload can drop mid-send on a
    // flaky connection, and the recording is still on disk to resend.
    let mut attempt = 0;
    let resp = loop {
        attempt += 1;
        let part = reqwest::multipart::Part::bytes(upload.bytes.clone())
            .file_name(upload.file_name)
            .mime_str(upload.mime)
            .map_err(|e| e.to_string())?;
        let mut form = reqwest::multipart::Form::new()
            .text("model_id", MODEL)
            .part("file", part);
        if diarize {
            form = form.text("diarize", "true");
        }

        let req = if let Some((base, token)) = crate::hosted::hosted() {
            client
                .post(format!("{base}/v1/elevenlabs/speech-to-text"))
                .bearer_auth(token)
        } else {
            client.post(ELEVENLABS_URL).header("xi-api-key", api_key)
        };
        match req.multipart(form).send().await {
            Ok(resp) => break resp,
            Err(e) if attempt < 2 => {
                eprintln!("[asr] {speaker} upload failed, retrying: {}", error_chain(&e));
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            }
            Err(e) => {
                return Err(format!(
                    "elevenlabs request failed ({speaker} track, {:.1} MB): {} — the recording is saved; transcribe again once the connection is steady",
                    upload.bytes.len() as f64 / 1_000_000.0,
                    error_chain(&e)
                ))
            }
        }
    };

    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        if crate::hosted::hosted().is_some() {
            return Err(crate::hosted::error_message(status, &body));
        }
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
    words.sort_by(|a, b| {
        a.start
            .partial_cmp(&b.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
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
    ranked.sort_by_key(|r| std::cmp::Reverse(r.1));

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
    // signed in with Za3tar → the proxy holds the key
    let api_key = if crate::hosted::hosted().is_some() {
        String::new()
    } else {
        read_key()?
    };
    // No timeout used to mean a stalled upload hung forever; the overall limit
    // is generous because Scribe on an hour of audio takes a while to answer.
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(15 * 60))
        .build()
        .map_err(|e| e.to_string())?;

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

#[cfg(test)]
mod tests {
    use super::*;

    /// RIFF/WAVE with a FLLR padding chunk (like AVAudioFile) and a data chunk
    /// whose declared size is stale, followed by `samples`.
    fn wav_with_stale_header(samples: &[u8]) -> Vec<u8> {
        let mut w = Vec::new();
        w.extend_from_slice(b"RIFF");
        w.extend_from_slice(&4088u32.to_le_bytes());
        w.extend_from_slice(b"WAVE");
        w.extend_from_slice(b"FLLR");
        w.extend_from_slice(&6u32.to_le_bytes());
        w.extend_from_slice(&[0; 6]);
        w.extend_from_slice(b"data");
        w.extend_from_slice(&0u32.to_le_bytes());
        w.extend_from_slice(samples);
        w
    }

    #[test]
    fn finds_data_after_padding_chunk() {
        let w = wav_with_stale_header(&[1, 2, 3, 4]);
        assert_eq!(wav_data_offset(&w), Some(34));
    }

    #[test]
    fn repairs_stale_sizes_from_file_length() {
        let dir = std::env::temp_dir().join(format!("za3tar-asr-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("mic.wav");
        std::fs::write(&p, wav_with_stale_header(&[7; 2000])).unwrap();

        repair_wav_header(&p).unwrap();
        let w = std::fs::read(&p).unwrap();
        assert_eq!(
            u32::from_le_bytes(w[4..8].try_into().unwrap()),
            w.len() as u32 - 8
        );
        assert_eq!(u32::from_le_bytes(w[30..34].try_into().unwrap()), 2000);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[tokio::test]
    async fn all_zero_track_is_skipped() {
        let dir = std::env::temp_dir().join(format!("za3tar-asr-z-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("system.wav");
        std::fs::write(&p, wav_with_stale_header(&[0; 4000])).unwrap();

        assert!(prepare_upload(&p).await.unwrap().is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
