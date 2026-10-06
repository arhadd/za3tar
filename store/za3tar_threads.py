#!/usr/bin/env python3
"""za3tar-threads — one record for the threads a workspace is moving.

The app keeps a "where it stands" line per thread. Once more than one writer
moves those lines (the app, an agent on a server, a nightly job, a person
editing a markdown map), they need one record they all read and write. This
is that record: a SQLite file on a server, reached as a command — locally by
the agent, over ssh by the app.

Every accepted write is a new version and the old one stays in history. An
update names the version it read; if the thread moved since, the write is
refused (exit 3) and handed back the current record, so nothing silently wins.

Optionally, chosen threads are mirrored into a markdown map file (one line per
thread). Hand edits to a mirrored line come back in as a write on the next
`mirror`, so people and agents that edit the file keep working.

Config (environment):
  ZA3TAR_THREADS_DB      the SQLite file (required)
  ZA3TAR_THREADS_MIRROR  markdown file to mirror flagged threads into
  ZA3TAR_THREADS_EXPORT  JSON snapshot rewritten after every change
  ZA3TAR_THREADS_USER    when started as root, re-run as this user, so the
                         files keep one owner

Commands (output is JSON):
  list [--workspace W] [--include-deleted]
  get ID
  history ID
  create --workspace W --title T [--stands S] [--owner O] [--status S]
         [--id ID] --by WHO [--source SRC]
  update ID --expect N [--title T] [--stands S] [--owner O] [--status S]
         --by WHO [--source SRC]
  delete ID --expect N --by WHO [--source SRC]
  put                 one write as JSON on stdin:
                      {"op": "create"|"update"|"delete", ...the same fields,
                       "where_it_stands", "expected_version"}
  mirror              sync the mirror file both ways
  mirror-add ID | mirror-remove ID

Exit codes: 0 ok · 2 bad input · 3 version conflict · 4 no such thread.
"""

import argparse
import fcntl
import json
import os
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

STATUSES = ("active", "parked", "done")

SCHEMA = """
CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  workspace TEXT NOT NULL,
  title TEXT NOT NULL,
  where_it_stands TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  moved_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT '',
  deleted INTEGER NOT NULL DEFAULT 0,
  mirror INTEGER NOT NULL DEFAULT 0,
  mirrored_line TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS thread_versions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  record TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS refused (
  at TEXT NOT NULL,
  id TEXT NOT NULL,
  writer TEXT NOT NULL,
  base_version INTEGER,
  current_version INTEGER NOT NULL,
  attempt TEXT NOT NULL
);
"""

# what a reader sees; the mirror bookkeeping columns stay inside
PUBLIC = (
    "id", "workspace", "title", "where_it_stands", "owner", "status",
    "version", "updated_by", "updated_at", "moved_at", "created_at",
    "provenance", "deleted", "mirror",
)


class Refused(Exception):
    def __init__(self, code, message, current=None):
        super().__init__(message)
        self.code = code
        self.current = current


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def epoch(iso):
    try:
        return int(datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")
                   .replace(tzinfo=timezone.utc).timestamp())
    except (TypeError, ValueError):
        return 0


