---
name: za3tar-tidy
description: |
  Triage the user's open to-dos and unconfirmed decisions from the Za3tar
  app. Load when a message starts with ZA3TAR_QUERY and its type is "tidy",
  or when asked to tidy up or triage Za3tar to-dos. Read-only: judge each
  item from what you know and can look up, reply with verdicts, change
  nothing.
version: 0.1.0
metadata:
  hermes:
    tags: [za3tar, todos, triage]
    category: integrations
---

# Tidy up open to-dos

Meetings leave a trail of to-dos and decisions that nobody closes. Most are
already done, overtaken, or someone else's. You can see what the app cannot:
the user's chats, calendar, email, status notes and your own memory. Use that
to say, item by item, what is still really open, so the user only keeps what
needs them.

## Iron rules

1. **Read-only.** Do not send messages, create events, edit files or mark
   anything done. The user applies your verdicts in the app with a tap.
2. **Every item gets exactly one verdict**, and ids round-trip untouched.
3. **Evidence over guessing.** Say where you saw it. If you found nothing,
   answer `unsure`; a confident wrong "done" makes the user drop real work.
4. Write `why`, `evidence` and `next` in English; keep names as written.
   Items may be in Arabic, English or both; read them as they are.
5. Reply with the envelope only: header line, one JSON object, nothing else.

## Input

```
ZA3TAR_QUERY v1
{"type": "tidy", "today": "YYYY-MM-DD",
 "items": [{"id": "…", "kind": "todo" | "decision", "text": "…",
            "owner": "me" | "<Name>", "due": "YYYY-MM-DD" | null,
            "meeting": "…", "met": "YYYY-MM-DD", "workspace": "…",
            "person": "…" | null}]}
```

## How to judge

Look until you know enough, cheapest first:

1. The user's current status map (for example a THREADS.md) and project notes.
2. Your follow-up store, if you track the app's follow-ups.
3. Past conversations since the meeting date that mention the person, the
   project or the item's key words (session search).
4. The calendar: did the call, demo or visit happen?
5. Email, if you have it.

Group the lookups: one search per person or project covers many items. Many
items share a meeting; judge them together.

**To-dos**

| verdict | when |
|---|---|
| `done` | it happened: sent, held, paid, shipped |
| `drop` | no longer worth doing: the plan changed, the project ended or paused, a later decision replaced it, or it repeats another item |
| `theirs` | someone else holds it and the user is only waiting; say who |
| `keep` | still the user's; give the one next step |
| `unsure` | not enough to say |

**Decisions**

| verdict | when |
|---|---|
| `confirm` | it stood: later work follows it |
| `drop` | it was reversed or replaced; say by what |
| `unsure` | not enough to say |

## Output

```
ZA3TAR_TIDY v1
{"verdicts": [{"id": "…", "verdict": "done" | "drop" | "theirs" | "keep" | "confirm" | "unsure",
               "confidence": "high" | "medium" | "low",
               "why": "at most 20 words",
               "evidence": "where you saw it, at most 12 words" | null,
               "next": "one concrete step, at most 12 words" | null,
               "can_do": true | false}]}
```

- `next` only for `keep`, and for `theirs` when a nudge is the step.
- `can_do`: true when you could take the next step yourself if the user asks
  (send a nudge, book a slot, draft a reply). It is a recommendation; do not
  take the step.
