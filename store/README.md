# za3tar-threads — one record for threads

The app keeps a "where it stands" line per thread. That works while the app
is the only one moving them. Once an assistant on a server also moves them
(from a chat, a nightly job, a markdown map people edit), there are two
records and someone ends up reconciling them by hand.

This is the one record: a SQLite file on a server, reached as a command. The
assistant calls it locally; the app calls it over ssh. Python 3 standard
library only.

- Every accepted write is a new version; old versions stay in history.
- A write names the version it read. If the thread moved since, the write is
  refused (exit 3) with the current record, so nothing silently wins.
- Chosen threads can be mirrored into a markdown map, one line each. Hand
  edits to a mirrored line come back in as a write.

## Run

```bash
export ZA3TAR_THREADS_DB=/var/lib/za3tar-threads/threads.db
python3 store/za3tar_threads.py list
python3 store/za3tar_threads.py create --workspace work --title "Gala venue" \
  --stands "Shortlist of three." --by me
python3 store/za3tar_threads.py update work-gala-venue --expect 1 \
  --stands "Booked." --by assistant --source "chat"
python3 store/za3tar_threads.py history work-gala-venue
```

Writes can also arrive as one JSON object on stdin (`put`), which is how the
app sends them, so nothing a person typed passes through a shell.

| exit | meaning |
|---|---|
| 0 | ok, JSON record on stdout |
| 2 | bad input |
| 3 | the thread moved since you read it; `current` holds the latest |
| 4 | no such thread |

## Mirror into a markdown map

```bash
export ZA3TAR_THREADS_MIRROR=/path/to/THREADS.md
python3 store/za3tar_threads.py mirror-add work-gala-venue
```

The thread's line in the map (matched by its bold title) is rewritten as
`- **Title (UPDATED date)** — where it stands <!-- thread:id vN -->`. Every
write re-renders it; `mirror` also picks up hand edits to it. Run `mirror` on
a timer so edits made straight into the file come back in. A hand edit made
on an old copy of the line is refused and logged, never merged blind.

`ZA3TAR_THREADS_EXPORT` (optional) names a JSON snapshot rewritten after
every change, handy for keeping the record in git.

## On a server

A wrapper on the PATH keeps the config in one place. If ssh arrives as root,
`ZA3TAR_THREADS_USER` re-runs the command as the assistant's user so every
file keeps one owner.

```sh
#!/bin/sh
export ZA3TAR_THREADS_DB=/var/lib/za3tar-threads/threads.db
export ZA3TAR_THREADS_USER=assistant
exec /usr/bin/python3 /opt/za3tar/threads/za3tar_threads.py "$@"
```

## In the app

Settings → Shared threads → thread store command, for example:

```
ssh -o BatchMode=yes -o ConnectTimeout=8 my-server za3tar-threads
```

With it set, the app lists, creates, moves and deletes threads through the
store, and keeps its local `threads.json` only as the last copy read (what it
shows when the server can't be reached). Empty keeps threads on the Mac.

## Test

```bash
python3 -m unittest store/test_za3tar_threads.py
```
