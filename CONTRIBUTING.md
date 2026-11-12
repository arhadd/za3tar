# Contributing to za3tar 🌿

Ahlan! Contributions are welcome — especially from people who live the
Arabic/English code-switching this app exists for.

## Setup

### No keys, no Mac permissions: the interface on made-up data

```bash
npm install
npm run dev
```

Open http://localhost:1420. In a browser the app runs on a stand-in for the
Rust core (`src/devMock.ts`): a fictional company with meetings, threads,
people and to-dos, enough to work on every screen. Add `?fresh=1` to see the
first-run setup. Nothing is saved; reload and it resets. Most interface work
needs nothing more than this, and it runs on any OS.

### The real app: your own keys

Prereqs: macOS 14.4+ (the capture layer uses Core Audio process taps), Node,
Rust (rustup) and Xcode Command Line Tools.

```bash
npm install
npm run app             # builds the native capture helper, then starts Tauri
```

Add your keys in **Settings** inside the app, or in `.env`
(`cp .env.example .env`). You only need the keys for the part you are working
on: ElevenLabs for transcription, Anthropic for notes and to-dos. OpenAI
(Talk) and TypeSafe (the ask box reading as you type) are optional. The
README has the full table.

Direct `npm run tauri dev` assumes the capture helper has already been built.

### Before you open a pull request

```bash
npm run release:check
```

This is what CI runs: versions, the licence boundary, the frontend build,
`cargo fmt`, `cargo clippy`, the Rust tests and the capture helper. The Rust
tests need no keys. The tests in `src-tauri/tests/live.rs` call the real
providers and are ignored unless you ask for them.

## Where things are

| path | what lives there |
|---|---|
| `src/` | the interface: React + TypeScript. `App.tsx` holds the state, `views/` the screens, `ipc.ts` the one door to Rust, `devMock.ts` the browser stand-in |
| `src-tauri/src/` | the Rust core. `asr.rs` transcription, `anthropic.rs` + `notes.rs` + `actions.rs` notes and to-dos, `live.rs` Talk, `jev.rs` the ask-box pre-read, `settings.rs` keys, `hosted.rs` sign-in, `acp.rs` + `agent.rs` assistants, `threads.rs` / `workspaces.rs` / `people.rs` / `library.rs` the local records |
| `capture/` | the Swift helper that records mic and system audio |
| `docs/AGENT-PROTOCOL.md` | the contract between the app and any assistant (Apache-2.0) |
| `kit/`, `store/`, `live/` | what an assistant's server needs: skills, the shared thread record, the live line |
| `proxy/` | the small server behind "Sign in with Za3tar"; anyone can run one |
| `site/` | the za3tar.ai website. Not licensed for reuse, and not where app contributions go |

If you add a command in Rust, add its stand-in to `src/devMock.ts` in the same
pull request, so the browser preview keeps covering every screen.

## What helps most

- **Dialect coverage** — transcripts or notes that come out wrong for your
  dialect (Levantine, Gulf, Egyptian, Maghrebi…). Open an issue with the
  audio situation described, never the audio of a real meeting.
- **A second ASR engine** — the adapter seam is in `src-tauri/src/asr.rs`.
  A local engine (no key at all) would be the most welcome one.
- **More providers for notes** — today notes go to Claude, on your key, with
  the model and endpoint overridable (`ZA3TAR_NOTES_MODEL`,
  `ANTHROPIC_BASE_URL`). A second provider belongs behind
  `src-tauri/src/anthropic.rs`; open an issue first so we agree on the seam.
- **Agent bridges** — implementations of `docs/AGENT-PROTOCOL.md` for other
  agent stacks. The protocol is the contract; transports are yours.
- Bug fixes with a repro.

New here? Issues labelled `good first issue` are sized for a first pull
request. For anything bigger than a fix, open an issue before you build, so
nobody writes code that cannot be merged. Please be patient with reviews: this
is a small team.

## Ground rules

- Branch from `main`: `feat/…`, `fix/…`, `chore/…`. Atomic commits,
  imperative messages that say why.
- Never commit `.env`, API keys, or recordings — `.gitignore` already blocks
  them; keep it that way.
- Keys live in the Rust core and are read from env/settings; they must never
  reach the webview.
- Rust: `cargo fmt` + `cargo clippy`. TS: `tsc` clean.
- Meeting audio and transcripts are private by design (local files,
  no telemetry). Don't add network calls beyond the user's own configured
  APIs and agent command.
- No real people, companies or meetings in code, tests, mock data or
  screenshots. Make them up (the mock company is "Madar").
- Be decent to each other: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
  Security problems go to [`SECURITY.md`](SECURITY.md), not a public issue.

## Licence and contributor rights

### Inbound licence

By contributing, you agree that application/runtime contributions are licensed
under **AGPL-3.0-only**. Contributions made specifically to the protocol
specification in `docs/AGENT-PROTOCOL.md` are licensed under **Apache-2.0**.
See `LICENSES/README.md` before submitting code intended for a future protocol
SDK or example implementation.

### Relicensing grant

In addition to the licence above, you grant the za3tar maintainer a perpetual,
worldwide, irrevocable, royalty-free right to use, reproduce, modify and
distribute your contribution **under other licence terms, including commercial
and proprietary terms**.

This is what keeps za3tar AGPL for everyone while leaving a paid commercial
licence possible for organisations that cannot deploy AGPL software. You keep
the copyright in your contribution and may use it however else you like.
Without this grant a single merged contribution would permanently foreclose
that option for the whole project, so it is required for application and
runtime code.

### Sign-off (DCO)

Every commit must carry a `Signed-off-by` line certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/):

```bash
git commit -s -m "fix: the thing that was broken"
```

Signing off certifies that you wrote the contribution, or otherwise have the
right to submit it under the terms above.