def slug(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s or "t"


def connect(path):
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def public(row):
    if row is None:
        return None
    out = {k: row[k] for k in PUBLIC}
    out["deleted"] = bool(out["deleted"])
    out["mirror"] = bool(out["mirror"])
    try:
        out["provenance"] = json.loads(out["provenance"])
    except ValueError:
        pass
    # epoch seconds alongside the ISO strings, for clients without a date parser
    out["created_ts"] = epoch(row["created_at"])
    out["moved_ts"] = epoch(row["moved_at"])
    return out


def fetch(db, tid):
    return db.execute("SELECT * FROM threads WHERE id = ?", (tid,)).fetchone()


def snapshot(db, tid):
    row = fetch(db, tid)
    db.execute(
        "INSERT INTO thread_versions (id, version, record) VALUES (?, ?, ?)",
        (tid, row["version"], json.dumps(public(row), ensure_ascii=False)),
    )


def clean_status(status):
    if status not in STATUSES:
        raise Refused(2, f"unknown status {status!r} (one of {', '.join(STATUSES)})")
    return status


def check_title(db, workspace, title, tid=None):
    if not title.strip():
        raise Refused(2, "a thread needs a title")
    clash = db.execute(
        "SELECT id FROM threads WHERE workspace = ? AND title = ? AND deleted = 0 AND id != ?",
        (workspace, title.strip(), tid or ""),
    ).fetchone()
    if clash:
        raise Refused(2, f"{clash['id']} already has that title in {workspace}")


def provenance(by, source):
    return json.dumps({"by": by, "source": source or ""}, ensure_ascii=False)


def create(db, op):
    workspace = (op.get("workspace") or "").strip()
    title = (op.get("title") or "").strip()
    by = (op.get("by") or "").strip()
    if not workspace or not by:
        raise Refused(2, "create needs workspace and by")
    check_title(db, workspace, title)
    status = clean_status(op.get("status") or "active")
    tid = (op.get("id") or "").strip()
    if tid:
        if fetch(db, tid):
            raise Refused(2, f"{tid} already exists")
    else:
        base = f"{workspace}-{slug(title)}"
        tid, n = base, 2
        while fetch(db, tid):
            tid, n = f"{base}-{n}", n + 1
    stamp = now_iso()
    # migrations may carry the date a thread last really moved
    moved = op.get("moved_at") or stamp
    db.execute(
        "INSERT INTO threads (id, workspace, title, where_it_stands, owner, status,"
        " version, updated_by, updated_at, moved_at, created_at, provenance)"
        " VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
        (tid, workspace, title, (op.get("where_it_stands") or "").strip(),
         (op.get("owner") or "").strip(), status, by, stamp, moved,
         op.get("created_at") or stamp, provenance(by, op.get("source"))),
    )
    snapshot(db, tid)
    return fetch(db, tid)


def current_or_refuse(db, op):
    tid = (op.get("id") or "").strip()
    row = fetch(db, tid)
    if row is None or row["deleted"]:
        raise Refused(4, f"no thread {tid!r}")
    expected = op.get("expected_version")
    if not isinstance(expected, int):
        raise Refused(2, "an update needs expected_version (the version you read)")
    if expected != row["version"]:
        db.execute(
            "INSERT INTO refused (at, id, writer, base_version, current_version, attempt)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (now_iso(), tid, op.get("by") or "", expected, row["version"],
             json.dumps(op, ensure_ascii=False)),
        )
        db.commit()
        raise Refused(3, f"{tid} is at version {row['version']}, you read {expected}",
                      current=public(row))
    return row


def update(db, op):
    row = current_or_refuse(db, op)
    by = (op.get("by") or "").strip()
    if not by:
        raise Refused(2, "update needs by")
    fields = {
        "title": row["title"], "where_it_stands": row["where_it_stands"],
        "owner": row["owner"], "status": row["status"],
    }
    for k in fields:
        if op.get(k) is not None:
            fields[k] = op[k].strip()
    clean_status(fields["status"])
    check_title(db, row["workspace"], fields["title"], row["id"])
    if all(fields[k] == row[k] for k in fields):
        return row  # nothing moved: no new version
    stamp = now_iso()
    moved = (fields["where_it_stands"] != row["where_it_stands"]
             or fields["status"] != row["status"])
    db.execute(
        "UPDATE threads SET title = ?, where_it_stands = ?, owner = ?, status = ?,"
        " version = version + 1, updated_by = ?, updated_at = ?, moved_at = ?,"
        " provenance = ? WHERE id = ?",
        (fields["title"], fields["where_it_stands"], fields["owner"], fields["status"],
         by, stamp, stamp if moved else row["moved_at"],
         provenance(by, op.get("source")), row["id"]),
    )
    snapshot(db, row["id"])
    return fetch(db, row["id"])


def delete(db, op):
    row = current_or_refuse(db, op)
    by = (op.get("by") or "").strip()
    if not by:
        raise Refused(2, "delete needs by")
    db.execute(
        "UPDATE threads SET deleted = 1, version = version + 1, updated_by = ?,"
        " updated_at = ?, provenance = ? WHERE id = ?",
        (by, now_iso(), provenance(by, op.get("source")), row["id"]),
    )
    snapshot(db, row["id"])
    return fetch(db, row["id"])


