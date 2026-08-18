# Privacy and data flow

za3tar is local-first, not offline-only. This page explains what stays on your Mac and what leaves it when you use configured processing or agent features.

## Stored locally

za3tar stores meeting audio, transcripts, notes, extracted outcomes, contacts, settings, and follow-up state in the app’s local data directory on your Mac.

za3tar does not provide an account, first-party cloud sync, or telemetry. Deleting local app data is therefore destructive unless you have made your own backup.

## Configured AI providers

Processing a recording uses credentials you provide:

- **ElevenLabs Scribe v2** receives recorded audio for transcription.
- **Anthropic Claude** receives transcript text and relevant meeting context to produce notes, extract decisions/actions/questions, and draft follow-ups.

The providers’ own terms, retention settings, and regional processing policies apply. Do not record or process material you are not permitted to share with those providers.

## Optional agent bridge

The agent bridge is disabled until you configure an agent command. When you explicitly use a bridge control, za3tar sends the structured meeting packet described in [`AGENT-PROTOCOL.md`](AGENT-PROTOCOL.md). Depending on the action, that packet can include:

- meeting title, time, and local meeting ID
- linked person name and contact details
- notes, decisions, action items, owners, dates, and open questions

The receiving agent determines what happens next. Its storage, messaging, calendar, and other integrations are outside za3tar and follow that agent’s configuration and policies.

## User-controlled actions

Standalone WhatsApp and email features create editable drafts and open the relevant client. Calendar export creates an `.ics` file. za3tar does not natively send those messages or directly create calendar events.

A connected agent may perform those actions only if it is separately configured and authorized to do so.

## Recording consent

Recording laws and workplace policies vary. Get the required consent before recording other people, and never attach real meeting audio, transcripts, contact details, API keys, or calendars to a public issue.

## Security reports

If you find a vulnerability, contact the maintainer privately rather than opening a public issue with exploit details or sensitive data.
