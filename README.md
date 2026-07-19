# za3tar 🌿

**the arabeezy granola alternative** — a Mac meeting notetaker that actually
understands how people in the region talk.

Records your meetings without a bot (system audio + mic, captured locally),
transcribes dialectal Arabic with Arabic/English code-switching, and writes
clean AI notes that mirror how the meeting actually sounded — Arabic in Arabic
script, English tech terms and names left in Latin.

Granola has the form factor but no Arabic. The Arabic tools are bots in your
calls. za3tar is the pairing: no-bot native Mac app × dialectal Arabic.

## Status

Early build. Milestones:

- **M0 — scaffold** ✅ Tauri v2 + React + TS + Tailwind
- **M1 — capture** 🚧 system-audio tap + mic → two 16 kHz WAVs (no bot). Mic
  proven; system tap streams and writes, pending a one-time macOS permission
  grant (see [capture/README.md](capture/README.md))
- **M2 — ASR** pluggable transcribers (ElevenLabs Scribe v2 · Speechmatics
  bilingual · Gemini) + a bake-off to pick the best on real audio
- **M3 — notes** Claude-generated notes with a code-switching output contract
- **M4 — the app** record → transcript → notes → copy
- **M5 — dogfood** real meetings, signed build

## Stack

- **Shell**: Tauri v2 (Rust core, React/TS/Vite/Tailwind UI)
- **Capture**: Core Audio process taps (audio-only permission — no
  screen-recording prompt), mic + system audio as separate tracks
- **ASR**: API-first, pluggable behind one adapter
- **Notes**: Claude API
- **Storage**: local SQLite + audio files on disk. No accounts, no cloud sync,
  no telemetry.

## Develop

Prereqs: Node, Rust (via rustup), Xcode Command Line Tools.

```bash
npm install
cp .env.example .env   # add API keys as adapters land
npm run tauri dev      # runs the app
npm run dev            # frontend only, in a browser
```

## License

Private / unreleased.
