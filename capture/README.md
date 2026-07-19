# za3tar-capture

The native macOS capture helper. Records **system audio** (everyone else on the
call) and your **microphone** (you) as two separate 16 kHz mono WAV files — no
bot, no screen recording.

- **System audio**: a Core Audio process tap (`CATapDescription`, macOS 14.4+).
  This has its own audio-only permission — it does **not** trigger the
  screen-recording permission or the purple menu-bar indicator.
- **Mic**: `AVAudioEngine`.
- Two separate tracks so "me" vs "them" speaker attribution comes for free.

The heavy Core Audio code lives here in Swift (translated from Apple's AudioCap
sample). The Rust/Tauri side (`src-tauri/src/capture.rs`) just supervises the
process and streams its events to the UI.

## Build

```bash
npm run capture:build      # → src-tauri/binaries/za3tar-capture (signed)
```

`build.sh` embeds `Info.plist` (the TCC usage strings) and code-signs the binary.
It uses a Developer ID if one is installed, otherwise ad-hoc (fine for local
testing on the same machine).

## The one-time permission grant

The system-audio tap needs macOS's **System Audio Recording** permission. macOS
only shows the permission prompt for a **signed** binary running in a real app
context — it will *not* prompt in a headless/CI shell, and without the grant the
tap streams **pure silence** (the helper detects this and emits a
`permission_hint` event).

To grant it:

1. `npm run app` (builds the helper, launches the Tauri app).
2. Click **start recording** and, if asked, **Allow** microphone + system audio.
3. If system audio stays silent, open **System Settings › Privacy & Security ›
   Screen & System Audio Recording**, enable **za3tar** under "System Audio
   Recording Only", and record again.

Reset the grant while testing: `tccutil reset SystemAudioCaptureRequests`.

## Test the helper standalone

```bash
./spike-test.sh            # runs the helper, plays test audio, reports the WAVs
```

Emits one JSON event per line: `track_started`, `level` (with peak + callback
counts), `permission_hint`, `track_stopped` (with frame totals), `stopped`.

## Status (M1)

- ✅ Mic capture → WAV: proven working end-to-end.
- ✅ System tap: creates, clocks, and writes correctly; **streams silence until
  the System Audio Recording permission is granted** (see above). Verified via
  callback counts and frame totals; audible content pending the one-time grant.
