# Za3tar makes its own launch video

## Honest premise

Ala speaks to Za3tar. Za3tar captures the Arabic-English instruction, turns it
into a structured meeting brief, and hands that packet to a connected agent.
The connected agent—not Za3tar's desktop runtime—clones/builds the public repo,
records the product, assembles the edit, and returns the video.

The proof is the whole loop:

> speak naturally → create shared understanding → agents follow through

## Ala's spoken prompt

Use this naturally rather than reading it like an advertisement:

> Za3tar, I want you to make your own launch video. Pull yourself from the
> public GitHub repo and build a clean copy. Show this conversation being
> captured without a meeting bot, show the Arabic and English staying natural,
> then show the decisions and actions you extract. Hand the brief to my agent,
> have it assemble the video, and bring me back something I can review. Keep it
> under ninety seconds and don't publish anything without me.

Include one explicit commitment with a date so the action extractor has real
work to find:

> I'll review the first cut tomorrow at 11.

## Capture plan

1. **Cold open — 0:00–0:08**
   - Ala at the Mac: “I asked Za3tar to make its own launch video.”
   - Start recording in Za3tar; no call participant/bot appears.

2. **The request — 0:08–0:25**
   - Ala gives the prompt above with natural Arabic-English code-switching.
   - Screen records the live Za3tar capture state.

3. **Understanding — 0:25–0:40**
   - Stop capture.
   - Reveal transcript, concise notes, the launch-video decision, and the dated
     review action.
   - Do not hide real latency with a fake loading animation; use a clean time cut.

4. **Handoff — 0:40–0:52**
   - Show the exact structured packet preview.
   - Ala explicitly clicks the agent handoff.
   - Show the agent acknowledgement; do not imply an automatic send.

5. **Follow-through — 0:52–1:15**
   - Terminal capture: agent clones `github.com/arhadd/za3tar` into an empty
     directory, checks out the release commit, runs the release checks, and
     assembles the approved screen recordings.
   - Accelerate dead time, but keep commands and results real.

6. **Result — 1:15–1:30**
   - The returned draft plays inside the editing/review surface.
   - Closing card: “The meeting is not done when the notes arrive.”
   - Subline: “open source · private by default · built for Arabic + English.”
   - GitHub/download URL.

## Agent action brief

The connected agent should receive and follow this bounded brief:

- Work only in a new temporary clone of the public repository.
- Build from the exact reviewed release commit.
- Run `npm ci` and `npm run release:check`; preserve real command output.
- Use only the consented recordings listed by Ala.
- Produce a draft under 90 seconds with burned-in English captions and accurate
  Arabic script where Arabic is spoken.
- Do not upload, post, tag, email, or publish.
- Return the local draft path, duration, resolution, codec, and a short edit log.
- If signing credentials are unavailable, stop at the unsigned build check and
  say so; never fabricate notarization or release status.

## Deterministic fallback

If automated editing fails, the launch still ships honestly:

- use the same verified screen recordings;
- render a simple 1920×1080 H.264/AAC cut with captions and title cards;
- keep command output unaltered;
- disclose that the agent assembled the draft from provided captures.

## Acceptance

- The opening request is genuinely captured by Za3tar.
- The transcript and structured outputs come from that capture.
- The handoff is explicit and visible.
- The clone/build commands really run against the public repository.
- The returned video exists and is inspected before publication.
- No private conversation, credentials, fake terminal output, or unverified
  signing claim appears in the final cut.
