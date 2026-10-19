// Meetings: every note across every workspace, newest first, each with the
// workspace and project it is filed under right on its row. Filing is a pick
// from two lists (or a new project, typed in place), so sorting a backlog
// needs no meeting opened. "send" hands a filed meeting to the assistant,
// which puts its outcomes where that team works.
import { useEffect, useState } from "react";
import { Button, Empty, Field } from "../ui";
import { fmtDur, relDate } from "../format";
import type { Summary, Thread, Workspace } from "../types";

const FILTER_KEY = "za3tar.library.filter";
const NEW = "__new__";

/** when (unix seconds) a meeting was last handed to the assistant, and under
 * which project */
export type Sent = Record<string, { at: number; thread: string }>;

export function LibraryView({
  library,
  workspaces,
  threads,
  onOpen,
  onFile,
  onNewProject,
  onSend,
  canSend,
  sent,
  busy,
}: {
  /** every meeting, across all workspaces */
  library: Summary[];
  workspaces: Workspace[];
  threads: Thread[];
  onOpen: (s: Summary) => void;
  onFile: (dir: string, workspace: string, thread: string) => Promise<void>;
  onNewProject: (
    dir: string,
    workspace: string,
    title: string,
  ) => Promise<void>;
  onSend: (s: Summary) => Promise<void>;
  /** an assistant is connected */
  canSend: boolean;
  sent: Sent;
  busy: boolean;
}) {
  const [q, setQ] = useState("");
  const [ws, setWs] = useState("");
  const [filter, setFilter] = useState<"all" | "unfiled">(() => {
    try {
      return localStorage.getItem(FILTER_KEY) === "unfiled" ? "unfiled" : "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, filter);
    } catch {
      /* fine */
    }
  }, [filter]);
  // the row whose project list became a "new project" box
  const [naming, setNaming] = useState<{ dir: string; title: string } | null>(
    null,
  );

  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;
  const unfiled = library.filter((s) => !s.thread).length;
  const needle = q.trim().toLowerCase();
  const shown = library
    .filter((s) => filter === "all" || !s.thread)
    .filter((s) => !ws || s.workspace === ws)
    .filter(
      (s) =>
        !needle ||
        s.title.toLowerCase().includes(needle) ||
        s.person.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.created - a.created);

  // one heading per month keeps a long list scannable
  const month = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  const groups: { label: string; rows: Summary[] }[] = [];
  for (const s of shown) {
    const label = month(s.created);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.rows.push(s);
    else groups.push({ label, rows: [s] });
  }

  // a project list for a meeting: the workspace's live projects, plus the
  // one it is filed under even if that one is done or still an idea
  const projectsFor = (s: Summary) =>
    threads.filter(
      (t) =>
        t.workspace === s.workspace &&
        (t.status === "active" || t.status === "parked" || t.id === s.thread),
    );

  const select =
    "min-w-0 rounded-md border border-line bg-white px-1.5 py-1 text-[12px] text-ink outline-none focus:border-ink disabled:opacity-50";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-[12px]">
          {(["all", "unfiled"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`rounded-full px-2.5 py-1 ${
                filter === v ? "bg-ink text-paper" : "text-olive hover:text-ink"
              }`}
            >
              {v === "all"
                ? `all · ${library.length}`
                : `no project · ${unfiled}`}
            </button>
          ))}
        </div>
        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          aria-label="show one workspace"
          className="rounded-md border border-line bg-white px-1.5 py-1 text-[12px] text-ink outline-none focus:border-ink"
        >
          <option value="">every workspace</option>
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Field
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="find by title or person"
          className="ml-auto w-56 py-1 text-[12px]"
        />
      </div>

      {library.length === 0 ? (
        <Empty>No meetings yet. Hit Record when one starts.</Empty>
      ) : shown.length === 0 ? (
        <Empty>
          {needle
            ? `Nothing matches "${q}".`
            : filter === "unfiled"
              ? "Every meeting here is filed under a project."
              : `No meetings in ${wsName(ws)} yet.`}
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.label} className="flex flex-col gap-1">
            <h3 className="eyebrow px-1 pb-0.5 text-olive">{g.label}</h3>
            {g.rows.map((s) => {
              const was = sent[s.dir];
              const sentHere = !!was && was.thread === s.thread;
              return (
                <div
                  key={s.dir}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-paper px-4 py-2.5"
                >
                  <button
                    onClick={() => onOpen(s)}
                    className="flex min-w-[200px] flex-1 flex-col gap-0.5 text-left"
                  >
                    <span
                      dir="auto"
                      className="arabic truncate text-start text-[14px] font-medium hover:underline"
                    >
                      {s.title || "Untitled note"}
                    </span>
                    <span className="text-[12px] text-olive">
                      {s.person ? `${s.person} · ` : ""}
                      {relDate(s.created)}
                      {s.has_audio
                        ? ` · ${fmtDur(s.duration_secs)}`
                        : " · pasted"}
                      {!s.has_notes ? " · no notes yet" : ""}
                    </span>
                  </button>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <select
                      value={s.workspace}
                      onChange={(e) => {
                        const next = e.target.value;
                        // a project belongs to one workspace: moving the
                        // meeting elsewhere leaves it without one
                        void onFile(s.dir, next, "");
                      }}
                      disabled={busy}
                      aria-label="workspace"
                      className={`${select} w-[120px]`}
                    >
                      {!workspaces.some((w) => w.id === s.workspace) && (
                        <option value={s.workspace}>
                          {s.workspace || "—"}
                        </option>
                      )}
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                    {naming?.dir === s.dir ? (
                      <input
                        autoFocus
                        dir="auto"
                        value={naming.title}
                        onChange={(e) =>
                          setNaming({ dir: s.dir, title: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setNaming(null);
                          if (e.key === "Enter") {
                            const title = naming.title.trim();
                            setNaming(null);
                            if (title)
                              void onNewProject(s.dir, s.workspace, title);
                          }
                        }}
                        onBlur={() => setNaming(null)}
                        placeholder="new project, then ↵"
                        className={`${select} arabic w-[190px] text-start`}
                      />
                    ) : (
                      <select
                        value={s.thread}
                        onChange={(e) => {
                          const next = e.target.value;
                          if (next === NEW)
                            setNaming({ dir: s.dir, title: "" });
                          else void onFile(s.dir, s.workspace, next);
                        }}
                        disabled={busy}
                        aria-label="project"
                        className={`${select} w-[190px] ${s.thread ? "" : "text-olive"}`}
                      >
                        <option value="">no project</option>
                        {projectsFor(s).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                        <option value={NEW}>+ new project…</option>
                      </select>
                    )}
                    {canSend && (
                      <Button
                        tone={sentHere ? "ghost" : "quiet"}
                        size="sm"
                        onClick={() => void onSend(s)}
                        disabled={busy || !s.thread || !s.has_notes}
                        title={
                          !s.thread
                            ? "file it under a project first"
                            : !s.has_notes
                              ? "open it and make notes first"
                              : sentHere
                                ? `sent ${relDate(was.at)} — send again to update it`
                                : `hand its decisions and to-dos to your assistant, filed under this project. Nothing goes on your calendar.${
                                    was
                                      ? " (Sent before under another project.)"
                                      : ""
                                  }`
                        }
                        className="w-[76px]"
                      >
                        {sentHere ? "sent ✓" : "send"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
