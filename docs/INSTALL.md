# Install and run za3tar

za3tar is currently an early macOS build for testers and contributors. There is not yet a public signed/notarized GitHub release.

## Requirements

- macOS 14.4 or later for call-side system-audio capture
- Node.js and npm
- Rust installed through [rustup](https://rustup.rs/)
- Xcode Command Line Tools
- ElevenLabs and Anthropic API keys for the live processing pipeline

## Run from source

```bash
git clone https://github.com/arhadd/za3tar.git
cd za3tar
npm install
npm run app
```

`npm run app` builds the native capture helper before launching the Tauri app. Use `npm run dev` only for frontend work in a browser; capture and Tauri IPC are unavailable there.

## First run

1. Open **Settings** and add your ElevenLabs and Anthropic keys plus your name.
2. Start a short test recording and allow microphone access.
3. For calls, allow **System Audio Recording** when macOS asks.
4. If call-side audio is silent, open **System Settings → Privacy & Security → Screen & System Audio Recording**, enable za3tar under **System Audio Recording Only**, and try again.

For local development, settings can fall back to environment variables:

```bash
cp .env.example .env
npm run app
```

## Optional agent bridge

za3tar works without an agent. To connect one, set an agent name and command in Settings, then implement the envelopes in [`AGENT-PROTOCOL.md`](AGENT-PROTOCOL.md). Agent features stay hidden when no command is configured.

## Before using real meetings

- Read [`PRIVACY.md`](PRIVACY.md).
- Get any consent required to record the conversation.
- Test the full pipeline with synthetic content first.
- Do not use production secrets or private recordings in bug reports.

## Current distribution status

Signing, notarization, packaging, and fresh-machine QA are still being hardened. Do not treat a local development build as a finished consumer release.
