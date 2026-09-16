// Threads: the initiatives inside a workspace. The list is the workspace's
// map of what is in motion; a thread's page is its living state — where it
// stands, what is open, what was decided, what is still a question, and
// every meeting or brief that fed it.
import { useState } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field, ownerTone } from "../ui";
import { relDate, todayISO } from "../format";
import { DecisionRow } from "./DecisionsView";
import type {
  DecisionRef,
  DecisionStatus,
  OpenAction,
  QuestionRef,
  Summary,
  Thread,
  ThreadStatus,
} from "../types";

export const threadTone: Record<ThreadStatus, "accent" | "outline" | "olive"> =
  {
    active: "accent",
    parked: "outline",
    done: "olive",
  };

export type ThreadStats = {
  open: number;
  overdue: number;
  proposed: number;
  entries: number;
  last: number;
};

export function statsFor(
  t: Thread,
  library: Summary[],
  open: OpenAction[],
  decisions: DecisionRef[],
): ThreadStats {
  const today = todayISO();
  const mine = library.filter((s) => s.thread === t.id);
  const o = open.filter((x) => x.thread === t.id);
  return {
    open: o.length,
    overdue: o.filter((x) => x.action.due_date && x.action.due_date < today)
      .length,
    proposed: decisions.filter(
      (d) => d.thread === t.id && d.decision.status === "proposed",
    ).length,
    entries: mine.length,
    last: Math.max(t.updated, ...mine.map((s) => s.created)),
  };
}