# ---- mirror: chosen threads as lines in a markdown map ----------------------

LINE = re.compile(r"^- \*\*(?P<title>.+?)\*\*(?P<tag>\s*\[[^\]]*\])?\s*—\s*(?P<stands>.*)$")
MARK = re.compile(r"\s*<!-- thread:(?P<id>\S+) v(?P<v>\d+) -->\s*$")
DATED = re.compile(r"\s*\((?:UPDATED|NEW)\b[^)]*\)\s*$")


def render(row):
    day = (row["moved_at"] or "")[:10]
    head = f"{row['title']} (UPDATED {day})" if day else row["title"]
    return f"- **{head}** — {row['where_it_stands']}"


def parse_line(text):
    m = LINE.match(text)
    if not m:
        return None
    return DATED.sub("", m.group("title")).strip(), m.group("stands").strip()


def find_line(lines, row):
    tag = f"<!-- thread:{row['id']} v"
    for i, line in enumerate(lines):
        if tag in line:
            return i
    for i, line in enumerate(lines):
        parsed = parse_line(MARK.sub("", line))
        if parsed and parsed[0] == row["title"]:
            return i
    return None


def write_atomic(path, text):
    mode = os.stat(path).st_mode & 0o777 if os.path.exists(path) else 0o660
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def mirror(db, path):
    """Hand edits in, store out. Returns a report of what happened."""
    report = {"edits_taken": [], "edits_refused": [], "re_added": []}
    if not path or not os.path.exists(path):
        return report
    with open(path + ".lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        with open(path) as f:
            text = f.read()
        lines = text.split("\n")
        rows = db.execute(
            "SELECT * FROM threads WHERE mirror = 1 AND deleted = 0 ORDER BY id"
        ).fetchall()
        for row in rows:
            i = find_line(lines, row)
            if i is not None:
                base = MARK.sub("", lines[i])
                mark = MARK.search(lines[i])
                if row["mirrored_line"] and base != row["mirrored_line"]:
                    parsed = parse_line(base)
                    seen = int(mark.group("v")) if mark else None
                    if parsed and (parsed[0], parsed[1]) != (row["title"], row["where_it_stands"]):
                        op = {"id": row["id"], "expected_version": seen if seen is not None
                              else row["version"], "title": parsed[0],
                              "where_it_stands": parsed[1], "by": "markdown-edit",
                              "source": f"hand edit in {os.path.basename(path)}"}
                        try:
                            row = update(db, op)
                            report["edits_taken"].append(row["id"])
                        except Refused as e:
                            report["edits_refused"].append({"id": row["id"], "why": str(e)})
                            row = fetch(db, row["id"])
            line = render(row)
            if i is None:
                lines += ["", line] if lines and lines[-1].strip() else [line]
                report["re_added"].append(row["id"])
            else:
                lines[i] = line
            lines[-1 if i is None else i] += f" <!-- thread:{row['id']} v{row['version']} -->"
            db.execute("UPDATE threads SET mirrored_line = ? WHERE id = ?", (line, row["id"]))
        db.commit()
        out = "\n".join(lines)
        if out != text:
            write_atomic(path, out)
    return report


def export(db, path):
    if not path:
        return
    rows = db.execute("SELECT * FROM threads WHERE deleted = 0 ORDER BY workspace, id").fetchall()
    out = json.dumps({"generated_by": "za3tar-threads; do not edit",
                      "threads": [public(r) for r in rows]},
                     ensure_ascii=False, indent=2) + "\n"
    if os.path.exists(path):
        with open(path) as f:
            if f.read() == out:
                return
    write_atomic(path, out)


# ---- command line -----------------------------------------------------------

def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")


def after_write(db):
    mirror(db, os.environ.get("ZA3TAR_THREADS_MIRROR"))
    export(db, os.environ.get("ZA3TAR_THREADS_EXPORT"))


def parse(argv):
    p = argparse.ArgumentParser(prog="za3tar-threads")
    sub = p.add_subparsers(dest="cmd", required=True)
    ls = sub.add_parser("list")
    ls.add_argument("--workspace")
    ls.add_argument("--include-deleted", action="store_true")
    for name in ("get", "history", "mirror-add", "mirror-remove"):
        sub.add_parser(name).add_argument("id")
    c = sub.add_parser("create")
    c.add_argument("--workspace", required=True)
    c.add_argument("--title", required=True)
    c.add_argument("--id")
    for name in ("update", "delete"):
        u = sub.add_parser(name)
        u.add_argument("id")
        u.add_argument("--expect", type=int, required=True)
    for cmd in (c, sub.choices["update"]):
        if cmd is not c:
            cmd.add_argument("--title")
        cmd.add_argument("--stands")
        cmd.add_argument("--owner")
        cmd.add_argument("--status")
    for cmd in (c, sub.choices["update"], sub.choices["delete"]):
        cmd.add_argument("--by", required=True)
        cmd.add_argument("--source")
    sub.add_parser("put")
    sub.add_parser("mirror")
    return p.parse_args(argv)


def run(argv):
    args = parse(argv)
    db = connect(os.environ["ZA3TAR_THREADS_DB"])
    try:
        if args.cmd == "list":
            q, params = "SELECT * FROM threads WHERE 1 = 1", []
            if not args.include_deleted:
                q += " AND deleted = 0"
            if args.workspace:
                q += " AND workspace = ?"
                params.append(args.workspace)
            emit([public(r) for r in db.execute(q + " ORDER BY moved_at DESC", params)])
        elif args.cmd == "get":
            row = fetch(db, args.id)
            if row is None:
                raise Refused(4, f"no thread {args.id!r}")
            emit(public(row))
        elif args.cmd == "history":
            rows = db.execute(
                "SELECT record FROM thread_versions WHERE id = ? ORDER BY version", (args.id,)
            ).fetchall()
            if not rows:
                raise Refused(4, f"no thread {args.id!r}")
            emit([json.loads(r["record"]) for r in rows])
        elif args.cmd == "mirror":
            emit(mirror(db, os.environ.get("ZA3TAR_THREADS_MIRROR")))
            export(db, os.environ.get("ZA3TAR_THREADS_EXPORT"))
        elif args.cmd in ("mirror-add", "mirror-remove"):
            if fetch(db, args.id) is None:
                raise Refused(4, f"no thread {args.id!r}")
            db.execute("UPDATE threads SET mirror = ?, mirrored_line = '' WHERE id = ?",
                       (1 if args.cmd == "mirror-add" else 0, args.id))
            db.commit()
            after_write(db)
            emit(public(fetch(db, args.id)))
        else:
            if args.cmd == "put":
                try:
                    op = json.load(sys.stdin)
                except ValueError as e:
                    raise Refused(2, f"put needs one JSON object on stdin ({e})")
                if not isinstance(op, dict):
                    raise Refused(2, "put needs one JSON object on stdin")
                kind = op.get("op")
            else:
                kind = args.cmd
                op = {k: v for k, v in vars(args).items() if v is not None and k != "cmd"}
                if "stands" in op:
                    op["where_it_stands"] = op.pop("stands")
                if "expect" in op:
                    op["expected_version"] = op.pop("expect")
            handler = {"create": create, "update": update, "delete": delete}.get(kind)
            if handler is None:
                raise Refused(2, f"unknown op {kind!r}")
            row = handler(db, op)
            db.commit()
            after_write(db)
            emit(public(fetch(db, row["id"])))
        return 0
    except Refused as e:
        db.rollback()
        out = {"error": str(e)}
        if e.current is not None:
            out["current"] = e.current
        emit(out)
        return e.code
    finally:
        db.close()


def main():
    user = os.environ.get("ZA3TAR_THREADS_USER")
    if user and os.geteuid() == 0:
        # ssh arrives as root; files must stay owned by the agent's user
        os.execvp("runuser", ["runuser", "-u", user, "--", sys.executable,
                              os.path.abspath(__file__), *sys.argv[1:]])
    if not os.environ.get("ZA3TAR_THREADS_DB"):
        emit({"error": "ZA3TAR_THREADS_DB is not set"})
        return 2
    return run(sys.argv[1:])


if __name__ == "__main__":
    sys.exit(main())
