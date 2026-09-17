# Za3tar proxy — hosted mode

The app has two ways to work: **your own keys** in Settings (nothing leaves
the Mac except to the providers you chose), or **sign in with Za3tar** and
use the providers through this proxy with an invite code. This directory is
the proxy. Za3tar runs one; anyone can run their own.

## Run

```bash
cd proxy && npm ci
ANTHROPIC_API_KEY=… ELEVENLABS_API_KEY=… OPENAI_API_KEY=… ADMIN_TOKEN=… \
DATA_DIR=./data PORT=8791 node server.mjs
```

Binds to 127.0.0.1; put Caddy or nginx in front for TLS. WebSocket upgrade
must be passed through (Caddy's `reverse_proxy` does).

## Endpoints

| method | path | who | what |
|---|---|---|---|
| POST | `/v1/auth/redeem` | anyone with a code | `{code, name}` → `{token, account}` |
| GET | `/v1/me` | bearer | account, caps, usage this month |
| POST | `/v1/anthropic/messages` | bearer | pass-through; metered by tokens |
| POST | `/v1/elevenlabs/speech-to-text` | bearer | pass-through multipart; metered by audio seconds |
| POST | `/v1/live/sessions` | bearer | pass-through; session bound to the account |
| WS | `/v1/live/sessions/:id/attach` | bearer | relayed sideband; metered by session seconds |
| POST | `/v1/admin/invites` | `X-Admin-Token` | mint a code: `{note, caps?}` |
| GET | `/v1/admin/accounts` | `X-Admin-Token` | accounts with this month's usage |

Caps default to 2M Anthropic tokens, 5 hours of transcription and 1 hour of
Talk per account per month (`CAP_*` env), overridable per invite. Over cap
returns 402 with a plain message the app shows.

## What is stored

`accounts.json` (name, created, hashed token, caps), `invites.json`, and
`usage/YYYY-MM.json` counters. Request and response bodies are not logged or
kept. Audio and transcripts pass through to the providers and are gone.