export function ThreadCard({
  t,
  stats,
  onOpen,
}: {
  t: Thread;
  stats: ThreadStats;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(t.id)}
      className={`flex w-full flex-col gap-1.5 rounded-xl border bg-paper px-4 py-3 text-left transition-colors hover:border-ink/40 ${
        t.status === "active" ? "border-line" : "border-line opacity-75"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          dir="auto"
          className="arabic min-w-0 flex-1 truncate text-start text-[14px] font-medium"
        >
          {t.title}
        </span>
        {stats.overdue > 0 && <Chip tone="alert">{stats.overdue} overdue</Chip>}
        {stats.open > 0 && <Chip tone="accent">{stats.open} open</Chip>}
        {stats.proposed > 0 && (
          <Chip tone="outline">{stats.proposed} to confirm</Chip>
        )}
        <Chip tone={threadTone[t.status]}>{t.status}</Chip>
      </div>
      {t.summary && (
        <p
          dir="auto"
          className="arabic line-clamp-2 text-start text-[13px] text-olive"
        >
          {t.summary}
        </p>
      )}
      <span className="text-[11px] text-olive">
        {t.owner ? `${t.owner} · ` : ""}
        {stats.entries} {stats.entries === 1 ? "entry" : "entries"}
        {stats.last ? ` · moved ${relDate(stats.last)}` : ""}
      </span>
    </button>
  );
}

export function ThreadsView({
  threads,
  library,
  open,
  decisions,
  onOpen,
  onCreate,
}: {
  threads: Thread[];
  library: Summary[];
  open: OpenAction[];
  decisions: DecisionRef[];
  onOpen: (id: string) => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const groups: { status: ThreadStatus; label: string }[] = [
    { status: "active", label: "In motion" },
    { status: "parked", label: "Parked" },
    { status: "done", label: "Done" },
  ];
  const unfiled = library.filter((s) => !s.thread).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 px-1">
        <Eyebrow>Threads</Eyebrow>
        <span className="text-[12px] text-olive">
          one line per thing in motion. If it is not here, it is not in motion.
        </span>
        <Button
          tone="quiet"
          size="sm"
          className="ml-auto"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "cancel" : "+ thread"}
        </Button>
      </div>
      {adding && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await onCreate(title.trim());
            setTitle("");
            setAdding(false);
          }}
          className="flex gap-2 rounded-xl border border-ink/40 bg-paper p-3"
        >
          <Field
            dir="auto"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="what is this initiative?"
            className="arabic flex-1"
          />
          <Button tone="primary" size="sm" type="submit">
            add
          </Button>
        </form>
      )}
      {threads.length === 0 && !adding && (
        <Empty>
          No threads yet. A thread is an initiative or project that moves over
          weeks: give it a name and a "where it stands" line.
        </Empty>
      )}
      {groups.map((g) => {
        const rows = threads.filter((t) => t.status === g.status);
        if (!rows.length) return null;
        return (
          <section key={g.status} className="flex flex-col gap-1.5">
            <h4 className="px-1 text-[12px] font-medium text-olive">
              {g.label} · {rows.length}
            </h4>
            {rows.map((t) => (
              <ThreadCard
                key={t.id}
                t={t}
                stats={statsFor(t, library, open, decisions)}
                onOpen={onOpen}
              />
            ))}
          </section>
        );
      })}
      {unfiled > 0 && (
        <p className="px-1 text-[12px] text-olive">
          {unfiled} {unfiled === 1 ? "entry" : "entries"} in this workspace not
          filed under a thread yet. Open one and pick its thread.
        </p>
      )}
    </div>
  );
}

export function ThreadDetail({
  t,
  library,
  open,
  decisions,
  questions,
  busy,
  onBack,
  onSave,
  onDelete,
  onOpenMeeting,
  onDone,
  onNudge,
  onDecisionStatus,
  onAddBrief,
}: {
  t: Thread;
  library: Summary[];
  open: OpenAction[];
  decisions: DecisionRef[];
  questions: QuestionRef[];
  busy: boolean;
  onBack: () => void;
  onSave: (t: Thread) => Promise<void>;
  onDelete: (t: Thread) => Promise<void>;
  onOpenMeeting: (dir: string) => void;
  onDone: (oa: OpenAction) => void;
  onNudge: (oa: OpenAction) => void;
  onDecisionStatus: (d: DecisionRef, s: DecisionStatus) => void;
  onAddBrief: () => void;
}) {
  const [edit, setEdit] = useState<Thread | null>(null);
  const today = todayISO();
  const entries = library.filter((s) => s.thread === t.id);
  const mineOpen = open.filter((x) => x.thread === t.id);
  const mineDec = decisions.filter((d) => d.thread === t.id);
  const mineQ = questions.filter((q) => q.thread === t.id);
  const people = Array.from(
    new Set(entries.map((s) => s.person).filter(Boolean)),
  );

  return (
    <div className="flex flex-col gap-5">
      <button
        onClick={onBack}
        className="self-start text-[12px] text-olive hover:text-ink"
      >
        ← all threads
      </button>

      {edit ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(edit);
            setEdit(null);
          }}
          className="flex flex-col gap-3 rounded-xl border border-ink/40 bg-paper p-4"
        >
          <div className="flex gap-2">
            <Field
              dir="auto"
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              className="arabic flex-[2] text-[15px] font-medium"
            />
            <Field
              value={edit.owner}
              onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
              placeholder="owner"
              className="flex-1"
            />
            <select
              value={edit.status}
              onChange={(e) =>
                setEdit({ ...edit, status: e.target.value as ThreadStatus })
              }
              className="rounded-lg border border-line bg-white px-2 py-2 text-[13px] outline-none focus:border-ink"
            >
              <option value="active">active</option>
              <option value="parked">parked</option>
              <option value="done">done</option>
            </select>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-olive">
            where it stands
            <textarea
              dir="auto"
              autoFocus
              value={edit.summary}
              onChange={(e) => setEdit({ ...edit, summary: e.target.value })}
              placeholder="the current state in a line or two, not the history"
              className="arabic min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-start text-[13px] leading-relaxed outline-none focus:border-ink"
            />
          </label>
          <div className="flex gap-2">
            <Button tone="primary" size="sm" type="submit">
              save
            </Button>
            <Button
              tone="ghost"
              size="sm"
              type="button"
              onClick={() => setEdit(null)}
            >
              cancel
            </Button>
            <Button
              tone="danger"
              size="sm"
              type="button"
              className="ml-auto"
              onClick={async () => {
                if (
                  confirm(
                    `Delete the thread "${t.title}"? Its entries stay, unfiled.`,
                  )
                )
                  await onDelete(t);
              }}
            >
              delete thread
            </Button>
          </div>
        </form>
      ) : (
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Eyebrow>Where it stands</Eyebrow>
            <Chip tone={threadTone[t.status]}>{t.status}</Chip>
            {t.owner && <Chip tone="outline">{t.owner}</Chip>}
            <span className="text-[12px] text-olive">
              {t.updated ? `moved ${relDate(t.updated)}` : ""}
            </span>
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setEdit({ ...t })}
            >
              move it
            </Button>
          </div>
          <p
            dir="auto"
            className={`arabic whitespace-pre-wrap text-start text-[14px] leading-relaxed ${
              t.summary ? "" : "text-olive"
            }`}
          >
            {t.summary || "No state line yet. Say where this stands today."}
          </p>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <Eyebrow>Open</Eyebrow>
          {mineOpen.length > 0 && <Chip tone="accent">{mineOpen.length}</Chip>}
        </div>
        {mineOpen.length === 0 ? (
          <Empty>Nothing open on this thread.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {mineOpen.map((oa) => {
              const overdue =
                !!oa.action.due_date && oa.action.due_date < today;
              return (
                <div
                  key={`${oa.dir}-${oa.action.id}`}
                  className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4"
                >
                  <button
                    onClick={() => onDone(oa)}
                    aria-label="mark done"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line bg-white text-transparent transition-colors hover:border-ink hover:text-ink"
                  >
                    ✓
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span dir="auto" className="arabic text-start text-[14px]">
                      {oa.action.title}
                    </span>
                    {oa.action.detail && (
                      <span
                        dir="auto"
                        className="arabic text-start text-[12px] text-olive"
                      >
                        {oa.action.detail}
                      </span>
                    )}
                    <button
                      onClick={() => onOpenMeeting(oa.dir)}
                      className="self-start text-[11px] text-olive hover:text-ink"
                    >
                      {oa.meeting_title || "untitled"} ·{" "}
                      {relDate(oa.meeting_created)} ↗
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(oa.action.due_label || oa.action.due_date) && (
                      <Chip tone={overdue ? "alert" : "outline"}>
                        {overdue ? "overdue · " : ""}
                        {oa.action.due_label || oa.action.due_date}
                      </Chip>
                    )}
                    <Chip tone={ownerTone(oa.action.owner)}>
                      {oa.action.owner}
                    </Chip>
                    <Button
                      size="sm"
                      tone="quiet"
                      disabled={busy}
                      onClick={() => onNudge(oa)}
                    >
                      nudge
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {mineDec.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Decisions</Eyebrow>
          </div>
          <Card pad={false} className="p-2">
            {mineDec.map((d) => (
              <DecisionRow
                key={`${d.dir}-${d.decision.id}`}
                d={d}
                onStatus={onDecisionStatus}
                busy={busy}
              />
            ))}
          </Card>
        </section>
      )}

      {mineQ.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Still a question</Eyebrow>
          </div>
          <Card className="flex flex-col gap-1.5">
            {mineQ.map((q, i) => (
              <p key={i} dir="auto" className="arabic text-start text-[14px]">
                {q.text}
              </p>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <Eyebrow>Meetings & briefs</Eyebrow>
          {people.length > 0 && (
            <span className="text-[12px] text-olive">
              with {people.join(", ")}
            </span>
          )}
          <Button
            tone="ghost"
            size="sm"
            className="ml-auto"
            onClick={onAddBrief}
          >
            + brief
          </Button>
        </div>
        {entries.length === 0 ? (
          <Empty>
            Nothing filed here yet. Open a meeting and pick this thread.
          </Empty>
        ) : (
          <Card pad={false} className="p-2">
            {entries.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenMeeting(s.dir)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink/5"
              >
                <span
                  dir="auto"
                  className="arabic min-w-0 flex-1 truncate text-start text-[13px]"
                >
                  {s.title || "Untitled meeting"}
                </span>
                {s.person && <Chip tone="outline">{s.person}</Chip>}
                {!s.has_audio && <Chip tone="outline">brief</Chip>}
                <span className="shrink-0 text-[12px] text-olive">
                  {relDate(s.created)}
                </span>
              </button>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
