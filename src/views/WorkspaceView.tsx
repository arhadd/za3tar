// A workspace's Overview: its projects first, then the to-dos, the latest
// notes and the people. Where it gets its information and the files behind
// it sit in a closed "Sources & links" at the foot: useful, not the point.
// The name and the one-line description live in the page header; "edit"
// there opens the form below.
import type { ReactNode } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field } from "../ui";
import { relDate } from "../format";
import { ThreadCard, statsFor } from "./ThreadsView";
import { TodoLine, byUrgency } from "./FollowUpsView";
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
  ask,
  edit,
  setEdit,
  onSave,
  onOpenLink,
  onGo,
  onOpenMeeting,
  onOpenThread,
  onDone,
}: {
  ws: Workspace;
  threads: Thread[];
  onOpenThread: (id: string) => void;
  library: Summary[];
  people: PersonRow[];
  open: OpenAction[];
  decisions: DecisionRef[];
  /** the ask box, scoped to this workspace */
  ask: ReactNode;
  /** the workspace being edited, or null (the header's "edit" sets it) */
  edit: Workspace | null;
  setEdit: (w: Workspace | null) => void;
  onSave: (w: Workspace) => Promise<void>;
  onOpenLink: (l: Link) => void;
  onGo: (v: View) => void;
  onOpenMeeting: (dir: string) => void;
  onDone: (oa: OpenAction) => void;
}) {
  const live = byUrgency(open.filter((o) => !o.action.parked));
  const active = threads.filter((t) => t.status === "active");
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
            <Eyebrow>Sources & links</Eyebrow>
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
          <Eyebrow>Assistant for this workspace (advanced)</Eyebrow>
          <p className="text-[12px] leading-relaxed text-olive">
            Optional. When this workspace's work should go to a different
            assistant than the default (a client's own, for instance), put its
            command here. Empty means the one in Settings.
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
    <div className="flex flex-col gap-8">
      {ask}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Projects</Eyebrow>
          <button
            onClick={() => onGo("threads")}
            className="ml-auto text-[12px] text-olive hover:text-ink"
          >
            {threads.length > active.length
              ? `all ${threads.length} projects →`
              : "+ add a project"}
          </button>
        </div>
        {active.length === 0 ? (
          <Empty>
            No active projects. Add one for each thing that moves over weeks
            here.
          </Empty>
        ) : (
          <div className="flex flex-col gap-1.5">
            {active.map((t) => (
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
          <Eyebrow>To-dos</Eyebrow>
          {live.length > 5 && (
            <span className="text-[12px] text-olive">
              {live.length} open, most urgent first
            </span>
          )}
          <button
            onClick={() => onGo("followups")}
            className="ml-auto text-[12px] text-olive hover:text-ink"
          >
            all to-dos →
          </button>
        </div>
        {live.length === 0 ? (
          <Empty>No open to-dos here.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {live.slice(0, 5).map((oa) => (
              <TodoLine
                key={`${oa.dir}-${oa.action.id}`}
                oa={oa}
                where={oa.meeting_title || "untitled note"}
                onDone={onDone}
                onOpen={(x) => onOpenMeeting(x.dir)}
              />
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Recent notes</Eyebrow>
          <button
            onClick={() => onGo("meetings")}
            className="ml-auto text-[12px] text-olive hover:text-ink"
          >
            all notes →
          </button>
        </div>
        {library.length === 0 ? (
          <Empty>No notes yet. Record a meeting or paste notes.</Empty>
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
                  {s.title || "Untitled note"}
                </span>
                {s.person && <Chip tone="outline">{s.person}</Chip>}
                <span className="w-24 shrink-0 text-right text-[12px] text-olive">
                  {relDate(s.created)}
                </span>
              </button>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>People</Eyebrow>
        </div>
        {people.length === 0 ? (
          <Empty>Nobody yet. Tag a note with a person.</Empty>
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

      <details className="group rounded-xl border border-line bg-paper">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] text-olive hover:text-ink">
          <span className="inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          Sources & links
          <span className="text-[12px] text-olive">
            {ws.links.length
              ? `${ws.links.length} attached`
              : "where Za3tar gets its information"}
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-line px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="px-1 text-[12px] font-medium text-olive">
              Where it gets its information
            </span>
            {sources.length === 0 ? (
              <p className="px-1 text-[12px] text-olive">
                None yet: a chat group, a sheet, a notes file.
              </p>
            ) : (
              sources.map((l, i) => (
                <LinkRow key={i} l={l} onOpen={onOpenLink} />
              ))
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="px-1 text-[12px] font-medium text-olive">
              Files & links
            </span>
            {rest.length === 0 ? (
              <p className="px-1 text-[12px] text-olive">Nothing attached yet.</p>
            ) : (
              rest.map((l, i) => <LinkRow key={i} l={l} onOpen={onOpenLink} />)
            )}
          </div>
          <Button
            tone="quiet"
            size="sm"
            className="self-start"
            onClick={() =>
              setEdit({ ...ws, links: ws.links.map((l) => ({ ...l })) })
            }
          >
            edit sources & links
          </Button>
        </div>
      </details>
    </div>
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
