# za3tar ↔ agent bridge protocol v1

za3tar can hand meetings to a **compatible agent** — whatever assistant you
already run (a Hermes/OpenClaw profile, a Claude agent, a plain script).
This document specifies the exchange, not the receiving agent's capabilities:
calendar writes, message delivery, follow-up tracking, and reliability are all
implemented and governed by that agent. The app and the agent exchange
**versioned envelopes** both directions; what the agent does with a packet is
its business, but the reply contract is fixed.

## Transport

Any command line. In ⚙ settings (or `ZA3TAR_AGENT_CMD`), configure a command
that:

1. receives the message as its **final argument** (za3tar runs
   `sh -c '<your command> "$0"' <message>`),
2. prints the agent's reply on **stdout**, and
3. exits non-zero (with the error on stderr) on transport failure.

If it works in a terminal, it works here. Examples: an `ssh host agent-cli
--oneshot` wrapper, a `curl` to your agent's endpoint, a local script. No
servers or listeners in the app; nothing is sent without an explicit click in
the UI.

An envelope is a header line + one JSON object:

```
ZA3TAR_PACKET v1
{...}
```

The app parses replies defensively (finds the header, then the outermost
JSON) because the far side is an agent; instruct yours to reply with the
envelope *only*. Follow-up ids are composed by the app as
`<meetingId>#a<actionId>` (local ids aren't globally unique) and must
round-trip untouched.

## Agent side

Two pieces make a good implementation, both outside this repo:

- **A trigger/skill**: on any message starting with `ZA3TAR_`, follow this
  protocol and reply with the envelope only.
- **A deterministic router** for ingest/status/update against the agent's own
  follow-up store, so repeated packets upsert instead of duplicating.
  Calendar events go through whatever calendar access the agent has;
  everything mechanical should be script, not model.

## App → agent

### ZA3TAR_PACKET v1 — hand over a meeting

```json
{"meeting": {"id": "rec-…", "title": "coffee مع رانيا",
             "started_at": "2026-07-27T14:00:00.000Z",
             "person": {"name": "Rania", "phone": "+9715…"}},
 "decisions": ["…"],
 "actions": [{"id": "rec-…#a3", "text": "ببعت الـ proposal", "owner": "me",
              "due": "2026-07-30"}],
 "questions": ["…"],
 "notes_md": "…"}
```

Only open (not-done) actions are sent. `due` empty ⇒ tracked but no calendar
event. Re-sending the same meeting is safe: the router upserts by id and
preserves follow-up statuses.

**Reply — ZA3TAR_ACK v1:**

```json
{"ok": true,
 "events_created": [{"action_id": "rec-…#a3", "title": "…", "when": "2026-07-30"}],
 "followups_tracked": ["rec-…#a3"],
 "person": "updated",
 "warnings": ["rec-…#a4: no date — tracked, no calendar event"]}
```

A calendar failure degrades to a warning; the ack still comes back `ok`.

### ZA3TAR_QUERY v1 — ask

```json
{"type": "today"}
{"type": "followups", "ids": ["rec-…#a3"]}
```

`followups` without `ids` returns everything not done/dropped.

## Agent → app

**ZA3TAR_SCHEDULE v1** (for `today`; times local, sorted; `error` set and
`events` empty when the calendar is unreachable):

```json
{"date": "2026-07-27",
 "events": [{"start": "14:00", "end": "15:00", "title": "…", "attendees": ["…"]}]}
```

**ZA3TAR_STATUS v1** (for `followups`):

```json
{"followups": [{"id": "rec-…#a3", "status": "nudged",
                "text": "…", "owner": "me", "due": "2026-07-30",
                "note": "sent WhatsApp reminder",
                "updated_at": "2026-07-27T18:05:19+00:00"}]}
```

Statuses: `open | nudged | replied | done | dropped`. The agent records these
as it acts (nudges sent, replies received); the app's follow-ups view syncs
them on demand and marks locally-done anything the agent reports `done`.
Silent divergence between app and agent is the failure mode this protocol
exists to kill.

## Versioning

The header carries the version. Additive fields don't bump it; changed
semantics do. An unknown envelope should be answered with a plain-text error,
which the app surfaces as-is.
