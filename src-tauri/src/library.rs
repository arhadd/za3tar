// The recordings library. Every meeting is a directory under
// app_data_dir/recordings/<unix-seconds>/ holding mic.wav, system.wav, and —
// once processed — transcript.json and notes.md. Nothing in the app used to
// read these back, so past meetings were invisible. These commands list and
// reload them, and persist a small meta.json so a meeting can carry a title.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::asr::{load_transcript, Segment};

/// Sidecar written next to the audio so a recording remembers its title and
/// who the meeting was with — the link that builds the people directory.
#[derive(Serialize, Deserialize, Default)]
struct Meta {
    #[serde(default)]
    title: String,
    #[serde(default)]
    person: String,
}

/// One row in the library list.
#[derive(Serialize)]
pub struct RecordingSummary {
    pub dir: String,
    pub id: String,
    pub created: u64,
    pub title: String,
    pub person: String,
    pub has_transcript: bool,
    pub has_notes: bool,
    pub duration_secs: f64,
}

/// The full contents of one recording, for reopening it in the UI.
#[derive(Serialize)]
pub struct RecordingDetail {
    pub dir: String,
    pub title: String,
    pub person: String,
    pub segments: Vec<Segment>,
    pub notes: Option<String>,
}

fn recordings_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("recordings"))
}

fn read_meta(dir: &Path) -> Meta {
    std::fs::read_to_string(dir.join("meta.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Cheap duration estimate from a 16 kHz mono 16-bit WAV: bytes of PCM / 32000.
/// Uses the longer of the two tracks. Good enough for a list label.
fn duration_secs(dir: &Path) -> f64 {
    ["mic.wav", "system.wav"]
        .iter()
        .filter_map(|f| std::fs::metadata(dir.join(f)).ok())
        .map(|m| (m.len().saturating_sub(4096) as f64) / 32_000.0)
        .fold(0.0, f64::max)
}

#[tauri::command]
pub fn list_recordings(app: AppHandle) -> Result<Vec<RecordingSummary>, String> {
    let root = recordings_root(&app)?;
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&root) else {
        return Ok(out); // no recordings yet
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        // a recording is only worth listing once it has audio
        if !dir.join("mic.wav").exists() && !dir.join("system.wav").exists() {
            continue;
        }
        let id = dir
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let created = id.parse::<u64>().unwrap_or(0);
        let meta = read_meta(&dir);
        out.push(RecordingSummary {
            title: meta.title,
            person: meta.person,
            has_transcript: dir.join("transcript.json").exists(),
            has_notes: dir.join("notes.md").exists(),
            duration_secs: duration_secs(&dir),
            id,
            created,
            dir: dir.to_string_lossy().to_string(),
        });
    }
    // newest first
    out.sort_by_key(|e| std::cmp::Reverse(e.created));
    Ok(out)
}

#[tauri::command]
pub fn load_recording(dir: String) -> Result<RecordingDetail, String> {
    let path = PathBuf::from(&dir);
    let segments = load_transcript(&path).unwrap_or_default();
    let notes = std::fs::read_to_string(path.join("notes.md")).ok();
    let meta = read_meta(&path);
    Ok(RecordingDetail {
        title: meta.title,
        person: meta.person,
        segments,
        notes,
        dir,
    })
}

fn write_meta(path: &Path, meta: &Meta) -> Result<(), String> {
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    std::fs::write(path.join("meta.json"), json).map_err(|e| e.to_string())
}

/// Persist a recording's title (written by the UI after a meeting).
#[tauri::command]
pub fn set_recording_title(dir: String, title: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    let mut meta = read_meta(&path);
    meta.title = title;
    write_meta(&path, &meta)
}

/// Link a recording to a person — the edge that builds the directory.
#[tauri::command]
pub fn set_recording_person(dir: String, person: String) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    let mut meta = read_meta(&path);
    meta.person = person.trim().to_string();
    write_meta(&path, &meta)
}

/// Who a recording was with, for modules outside the library.
pub fn person_of(dir: &Path) -> String {
    read_meta(dir).person
}
