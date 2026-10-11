#!/usr/bin/env python3
"""za3tar-live — a read-only live line from a Hermes profile to Za3tar.

Za3tar shows what an assistant is doing elsewhere (its other chats, its
scheduled jobs) as it happens. Hermes already announces those changes to
clients of its backend (`hermes serve`). This script runs next to Hermes,
starts a private backend for one profile, holds the connection, and speaks
JSON lines on stdio, so the app needs only a command (usually ssh), opens no
ports, and never sees the backend's token.

Read-only by construction: the app can ask for the session list and a
session's messages (GET under /api/sessions) and nothing else. Nothing here
creates a session, prompts the agent or spends a model call.

The backend lives exactly as long as this process: stdin closing (the app
quit, ssh dropped) stops it, with every child it started. So does silence:
a Mac that went to sleep can leave ssh half-open for hours, so a minute
without a word from the app counts as gone.

Usage:  za3tar_live.py PROFILE

Config (environment):
  ZA3TAR_LIVE_HERMES  the hermes executable (default: hermes on PATH)
  ZA3TAR_LIVE_USER    when started as root, re-run as this user, so the
                      backend reads that user's profiles
  ZA3TAR_LIVE_QUIET   seconds without a word from the app before stopping
                      (default 60; the app pings every 15)

App -> script, one JSON object per line:
  {"id": 1, "get": "/api/sessions?order=recent&limit=8"}
  {"id": 2, "ping": true}

Script -> app:
  {"status": "starting"}, then {"status": "live", "profile": "jello"}
  {"id": 1, "result": {...}}  or  {"id": 1, "error": "..."}
  {"event": "sessions.changed"}   (or cron.changed; re-fetch on these)
  {"status": "down", "error": "..."} and exit 1 when the backend goes away
"""

import collections
import json
import os
import pwd
import queue
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
import urllib.request

READY = re.compile(r"(?<!\w)HERMES_(?:BACKEND|DASHBOARD)_READY port=(\d+)")
# GET only, and only the session list, one session, or its messages.
ALLOWED = re.compile(
    r"^/api/sessions(?:/[A-Za-z0-9_.:-]+(?:/messages)?)?(?:\?[A-Za-z0-9_=&%.,:-]*)?$"
)
# Hermes broadcasts other *.changed events (skins, pets…); these are the ones
# that mean "what the assistant is doing moved".
EVENTS = {"sessions.changed", "cron.changed"}
START_TIMEOUT = 90

_out = threading.Lock()


def emit(obj):
    with _out:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def allowed(path):
    return isinstance(path, str) and bool(ALLOWED.match(path)) and ".." not in path


def ready_port(line):
    m = READY.search(line)
    return int(m.group(1)) if m else None


def handle(msg, fetch):
    """One request from the app -> its reply. `fetch(path)` does the GET."""
    rid = msg.get("id")
    if msg.get("ping"):
        return {"id": rid, "result": "pong"}
    path = msg.get("get")
    if path is None:
        return {"id": rid, "error": "only get and ping are supported"}
    if not allowed(path):
        return {"id": rid, "error": f"not allowed: {path}"}
    try:
        return {"id": rid, "result": fetch(path)}
    except Exception as e:  # noqa: BLE001 — every failure goes back as a reply
        return {"id": rid, "error": str(e) or e.__class__.__name__}


