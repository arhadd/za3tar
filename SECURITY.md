# Security

Za3tar handles meeting audio, transcripts and API keys, so we would rather
hear about a problem early and privately.

## Report a vulnerability

Open a private report:
https://github.com/arhadd/za3tar/security/advisories/new

Do not open a public issue for anything that could expose recordings,
transcripts, contact details or keys. Never include real meeting content or a
working key in a report; describe the steps and use throwaway data.

You should hear back within a week. Once a fix ships we credit the reporter,
unless you ask us not to.

## What counts

- A key or account token reaching the webview, a log, a crash report or disk
  in a file that is not owner-only.
- The app sending audio, transcript or meeting data anywhere other than the
  providers and commands the user configured (see
  [`docs/PRIVACY.md`](docs/PRIVACY.md)).
- A command, route or envelope that lets a connected assistant or a crafted
  reply act without the user's click.
- In [`proxy/`](proxy/README.md): reading another account's usage or session,
  bypassing a cap, or using the proxy as an open relay.

## Supported versions

Za3tar is an early build. Fixes land on `main`; there are no maintained
release branches yet.
