# za3tar 🌿

**from meeting to done, بالعربيزي** — a Mac meeting notetaker that actually
understands how people in the region talk, and acts on what was agreed.

Records your meetings without a bot (system audio + mic, captured locally),
transcribes dialectal Arabic with Arabic/English code-switching, writes clean
AI notes that mirror how the meeting actually sounded — Arabic in Arabic
script, English tech terms and names left in Latin — then pulls out the
**decisions, action items (with owners and real dates), and open questions**,
and drafts the follow-up: a WhatsApp message or recap email in the meeting's
own language mix, action items straight onto your Calendar. Nothing sends
without your click.

Granola has the form factor but no Arabic. The Arabic tools are bots in your
calls. za3tar is the pairing: no-bot native Mac app × dialectal Arabic — and
the ladder past notes: **capture → synthesize → execute**.

Works for calls (mic = you, system audio = them) *and* in-person meetings
(one mic track, diarized into voices, attributed by the names people actually
say). Set `ZA3TAR_USER` in `.env` so the models know who "me" is.

## Status

Early build. Milestones:

- **M0 — scaffold** ✅ Tauri v2 + React + TS + Tailwind
- **M1 — capture** 🚧 system-audio tap + mic → two 16 kHz WAVs (no bot). Mic
  proven; system tap streams and writes, pending a one-time macOS permission
  grant (see [capture/README.md](capture/README.md))
- **M2 — ASR** ✅ ElevenLabs Scribe v2 transcribes both tracks (me/them),
  merged by timestamp. Behind one adapter so a second engine drops in later.
- **M3 — notes** ✅ Claude turns the transcript into structured markdown with
  the code-switching contract (Arabic script + Latin for English terms)
- **M4 — the app** ✅ record → auto-transcribe → notes → copy-as-markdown, with
  a live rough-notes box, a **past-meetings library** (reopen/retranscribe/
  rename any recording), and in-app guidance to the system-audio grant.
  Verified end-to-end against the live APIs.
- **M5 — dogfood** 🚧 real meetings work today (mic-only until the M1 grant).
  Fixes from the first dogfood pass: WAVs are now header-finalized on stop (were
  saving as 0-length despite holding audio); notes no longer truncate on long
  meetings; two tracks transcribe in parallel. Still pending: the M1 system-audio
  grant for the "them" track, and a Developer-ID-signed build.
- **M6 — actions** ✅ the rung past notes. Stop → transcript → notes →
  **decisions / action items (owners + resolved dates) / open questions**, all
  automatic. Each meeting can then execute: WhatsApp follow-up + recap email
  drafted in the meeting's own language mix (editable; opens in
  WhatsApp/Mail — nothing sends itself), `.ics` export to Calendar, per-item
  done tracking, copy-as-markdown packet. In-person meetings are diarized
  (`voice1`/`voice2`) and attributed via the names people say + `ZA3TAR_USER`.
  Verified against the live APIs (`cargo test --test live -- --ignored`).
- **M7 — follow-through** ✅ open action items aggregated **across all
  meetings** (overdue flags, owner chips, jump-to-meeting) with one-tap
  WhatsApp nudges in the meeting's own language. In-app **Settings** (API keys
  + your name — no `.env` needed, installable by non-developers). Real app
  icon. Echo cancellation on the mic (AEC) so speakers don't bleed into the
  "me" track; capture runs one helper per track.

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