class Backend:
    def __init__(self, hermes, profile):
        self.profile = profile
        self.token = secrets.token_hex(32)
        self.tail = collections.deque(maxlen=5)
        self.port = queue.Queue()
        self.done = threading.Event()
        self.reason = None
        self.ws = None
        self.base = None
        self.heard = time.monotonic()
        env = dict(os.environ, HERMES_DASHBOARD_SESSION_TOKEN=self.token)
        # With HERMES_DESKTOP set, serve runs its own cron ticker and races the
        # gateway for scheduled jobs. --isolated keeps it off the machine-wide
        # dashboard so it watches this profile's sessions.
        env.pop("HERMES_DESKTOP", None)
        self.proc = subprocess.Popen(
            [hermes, "--profile", profile, "serve", "--isolated",
             "--host", "127.0.0.1", "--port", "0"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
            text=True,
            errors="replace",
            start_new_session=True,
        )
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        threading.Thread(target=self._drain, daemon=True).start()

    def stop(self, reason=None):
        # the first stop wins: closing on purpose also ends the socket and
        # the backend, and those are not failures
        if reason and not self.done.is_set():
            self.reason = reason
        self.done.set()

    def _drain(self):
        # Keep reading so the pipe never fills; the port is on one line.
        for line in self.proc.stdout:
            self.tail.append(line.strip()[:200])
            port = ready_port(line)
            if port:
                self.port.put(port)
        code = self.proc.wait()
        last = " / ".join(t for t in self.tail if t)
        self.stop(f"hermes serve exited ({code}): {last}"[:400])
        self.port.put(None)

    def connect(self):
        deadline = time.monotonic() + START_TIMEOUT
        while True:
            if self.done.is_set():
                return False
            try:
                port = self.port.get(timeout=1)
                break
            except queue.Empty:
                if time.monotonic() > deadline:
                    raise RuntimeError("hermes serve did not start in time")
        if port is None:
            raise RuntimeError(self.reason or "hermes serve exited")
        # Hermes's own environment has it; imported here so a backend that
        # never came up reports its own error
        from websockets.sync.client import connect

        self.base = f"http://127.0.0.1:{port}"
        self.ws = connect(
            f"ws://127.0.0.1:{port}/api/ws?token={self.token}",
            open_timeout=20,
            ping_interval=20,
            max_size=None,
        )
        first = json.loads(self.ws.recv(timeout=20))
        if (first.get("params") or {}).get("type") != "gateway.ready":
            raise RuntimeError("hermes did not say ready")
        threading.Thread(target=self._events, daemon=True).start()
        return True

    def _events(self):
        try:
            for raw in self.ws:
                try:
                    msg = json.loads(raw)
                except ValueError:
                    continue
                kind = (msg.get("params") or {}).get("type")
                if msg.get("method") == "event" and kind in EVENTS:
                    emit({"event": kind})
        except Exception:  # noqa: BLE001 — a dropped socket ends the line
            pass
        self.stop("hermes closed the connection")

    def fetch(self, path):
        if self.base is None:
            raise RuntimeError("not live yet")
        req = urllib.request.Request(
            self.base + path, headers={"X-Hermes-Session-Token": self.token}
        )
        with self.opener.open(req, timeout=20) as r:
            return json.loads(r.read())

    def close(self):
        if self.ws is not None:
            try:
                self.ws.close()
            except Exception:  # noqa: BLE001
                pass
        if self.proc.poll() is None:
            # serve starts MCP servers of its own; take the whole group down
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def serve_app(backend):
    def reply(msg):
        emit(handle(msg, backend.fetch))

    for line in sys.stdin:
        backend.heard = time.monotonic()
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if isinstance(msg, dict):
            threading.Thread(target=reply, args=(msg,), daemon=True).start()
    backend.stop()  # stdin closed: the app is gone


def watch_quiet(backend, quiet):
    # the app pings every 15s; a minute of silence means it is gone
    while not backend.done.wait(1):
        if time.monotonic() - backend.heard > quiet:
            backend.stop()


def main(argv):
    user = os.environ.get("ZA3TAR_LIVE_USER")
    if user and os.geteuid() == 0:
        # ssh arrives as root; the backend must run as the agent's user
        os.execvp("runuser", ["runuser", "-u", user, "--", sys.executable,
                              os.path.abspath(__file__), *argv])
    if len(argv) != 1:
        emit({"status": "down", "error": "usage: za3tar_live.py PROFILE"})
        return 2
    os.environ["HOME"] = pwd.getpwuid(os.geteuid()).pw_dir

    def on_signal(*_):
        raise SystemExit(0)

    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, on_signal)

    emit({"status": "starting"})
    try:
        backend = Backend(os.environ.get("ZA3TAR_LIVE_HERMES", "hermes"), argv[0])
    except OSError as e:
        emit({"status": "down", "error": f"cannot start hermes: {e}"})
        return 1
    threading.Thread(target=serve_app, args=(backend,), daemon=True).start()
    quiet = float(os.environ.get("ZA3TAR_LIVE_QUIET", "60"))
    threading.Thread(target=watch_quiet, args=(backend, quiet), daemon=True).start()
    try:
        if backend.connect():
            emit({"status": "live", "profile": backend.profile})
        while not backend.done.wait(1):
            pass
    except Exception as e:  # noqa: BLE001
        backend.stop(str(e) or e.__class__.__name__)
    finally:
        backend.close()
    if backend.reason:
        emit({"status": "down", "error": backend.reason})
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
