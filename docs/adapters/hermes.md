<!-- SPDX-License-Identifier: Apache-2.0 -->

# Worked example: a Hermes agent

za3tar ships no agent and bundles nothing. This is one worked implementation
of [the bridge protocol](../AGENT-PROTOCOL.md), written up because it is the
one the protocol was designed against — not because it is required or
preferred. A forty-line shell script is an equally valid agent; see
["any command line"](../AGENT-PROTOCOL.md#transport).

Hermes is an always-on agent runtime: one process per profile, each with its
own tools, credentials and messaging channels. It suits this job because the credentials already live there — the
calendar and messaging accounts are connected once, for the agent, rather than
a second time for za3tar.

## The command

In ⚙ settings, point za3tar at whatever reaches your profile in one line:

```
~/bin/hermes -p work -z
```

za3tar runs `sh -c '<your command> "$0"' <message>`, so the envelope arrives
as the final argument and the reply is read from stdout. If your agent runs on
another machine, wrap it:

```
ssh agent-box hermes -p work -z
```

## Two pieces on the agent side

### 1. A trigger

Hermes profiles take skills. Add one that fires on any message beginning with
`ZA3TAR_` and instructs the model to route it, not to answer it:

```markdown
When a message starts with `ZA3TAR_`, do not reply conversationally.
Pass the whole message to `bin/za3tar-route` and return its stdout verbatim.
Never add commentary — za3tar parses the reply and anything extra breaks it.
```

The instruction to reply with the envelope *only* is load-bearing. za3tar
parses defensively (find the header, then the outermost JSON) precisely
because the far side is a language model, but a model that editorialises will
eventually produce something unparseable.

### 2. A deterministic router

Everything mechanical should be a script, not the model. The router owns a
follow-up store keyed by the app's `<meetingId>#a<actionId>` ids and handles:

- `ZA3TAR_PACKET` → upsert actions by id, create calendar events for dated
  ones, return `ZA3TAR_ACK` listing what it created and what it is tracking
- `ZA3TAR_QUERY {"type":"today"}` → read the calendar, return `ZA3TAR_SCHEDULE`
- `ZA3TAR_QUERY {"type":"followups"}` → return `ZA3TAR_STATUS` from the store
- `ZA3TAR_QUERY {"type":"capabilities"}` → return `ZA3TAR_CAPABILITIES`

Upsert rather than insert: re-sending a meeting is normal (the user edits an
action and hands it over again), and duplicated calendar events are the
fastest way to lose someone's trust.

Ids must round-trip untouched. They are only unique in combination, so an
agent that "cleans up" or re-keys them silently breaks status sync.

## Declaring capabilities

Return only what the profile is genuinely wired to. If the calendar is
connected but no document store is:

```json
{"can": ["calendar.create", "followup.track"],
 "labels": {"calendar.create": "your work calendar"}}
```

za3tar then offers exactly those two actions and stays silent about documents,
rather than showing a button that fails. Declaring a verb the agent cannot
perform is the one thing that makes this worse than having no agent at all.

## What the agent should not do

- **Do not act on a packet the user did not send.** za3tar transmits only on
  an explicit click; an agent that polls or acts on a schedule breaks the
  promise the app makes to its user on the first screen.
- **Do not send messages without the user's go-ahead** unless they have asked
  for exactly that. Drafting is the safe default; `message.send` means the
  user has opted into delivery.
- **Do not report `done` for something it merely attempted.** The status
  vocabulary exists so the app and the agent cannot silently diverge, which
  is the failure this protocol was written to kill.

## Status

The capability verbs are new and the app does not yet render an
agent-declared action list — the query and reply are specified, and the app's
side is still to come. `today`, `followups` and packet hand-off work now.
