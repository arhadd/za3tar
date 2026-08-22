# za3tar 🌿

**The meeting is not done when the notes arrive.**

za3tar is a private-by-default Mac meeting workspace for Arabic and English teams. It records without putting a bot in the call, preserves natural Arabic/English code-switching, turns the conversation into decisions and owned actions, and helps you carry the follow-through forward—locally or through an optional compatible agent.

> **record → understand → follow through**

Most meeting tools stop at a transcript or summary. za3tar keeps going: draft the WhatsApp recap in the meeting's own language mix, add dated actions to Calendar, track open commitments across meetings, and optionally hand the whole packet to an always-on agent.

## Why za3tar

- **Built for how the region actually speaks.** Arabic stays in Arabic script; English names and technical terms stay natural instead of being awkwardly translated or transliterated.
- **No meeting bot.** A native Mac app captures your mic and system audio locally, so no extra participant joins the call.
- **Outcomes, not just notes.** Every meeting becomes decisions, action items with owners and dates, and open questions.
- **Follow-through in context.** Draft WhatsApp and email follow-ups, export actions to Calendar, see what is overdue, and nudge the right person.
- **Agent-ready, not agent-locked.** Connect any assistant that can speak za3tar's open, versioned protocol—or use the app fully standalone.
- **Local-first storage, explicit data flow.** za3tar has no account, first-party cloud, or telemetry. App data stays on your Mac; processing sends audio and transcript context to the AI providers you configure, and only an explicit bridge action sends a packet to your agent.

## What it does

### 1. Capture the conversation

za3tar records calls as separate **me / them** tracks using the microphone and macOS system-audio capture. Call-side audio requires macOS 14.4+ and a one-time System Audio Recording grant. In-person meetings use one echo-cancelled mic track and best-effort speaker diarization.

### 2. Understand the way you spoke

ElevenLabs Scribe transcribes the recording. Claude turns it into structured notes while preserving dialect, Arabic/English code-switching, names, and technical vocabulary.

### 3. Extract what came out of it

za3tar identifies:

- decisions
- action items, owners, and resolved dates
- open questions

It does not invent commitments when none were made.

### 4. Move the work forward

From the meeting, you can:

- draft an editable WhatsApp follow-up or recap email in the same language mix
- open the draft in WhatsApp or Mail—nothing sends without your action
- export dated actions to Calendar
- mark items done and review open follow-ups across every meeting
- build a lightweight people view: meetings, contact details, and what is still open with each person

### 5. Hand it to your agent (optional)

Connect a compatible agent through a command-line bridge. za3tar sends a versioned meeting packet; what happens next depends on that agent's tools and policies. It may create calendar events, track follow-ups, deliver messages, and sync real-world status back into the app.

The bridge is transport-agnostic and documented in [`docs/AGENT-PROTOCOL.md`](docs/AGENT-PROTOCOL.md). With no agent configured, agent-only controls stay hidden and the rest of za3tar works normally.

## The product loop

```text
meeting
  ↓
local no-bot capture
  ↓
dialect-aware transcript + structured notes
  ↓
decisions · owners · dates · open questions
  ↓
WhatsApp / email · Calendar · follow-up tracker
  ↓ optional
any connected agent
```

## Current status

za3tar is an **early macOS build** for testing and contribution, not a finished consumer release.

Working today:

- native Tauri app with local mic and system-audio capture
- separate call tracks plus in-person diarization
- Arabic/English transcription and structured AI notes
- decisions, actions, owners, dates, and open questions
- editable WhatsApp/email drafts and `.ics` Calendar export
- meeting library, people view, and cross-meeting follow-up tracking
- in-app API-key, identity, and agent settings
- open agent bridge with schedule and follow-up status sync

Still being hardened:

- macOS permission and first-run experience across fresh machines (system audio requires macOS 14.4+)
- signing, packaging, and distribution
- broader dialect, device, and long-meeting testing

See [`DEMO.md`](DEMO.md) for the three-minute product walkthrough,
[`docs/LAUNCH-VIDEO.md`](docs/LAUNCH-VIDEO.md) for the agent-made launch demo,
[`docs/RELEASE.md`](docs/RELEASE.md) for the v0.1.0 gate,
[`docs/INSTALL.md`](docs/INSTALL.md) for setup, and
[`docs/PRIVACY.md`](docs/PRIVACY.md) for the full data flow.

## Privacy and data flow

Audio, transcripts, notes, contacts, and follow-up state are stored locally on your Mac. za3tar has no account system, first-party cloud, telemetry, or built-in cloud sync. Processing is not offline: the providers you configure receive data as described below.

Configured services receive only what their step requires:

- **ElevenLabs** receives audio for transcription.
- **Anthropic** receives transcript text for notes and action extraction.
- **Your agent command**, if enabled and explicitly used, receives the structured meeting packet described in the protocol.

## Develop locally

### Prerequisites

- macOS
- Node.js and npm
- Rust via [rustup](https://rustup.rs/)
- Xcode Command Line Tools
- ElevenLabs and Anthropic API keys for the live pipeline

### Run

```bash
git clone https://github.com/arhadd/za3tar.git
cd za3tar
npm install
npm run app
```

You can enter API keys and your name in **Settings**. For local development, `.env` remains available as a fallback:

```bash
cp .env.example .env
npm run tauri dev
```

Frontend only:

```bash
npm run dev
```

## Stack

- **Desktop shell:** Tauri v2, Rust, React, TypeScript, Vite, Tailwind CSS
- **Capture:** Core Audio process taps; mic and system audio as separate tracks
- **Transcription:** ElevenLabs Scribe v2 behind a pluggable ASR adapter
- **Notes and actions:** Anthropic Claude API
- **Storage:** local SQLite and audio files
- **Agent integration:** command-line transport with versioned JSON envelopes

## Contributing

Contributions are welcome—especially dialect coverage, transcription and attribution fixes, ASR adapters, agent bridges, and reproducible capture bugs. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).

Never attach real meeting audio or transcripts to a public issue.

## License

za3tar uses a deliberate split licence:

- **The desktop application and capture/runtime code:** [GNU AGPL-3.0-only](LICENSE)
- **The open agent protocol specification:** [Apache-2.0](LICENSES/Apache-2.0.txt)

This keeps the product and improvements open while allowing any agent or
commercial system to implement the protocol without inheriting the app's
licence. See [`LICENSES/README.md`](LICENSES/README.md) for the exact boundary.
