# Contributing to za3tar 🌿

Ahlan! Contributions are welcome — especially from people who live the
Arabic/English code-switching this app exists for.

## Setup

Prereqs: Node, Rust (rustup), Xcode Command Line Tools (macOS only — the
capture layer is Core Audio).

```bash
npm install
cp .env.example .env   # bring your own ElevenLabs + Anthropic keys
npm run tauri dev
```

`npm run dev` runs the frontend alone in a browser (no capture/IPC).

## What helps most

- **Dialect coverage** — transcripts or notes that come out wrong for your
  dialect (Levantine, Gulf, Egyptian, Maghrebi…). Open an issue with the
  audio situation described, never the audio of a real meeting.
- **A second ASR engine** — the adapter seam is in `src-tauri/src/asr.rs`.
- **Agent bridges** — implementations of `docs/AGENT-PROTOCOL.md` for other
  agent stacks. The protocol is the contract; transports are yours.
- Bug fixes with a repro.

## Ground rules

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`. Atomic commits,
  imperative messages that say why.
- Never commit `.env`, API keys, or recordings — `.gitignore` already blocks
  them; keep it that way.
- Keys live in the Rust core and are read from env/settings; they must never
  reach the webview.
- Rust: `cargo fmt` + `cargo clippy`. TS: `tsc` clean.
- Meeting audio and transcripts are private by design (local SQLite + files,
  no telemetry). Don't add network calls beyond the user's own configured
  APIs and agent command.

## License

Apache-2.0 — by contributing you agree your contributions are licensed the
same way.
