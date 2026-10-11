# za3tar-live — what your assistant is doing, as it happens

An assistant that runs on a server keeps working when you are not looking:
it answers chats, runs scheduled jobs, picks up a thread you started from your
phone. The app's other routes only see it when you send it something. This is
the live line: the app shows the assistant's latest conversations on Home and
refreshes them the moment one moves, without polling.

It works with a [Hermes](https://github.com/NousResearch/hermes-agent)
profile, whose backend (`hermes serve`) already announces those changes. The
script runs next to Hermes on the server: it starts a private backend for one
profile, holds the connection, and speaks JSON lines on stdio. The app only
needs a command, usually ssh.

- **Read-only by construction.** The app can read the session list and a
  session's messages. Every other request is refused on the server side, and
  nothing creates a session, prompts the agent or spends a model call.
- **No ports, no token on the Mac.** The backend binds 127.0.0.1 on the
  server with a token the script makes and keeps; the app never sees either.
- **Nothing left behind.** The backend lives as long as the script. The app
  quitting, ssh dropping, or a minute without a ping (a Mac that went to
  sleep) stops it and every process it started.

Needs Hermes with `serve` and the `websockets` package, which Hermes's own
Python environment has. Tested against Hermes 0.20.5.

## Run

```bash
python live/za3tar_live.py work
{"status": "starting"}
{"status": "live", "profile": "work"}
{"id": 1, "get": "/api/sessions?order=recent&limit=6"}      ← typed
{"id": 1, "result": {"sessions": [...]}}
{"event": "sessions.changed"}                               ← something moved
```

| line from the app | reply |
|---|---|
| `{"id": N, "get": "/api/sessions…"}` | `{"id": N, "result": …}` or `{"id": N, "error": "…"}` |
| `{"id": N, "ping": true}` | `{"id": N, "result": "pong"}` |

Allowed paths: `/api/sessions`, `/api/sessions/<id>` and
`/api/sessions/<id>/messages`, each with a query string. The script also
sends `{"event": "sessions.changed"}` or `{"event": "cron.changed"}` when
something moves, and `{"status": "down", "error": "…"}` before exiting 1 if
the backend goes away. Exit 0 means the app left.

## On a server

Run it with Hermes's Python, as the user that owns the profiles. A wrapper on
the PATH keeps the config in one place; if ssh arrives as root,
`ZA3TAR_LIVE_USER` re-runs the script as that user.

```sh
#!/bin/sh
export ZA3TAR_LIVE_USER=assistant
export ZA3TAR_LIVE_HERMES=/home/assistant/.hermes/hermes-agent/venv/bin/hermes
exec /home/assistant/.hermes/hermes-agent/venv/bin/python /opt/za3tar/live/za3tar_live.py "$@"
```

## In the app

Settings → your assistant → live feed command, for example:

```
ssh -o BatchMode=yes -o ConnectTimeout=8 my-server za3tar-live work
```

Home then shows the assistant's latest conversations, newest first, marking
the ones moving right now. The app keeps the line open while it runs and
reconnects after sleep or a dropped network.

## Test

```bash
python3 live/test_za3tar_live.py
```
