"""Tests for za3tar-threads. Run: python3 -m unittest store/test_za3tar_threads.py"""

import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import za3tar_threads as zt  # noqa: E402

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "za3tar_threads.py")

MAP = """# Map

## Work
- **Gala venue (UPDATED 2026-09-01)** — Venue shortlist of three; deposit open.
- **Other thing** — untouched by the store.
"""


class Store(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = zt.connect(os.path.join(self.dir.name, "t.db"))

    def tearDown(self):
        self.db.close()
        self.dir.cleanup()

    def make(self, **kw):
        op = {"workspace": "events", "title": "Gala venue", "by": "ala",
              "where_it_stands": "Shortlist of three."}
        op.update(kw)
        row = zt.create(self.db, op)
        self.db.commit()
        return row

    def test_create_assigns_id_and_version_one(self):
        row = self.make()
        self.assertEqual(row["id"], "events-gala-venue")
        self.assertEqual(row["version"], 1)
        again = self.make(title="Gala venue!")
        self.assertEqual(again["id"], "events-gala-venue-2")

    def test_title_is_unique_within_a_workspace(self):
        self.make()
        with self.assertRaises(zt.Refused) as e:
            self.make()
        self.assertEqual(e.exception.code, 2)
        self.make(workspace="other")  # same title elsewhere is fine

    def test_update_versions_and_keeps_history(self):
        row = self.make()
        row = zt.update(self.db, {"id": row["id"], "expected_version": 1,
                                  "where_it_stands": "Booked.", "by": "jello",
                                  "source": "whatsapp"})
        self.assertEqual(row["version"], 2)
        self.assertEqual(row["updated_by"], "jello")
        hist = [json.loads(r["record"]) for r in self.db.execute(
            "SELECT record FROM thread_versions WHERE id = ? ORDER BY version", (row["id"],))]
        self.assertEqual([h["where_it_stands"] for h in hist], ["Shortlist of three.", "Booked."])
        self.assertEqual(hist[1]["provenance"], {"by": "jello", "source": "whatsapp"})

    def test_unchanged_update_makes_no_version(self):
        row = self.make()
        row = zt.update(self.db, {"id": row["id"], "expected_version": 1,
                                  "where_it_stands": "Shortlist of three.", "by": "ala"})
        self.assertEqual(row["version"], 1)

    def test_owner_change_does_not_move_the_thread(self):
        row = self.make()
        moved = row["moved_at"]
        row = zt.update(self.db, {"id": row["id"], "expected_version": 1,
                                  "owner": "Zein", "by": "ala"})
        self.assertEqual(row["version"], 2)
        self.assertEqual(row["moved_at"], moved)

    def test_stale_write_is_refused_and_logged(self):
        row = self.make()
        zt.update(self.db, {"id": row["id"], "expected_version": 1,
                            "where_it_stands": "Booked.", "by": "jello"})
        with self.assertRaises(zt.Refused) as e:
            zt.update(self.db, {"id": row["id"], "expected_version": 1,
                                "where_it_stands": "Cancelled.", "by": "ala"})
        self.assertEqual(e.exception.code, 3)
        self.assertEqual(e.exception.current["where_it_stands"], "Booked.")
        refused = self.db.execute("SELECT * FROM refused").fetchall()
        self.assertEqual(len(refused), 1)
        self.assertEqual(refused[0]["writer"], "ala")
        self.assertEqual(zt.fetch(self.db, row["id"])["where_it_stands"], "Booked.")

    def test_update_requires_a_version(self):
        row = self.make()
        with self.assertRaises(zt.Refused) as e:
            zt.update(self.db, {"id": row["id"], "where_it_stands": "x", "by": "ala"})
        self.assertEqual(e.exception.code, 2)

    def test_unknown_status_is_refused(self):
        row = self.make()
        with self.assertRaises(zt.Refused):
            zt.update(self.db, {"id": row["id"], "expected_version": 1,
                                "status": "someday", "by": "ala"})

    def test_delete_is_a_version_not_a_hard_delete(self):
        row = self.make()
        row = zt.delete(self.db, {"id": row["id"], "expected_version": 1, "by": "ala"})
        self.assertTrue(row["deleted"])
        self.assertEqual(row["version"], 2)
        with self.assertRaises(zt.Refused) as e:
            zt.update(self.db, {"id": row["id"], "expected_version": 2,
                                "where_it_stands": "x", "by": "ala"})
        self.assertEqual(e.exception.code, 4)


class Mirror(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.db = zt.connect(os.path.join(self.dir.name, "t.db"))
        self.map = os.path.join(self.dir.name, "MAP.md")
        with open(self.map, "w") as f:
            f.write(MAP)
        os.chmod(self.map, 0o640)
        self.row = zt.create(self.db, {"workspace": "events", "title": "Gala venue",
                                       "where_it_stands": "Venue shortlist of three; deposit open.",
                                       "by": "import", "moved_at": "2026-09-01T10:00:00Z"})
        self.db.execute("UPDATE threads SET mirror = 1 WHERE id = ?", (self.row["id"],))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.dir.cleanup()

    def text(self):
        with open(self.map) as f:
            return f.read()

    def write(self, text):
        # read first, then open for writing (opening truncates)
        with open(self.map, "w") as f:
            f.write(text)

    def line(self):
        return [l for l in self.text().split("\n") if "Gala venue" in l][0]

    def test_first_mirror_tags_the_line_in_place(self):
        zt.mirror(self.db, self.map)
        self.assertEqual(
            self.line(),
            "- **Gala venue (UPDATED 2026-09-01)** — Venue shortlist of three; deposit open."
            " <!-- thread:events-gala-venue v1 -->")
        self.assertIn("- **Other thing** — untouched by the store.", self.text())
        self.assertEqual(os.stat(self.map).st_mode & 0o777, 0o640)

    def test_mirror_is_stable(self):
        zt.mirror(self.db, self.map)
        first = self.text()
        report = zt.mirror(self.db, self.map)
        self.assertEqual(self.text(), first)
        self.assertEqual(report, {"edits_taken": [], "edits_refused": [], "re_added": []})

    def test_store_write_reaches_the_file(self):
        zt.mirror(self.db, self.map)
        zt.update(self.db, {"id": self.row["id"], "expected_version": 1,
                            "where_it_stands": "Booked.", "by": "jello"})
        zt.mirror(self.db, self.map)
        self.assertIn("— Booked. <!-- thread:events-gala-venue v2 -->", self.line())

    def test_hand_edit_comes_back_as_a_write(self):
        zt.mirror(self.db, self.map)
        self.write(self.text().replace("deposit open.", "deposit paid."))
        report = zt.mirror(self.db, self.map)
        self.assertEqual(report["edits_taken"], ["events-gala-venue"])
        row = zt.fetch(self.db, "events-gala-venue")
        self.assertEqual(row["version"], 2)
        self.assertEqual(row["updated_by"], "markdown-edit")
        self.assertEqual(row["where_it_stands"], "Venue shortlist of three; deposit paid.")
        self.assertIn("v2 -->", self.line())

    def test_hand_edit_of_a_stale_line_is_refused(self):
        zt.mirror(self.db, self.map)
        stale = self.text()
        zt.update(self.db, {"id": self.row["id"], "expected_version": 1,
                            "where_it_stands": "Booked.", "by": "jello"})
        zt.mirror(self.db, self.map)
        # someone writes back an old copy of the whole file with their own change
        self.write(stale.replace("deposit open.", "deposit paid."))
        report = zt.mirror(self.db, self.map)
        self.assertEqual(report["edits_refused"][0]["id"], "events-gala-venue")
        self.assertEqual(zt.fetch(self.db, "events-gala-venue")["where_it_stands"], "Booked.")
        self.assertIn("— Booked. <!-- thread:events-gala-venue v2 -->", self.line())

    def test_touching_only_the_date_is_not_an_edit(self):
        zt.mirror(self.db, self.map)
        self.write(self.text().replace("UPDATED 2026-09-01", "UPDATED 2026-10-06"))
        report = zt.mirror(self.db, self.map)
        self.assertEqual(report["edits_taken"], [])
        self.assertEqual(zt.fetch(self.db, "events-gala-venue")["version"], 1)

    def test_a_lost_line_is_added_back(self):
        zt.mirror(self.db, self.map)
        self.write("\n".join(l for l in self.text().split("\n") if "Gala venue" not in l))
        report = zt.mirror(self.db, self.map)
        self.assertEqual(report["re_added"], ["events-gala-venue"])
        self.assertEqual(self.text().count("Gala venue"), 1)


class CommandLine(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.env = dict(os.environ, ZA3TAR_THREADS_DB=os.path.join(self.dir.name, "t.db"),
                        ZA3TAR_THREADS_EXPORT=os.path.join(self.dir.name, "export.json"))
        self.env.pop("ZA3TAR_THREADS_USER", None)

    def tearDown(self):
        self.dir.cleanup()

    def run_cli(self, *args, stdin=None):
        p = subprocess.run([sys.executable, SCRIPT, *args], input=stdin, env=self.env,
                           capture_output=True, text=True)
        return p.returncode, json.loads(p.stdout)

    def test_put_create_update_conflict(self):
        code, row = self.run_cli("put", stdin=json.dumps(
            {"op": "create", "workspace": "w", "title": "T", "where_it_stands": "a", "by": "app"}))
        self.assertEqual((code, row["version"]), (0, 1))
        code, row = self.run_cli("update", row["id"], "--expect", "1", "--stands", "b",
                                 "--by", "jello")
        self.assertEqual((code, row["where_it_stands"], row["version"]), (0, "b", 2))
        code, out = self.run_cli("put", stdin=json.dumps(
            {"op": "update", "id": "w-t", "expected_version": 1, "where_it_stands": "c",
             "by": "app"}))
        self.assertEqual(code, 3)
        self.assertEqual(out["current"]["where_it_stands"], "b")
        code, hist = self.run_cli("history", "w-t")
        self.assertEqual([h["version"] for h in hist], [1, 2])
        with open(self.env["ZA3TAR_THREADS_EXPORT"]) as f:
            self.assertEqual(json.load(f)["threads"][0]["where_it_stands"], "b")

    def test_errors_have_codes(self):
        self.assertEqual(self.run_cli("get", "nope")[0], 4)
        self.assertEqual(self.run_cli("put", stdin="not json")[0], 2)
        self.assertEqual(self.run_cli("put", stdin='{"op": "explode"}')[0], 2)


if __name__ == "__main__":
    unittest.main()
