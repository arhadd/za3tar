"""Tests for za3tar-live. Run: python3 -m unittest live/test_za3tar_live.py"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import za3tar_live as zl  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "za3tar_live.py")


class Allowed(unittest.TestCase):
    def test_reads_sessions(self):
        for p in (
            "/api/sessions",
            "/api/sessions?order=recent&limit=8&exclude_sources=cron",
            "/api/sessions/20261011_101500_ab12cd",
            "/api/sessions/20261011_101500_ab12cd/messages?limit=20&order=latest",
        ):
            self.assertTrue(zl.allowed(p), p)

    def test_refuses_everything_else(self):
        for p in (
            "/api/config",
            "/api/sessions/x/delete",
            "/api/sessions/../config",
            "/api/sessions/..",
            "/api/sessionsX",
            "/api/cron/jobs",
            "http://elsewhere/api/sessions",
            "/api/sessions?x=1#frag",
            "/api/sessions/a b",
            None,
            42,
        ):
            self.assertFalse(zl.allowed(p), p)


class Ready(unittest.TestCase):
    def test_reads_the_port(self):
        self.assertEqual(zl.ready_port("HERMES_BACKEND_READY port=41234\n"), 41234)
        self.assertEqual(zl.ready_port("x HERMES_DASHBOARD_READY port=9"), 9)
        self.assertIsNone(zl.ready_port("  Hermes backend listening on 127.0.0.1:41234"))
        self.assertIsNone(zl.ready_port("MY_HERMES_BACKEND_READY port=1"))


class Handle(unittest.TestCase):
    def test_ping(self):
        self.assertEqual(zl.handle({"id": 3, "ping": True}, None), {"id": 3, "result": "pong"})

    def test_get_goes_through(self):
        seen = []

        def fetch(path):
            seen.append(path)
            return {"sessions": []}

        r = zl.handle({"id": 1, "get": "/api/sessions?limit=2"}, fetch)
        self.assertEqual(r, {"id": 1, "result": {"sessions": []}})
        self.assertEqual(seen, ["/api/sessions?limit=2"])

    def test_refused_path_never_fetches(self):
        def fetch(path):
            raise AssertionError("fetched " + path)

        r = zl.handle({"id": 1, "get": "/api/config"}, fetch)
        self.assertEqual(r["id"], 1)
        self.assertIn("not allowed", r["error"])

    def test_no_writes(self):
        r = zl.handle({"id": 2, "rpc": "prompt.submit", "params": {}}, None)
        self.assertIn("only get and ping", r["error"])

    def test_fetch_failure_is_a_reply(self):
        def fetch(path):
            raise OSError("connection refused")

        r = zl.handle({"id": 5, "get": "/api/sessions"}, fetch)
        self.assertEqual(r, {"id": 5, "error": "connection refused"})


class Process(unittest.TestCase):
    def run_script(self, args, hermes):
        env = dict(os.environ, ZA3TAR_LIVE_HERMES=hermes)
        env.pop("ZA3TAR_LIVE_USER", None)
        # stdin stays open, as it does while the app is connected: closing it
        # means "the app is gone", which is a clean stop, not a failure
        p = subprocess.Popen(
            [sys.executable, SCRIPT, *args],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env,
        )
        timer = threading.Timer(30, p.kill)
        timer.start()
        try:
            out = p.stdout.read()
        finally:
            timer.cancel()
            p.stdin.close()
            p.wait()
        return p.returncode, [json.loads(l) for l in out.splitlines() if l.strip()]

    def test_stdin_closing_is_a_clean_stop(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "hermes")
            with open(fake, "w") as f:
                f.write("#!/bin/sh\nsleep 20\n")
            os.chmod(fake, 0o755)
            env = dict(os.environ, ZA3TAR_LIVE_HERMES=fake)
            p = subprocess.run(
                [sys.executable, SCRIPT, "jello"],
                input="", capture_output=True, text=True, env=env, timeout=30,
            )
        self.assertEqual(p.returncode, 0)
        self.assertEqual([json.loads(l) for l in p.stdout.splitlines()], [{"status": "starting"}])

    def test_missing_hermes_says_down(self):
        code, out = self.run_script(["jello"], "/nonexistent/hermes")
        self.assertEqual(code, 1)
        self.assertEqual(out[0], {"status": "starting"})
        self.assertEqual(out[-1]["status"], "down")
        self.assertIn("cannot start hermes", out[-1]["error"])

    def test_backend_that_dies_says_why(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "hermes")
            with open(fake, "w") as f:
                f.write("#!/bin/sh\necho 'profile not found: nope'\nexit 4\n")
            os.chmod(fake, 0o755)
            code, out = self.run_script(["nope"], fake)
        self.assertEqual(code, 1)
        self.assertEqual(out[-1]["status"], "down")
        self.assertIn("exited (4)", out[-1]["error"])
        self.assertIn("profile not found", out[-1]["error"])

    def test_silence_is_a_clean_stop(self):
        with tempfile.TemporaryDirectory() as d:
            fake = os.path.join(d, "hermes")
            with open(fake, "w") as f:
                f.write("#!/bin/sh\nsleep 20\n")
            os.chmod(fake, 0o755)
            env = dict(os.environ, ZA3TAR_LIVE_HERMES=fake, ZA3TAR_LIVE_QUIET="1")
            with subprocess.Popen(
                [sys.executable, SCRIPT, "jello"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env,
            ) as p:
                # stdin stays open but nothing is said: gone after a second
                code = p.wait(timeout=15)
        self.assertEqual(code, 0)

    def test_usage(self):
        code, out = self.run_script([], "hermes")
        self.assertEqual(code, 2)
        self.assertIn("usage", out[0]["error"])


if __name__ == "__main__":
    unittest.main()
