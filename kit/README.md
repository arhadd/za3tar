# The Za3tar kit — what an assistant needs to work with the app

Za3tar does the meeting work itself (capture, transcripts, notes, outcomes,
drafts) and hands the rest to an assistant you already run: one that holds
your calendar, your chats and your memory. The app ships no agent. The kit is
what any assistant needs to be that runtime, gathered in one place so a new
one is set up in a few commands rather than by hand.

| piece | what it gives the app | where |
|---|---|---|
| tidy skill | item-by-item verdicts on open to-dos and decisions: done, drop, someone else's, keep with a next step | [`skills/za3tar-tidy`](skills/za3tar-tidy/SKILL.md) |
| thread record | one record of where each thread stands, shared by the app and the assistant | [`../store`](../store/README.md) |
| live line | what the assistant is doing elsewhere, as it happens (Hermes) | [`../live`](../live/README.md) |
| bridge | meeting hand-offs, today's schedule, follow-up status | [protocol](../docs/AGENT-PROTOCOL.md), [Hermes example](../docs/adapters/hermes.md) |

## Install the skills (Hermes)

```bash
cp -r kit/skills/* ~/.hermes/profiles/<profile>/skills/
```

The thread record and the live line are commands on the assistant's server;
their READMEs say how to put them on the PATH.

## Rules every piece keeps

- Nothing acts without the user: the assistant answers, the user applies.
- Ids round-trip untouched.
- Replies are envelopes the app can parse, never prose.
