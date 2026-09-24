// The workspace's front page: what it is, where its information comes from,
// the files and links behind it, who is in it, and what is open. Everything
// here is editable in place, because a workspace nobody describes is just a
// filter.
import { useState } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field } from "../ui";
import { relDate } from "../format";
import { ThreadCard, statsFor } from "./ThreadsView";
import type {
  DecisionRef,
  Link,
  OpenAction,
  PersonRow,
  Summary,
  Thread,
  View,
  Workspace,
} from "../types";

const KINDS: { id: string; label: string; hint: string }[] = [
  { id: "source", label: "source", hint: "where information comes from" },
  { id: "repo", label: "repo", hint: "owner/name or URL" },
  { id: "folder", label: "folder", hint: "a path on this Mac" },
  { id: "doc", label: "doc", hint: "a file or page" },
  { id: "url", label: "site", hint: "a URL" },
  { id: "channel", label: "channel", hint: "WhatsApp / Slack / group" },
];

const isUrl = (t: string) => /^https?:\/\//i.test(t);
const isPath = (t: string) => t.startsWith("/") || t.startsWith("~");

export function WorkspaceView({
  ws,
  library,
  people,
  open,
  decisions,
  threads,
  runtimeReady,
  onSave,
  onOpenLink,
  onGo,
  onOpenMeeting,
  onOpenThread,
}: {
  ws: Workspace;
  threads: Thread[];
  onOpenThread: (id: string) => void;
  library: Summary[];
  people: PersonRow[];
  open: OpenAction[];
  decisions: DecisionRef[];
  runtimeReady: boolean;
  onSave: (w: Workspace) => Promise<void>;
  onOpenLink: (l: Link) => void;
  onGo: (v: View) => void;
  onOpenMeeting: (dir: string) => void;
}) {
  const [edit, setEdit] = useState<Workspace | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const live = open.filter((o) => !o.action.parked);
  const overdue = live.filter(
    (o) => o.action.due_date && o.action.due_date < today,
  ).length;
  const proposed = decisions.filter(
    (d) => d.decision.status === "proposed",
  ).length;
  const sources = ws.links.filter((l) => l.kind === "source");
  const rest = ws.links.filter((l) => l.kind !== "source");

  if (edit) {
    const setLink = (i: number, patch: Partial<Link>) =>
      setEdit({
        ...edit,
        links: edit.links.map((l, j) => (j === i ? { ...l, ...patch } : l)),
      });
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave(edit);
          setEdit(null);
        }}
        className="flex max-w-2xl flex-col gap-4"
      >
        <div className="flex items-center gap-2 px-1">
          <Eyebrow>Edit workspace</Eyebrow>
          <div className="ml-auto flex gap-2">
            <Button
              tone="ghost"
              size="sm"
              type="button"
              onClick={() => setEdit(null)}
            >
              cancel
            </Button>
            <Button tone="primary" size="sm" type="submit">
              save
            </Button>
          </div>
        </div>
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-olive">
            name
            <Field
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-olive">
            what this workspace is
            <textarea
              dir="auto"
              value={edit.description}
              onChange={(e) =>
                setEdit({ ...edit, description: e.target.value })
              }
              placeholder="one or two sentences: what it is, who is in it, what done looks like"
              className="arabic min-h-20 rounded-lg border border-line bg-white px-3 py-2 text-start text-[13px] outline-none focus:border-ink"
            />
          </label>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <Eyebrow>Sources, files, links</Eyebrow>
            <span className="text-[12px] text-olive">
              where it gets its information, and what sits behind it
            </span>
          </div>
          {edit.links.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select
                value={l.kind}
                onChange={(e) => setLink(i, { kind: e.target.value })}
                className="rounded-lg border border-line bg-white px-2 py-2 text-[12px] outline-none focus:border-ink"
              >
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              <Field
                value={l.label}
                onChange={(e) => setLink(i, { label: e.target.value })}
                placeholder="label"
                className="w-40"
              />
              <Field
                value={l.target}
                onChange={(e) => setLink(i, { target: e.target.value })}
                placeholder={KINDS.find((k) => k.id === l.kind)?.hint}
                className="flex-1"
                mono
              />
              <Button
                tone="ghost"
                size="sm"
                type="button"
                onClick={() =>
                  setEdit({
                    ...edit,
                    links: edit.links.filter((_, j) => j !== i),
                  })
                }
              >
                remove
              </Button>
            </div>
          ))}
          <Button
            tone="quiet"
            size="sm"
            type="button"
            className="self-start"
            onClick={() =>
              setEdit({
                ...edit,
                links: [
                  ...edit.links,
                  { kind: "source", label: "", target: "" },
                ],
              })
            }
          >
            + add
          </Button>
        </Card>
        <Card className="flex flex-col gap-2">
          <Eyebrow>Runtime for this workspace</Eyebrow>
          <p className="text-[12px] leading-relaxed text-olive">
            Optional. When this workspace's work should go to a different agent
            than the default (a client's own agent, for instance), put its
            command here. Empty means the runtime in Settings.
          </p>
          <Field
            mono
            value={edit.runtime_command}
            onChange={(e) =>
              setEdit({ ...edit, runtime_command: e.target.value })
            }
            placeholder="e.g. hermes -p my-profile chat -q"
          />
        </Card>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <p
            dir="auto"
            className={`arabic max-w-2xl text-start text-[15px] leading-relaxed ${
              ws.description ? "" : "text-olive"
            }`}
          >
            {ws.description ||
              "Say what this workspace is: who is in it, what it is for, what done looks like."}
          </p>
          <Button
            tone="ghost"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() =>
              setEdit({ ...ws, links: ws.links.map((l) => ({ ...l })) })
            }
          >
            edit
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-olive">
          <span>
            {runtimeReady
              ? ws.runtime_command
                ? "Za3tar runs this workspace's work on its own runtime"
                : "Za3tar can do work for you here"
              : "Za3tar works locally here"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="threads in motion"
          n={threads.filter((t) => t.status === "active").length}
          onClick={() => onGo("threads")}
        />
        <Stat label="people" n={people.length} onClick={() => onGo("people")} />
        <Stat
          label="waiting for a yes"
          n={proposed}
          onClick={() => onGo("decisions")}
        />
        <Stat
          label={overdue ? `open · ${overdue} overdue` : "open"}
          n={live.length}
          accent={overdue > 0}
          onClick={() => onGo("followups")}
        />
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>In motion</Eyebrow>
          <span className="text-[12px] text-olive">the threads that are moving</span>
          <button
            onClick={() => onGo("threads")}
            className="ml-auto text-[12px] text-olive hover:text-ink"
          >
            all threads →
          </button>
        </div>
        {threads.filter((t) => t.status === "active").length === 0 ? (
          <Empty>Nothing in motion. Add a thread for each initiative or project here.</Empty>
        ) : (
          <div className="flex flex-col gap-1.5">
            {threads
              .filter((t) => t.status === "active")
              .map((t) => (
                <ThreadCard
                  key={t.id}
                  t={t}
                  stats={statsFor(t, library, open, decisions)}
                  onOpen={onOpenThread}
                />
              ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Where it gets its information</Eyebrow>
        </div>
        {sources.length === 0 ? (
          <Empty>
            No sources yet. A thread file, a chat group, a sheet, a dashboard.
          </Empty>
        ) : (
          <Card pad={false} className="p-2">
            {sources.map((l, i) => (
              <LinkRow key={i} l={l} onOpen={onOpenLink} />
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Files & links</Eyebrow>
          <span className="text-[12px] text-olive">
            repos, folders, docs, sites, channels
          </span>
        </div>
        {rest.length === 0 ? (
          <Empty>Nothing attached yet.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {rest.map((l, i) => (
              <LinkRow key={i} l={l} onOpen={onOpenLink} />
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>People here</Eyebrow>
        </div>
        {people.length === 0 ? (
          <Empty>Nobody yet. Tag a meeting with a person.</Empty>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <button
                key={p.name}
                onClick={() => onGo("people")}
                className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] hover:border-ink/40"
              >
                <span dir="auto" className="arabic">
                  {p.name}
                </span>
                {(p.role || p.org) && (
                  <span className="text-[11px] text-olive">
                    {[p.role, p.org].filter(Boolean).join(" · ")}
                  </span>
                )}
                {p.open_actions > 0 && (
                  <Chip tone="accent">{p.open_actions}</Chip>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Latest</Eyebrow>
        </div>
        {library.length === 0 ? (
          <Empty>Nothing here yet. Record a meeting or add a brief.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {library.slice(0, 5).map((s) => (
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

function Stat({
  label,
  n,
  onClick,
  accent,
}: {
  label: string;
  n: number;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-start gap-0.5 rounded-xl border px-4 py-3 text-left transition-colors hover:border-ink/40 ${
        accent ? "border-thyme bg-thyme/15" : "border-line bg-paper"
      }`}
    >
      <span className="display text-[24px] leading-none tabular-nums">{n}</span>
      <span className="text-[12px] text-olive">{label}</span>
    </button>
  );
}

function LinkRow({ l, onOpen }: { l: Link; onOpen: (l: Link) => void }) {
  const openable = isUrl(l.target) || isPath(l.target);
  return (
    <button
      onClick={() => openable && onOpen(l)}
      title={l.target}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${
        openable ? "hover:bg-ink/5" : "cursor-default"
      }`}
    >
      <Chip tone="outline" className="w-[64px] justify-center">
        {KINDS.find((k) => k.id === l.kind)?.label ?? l.kind}
      </Chip>
      <span dir="auto" className="arabic min-w-0 text-start text-[13px]">
        {l.label || l.target}
      </span>
      {l.label && (
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-olive">
          {l.target}
        </span>
      )}
      {openable && <span className="shrink-0 text-[12px] text-olive">↗</span>}
    </button>
  );
}
