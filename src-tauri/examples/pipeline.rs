// End-to-end test of the transcription → notes pipeline against the live APIs,
// without needing the app UI or the mic/system permissions.
//
//   cargo run --example pipeline -- <dir-with-mic.wav-and-system.wav>
//
// Requires ELEVENLABS_API_KEY and ANTHROPIC_API_KEY in the environment (.env).

use std::path::PathBuf;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let dir = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .expect("usage: pipeline <dir>");

    println!("== transcribing tracks in {dir:?} ==");
    let segments = match za3tar_lib::asr::transcribe_dir(&dir).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("transcribe failed: {e}");
            std::process::exit(1);
        }
    };
    let transcript = za3tar_lib::asr::render(&segments);
    println!("{transcript}\n");

    println!("== generating notes ==");
    match za3tar_lib::notes::generate(&transcript, None, Some("za3tar pipeline test")).await {
        Ok(md) => println!("{md}"),
        Err(e) => {
            eprintln!("notes failed: {e}");
            std::process::exit(1);
        }
    }
}
