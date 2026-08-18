# za3tar — the three-minute demo 🌿

## The one-line setup

> “za3tar records the meeting without a bot, understands the Arabic and English the way we actually spoke it, then turns the commitments into follow-through.”

The product is the loop: **record → understand → follow through**.

## Before the demo

za3tar runs as a native Mac app. Add your API keys and name in **Settings**. On first use, allow microphone access; for calls, also grant **System Audio Recording**.

For the full connected demo, add an agent name and command in Settings. The standalone meeting, notes, drafts, Calendar export, people, and follow-up features work without an agent.

## Demo flow

1. **Start with a real conversation.** Title the meeting, optionally tag a person, then record for two or three minutes. Mix Arabic and English naturally. Include one genuine commitment with an owner and date.

2. **Stop and let za3tar do the structure.** Show the transcript and notes, then the outcomes: decisions, action items with owners and resolved dates, and open questions. Point out that Arabic remains Arabic while English names and technical terms remain natural.

3. **Show that the meeting moves forward.**
   - Open the editable WhatsApp follow-up in the meeting’s own language mix.
   - Export a dated action to Calendar.
   - Mark an item done or show open commitments across meetings.

4. **Show the memory.** Open **People** to see meetings and outstanding items by person, then **Follow-ups** to show overdue commitments and contextual nudges.

5. **Optional: hand it to an agent.** Send the structured meeting packet to the connected agent. Show the acknowledgement—calendar events created, follow-ups tracked, and any warnings—then sync follow-up status back into the app.

## The close

> “Most notetakers stop at what was said. za3tar keeps track of what happens next—and it works in the language mix the meeting actually happened in.”

For an organization:

> “The app captures and structures the meeting. Your agent can own the follow-through using the tools and policies you already control.”

## If something is off

- **Only one speaker appears:** the other person may not have spoken enough for diarization. Notes and actions should still work.
- **No actions are extracted:** za3tar does not invent commitments. Use a real “I’ll send X by Thursday” in the demo.
- **Agent controls are hidden:** no agent command is configured. The standalone product still works.
- **The agent call errors:** check that the configured command is reachable and returns the envelopes in [`docs/AGENT-PROTOCOL.md`](docs/AGENT-PROTOCOL.md).
- **An automatic step stalls:** use the matching retry action and check the configured API key.
