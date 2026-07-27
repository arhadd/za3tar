# za3tar ↔ jello bridge protocol v1

The app and the agent used to exchange prose; what jello did with a packet was
whatever the model improvised that day, and nothing came back. v1 makes the
bridge a protocol: versioned envelopes both directions over the same hx
transport (`send_to_jello` → ssh → hermes oneshot), with a deterministic
router on jello's side. No new servers, tokens, or listeners — unchanged.

An envelope is a header line + one JSON object:

```
ZA3TAR_PACKET v1
{...}
```

The app parses replies defensively (finds the header, then the outermost JSON)
because the far side is still an agent; jello's skill instructs it to reply
with the envelope *only*.

## Server side (lives on web0-core, not in this repo)

- **Skill**: `~/.hermes/profiles/jello/skills/za3tar/SKILL.md` — triggers on
  `ZA3TAR_*` messages, enforces the reply contract.
- **Router**: `/srv/jello/za3tar/bin/za3tar-route` — deterministic
  ingest/status/update against `/srv/jello/za3tar/followups.json`. Calendar
  events go through tyme (the agent's own calendar tool); everything else is
  script, not model.
- Follow-up ids are composed by the app as `<meetingId>#a<actionId>` (the
  local SQLite ids aren't globally unique) and must round-trip untouched.

## App → jello

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

## jello → app

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

Statuses: `open | nudged | replied | done | dropped`. Jello records these as it
acts (nudges sent, replies received) via `za3tar-route update`; the app's
follow-ups view syncs them on demand and marks locally-done anything jello
reports `done`. Silent divergence between app and agent is the failure mode
this protocol exists to kill.

## Versioning

The header carries the version. Additive fields don't bump it; changed
semantics do. An unknown envelope should be answered with a plain-text error,
which the app surfaces as-is.
