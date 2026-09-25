// Home is the desk, not the ledger: a greeting with what changed, one place
// to ask, your workspaces, then a short "needs you" and the latest notes.
// What you owe stays secondary on purpose; a Home that was mostly debt made
// the app feel like a tracker instead of somewhere you work.
import { useState } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field } from "../ui";
import { relDate } from "../format";
import { AskBox } from "./AskBox";
import { DecisionLine, TodoLine, byUrgency, isMine } from "./FollowUpsView";
import type {
  AskRead,
  DecisionRef,
  DecisionStatus,
  OpenAction,
  Summary,
  Thread,
  Workspace,
} from "../types";

export { isMine };

function greeting(name: string) {
  const h = new Date().getHours();
  const g =
    h < 5
      ? "Still up"
      : h < 12
        ? "Good morning"
        : h < 18
          ? "Good afternoon"
          : "Good evening";
  return name ? `${g}, ${name.split(" ")[0]}` : g;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

export function HomeView({
  userName,
  caps,
  onSettings,
  fresh,
  onStartConversation,
  onSignIn,
  workspaces,
  threads,
  open,
  decisions,
  library,
  onAsk,
  readAsk,
  routeLabel,
  onTalk,
  talking,
  onRecord,
  onOpenMeeting,
  onGoWorkspace,
  onCreateWorkspace,
  onSeeTodos,
  onDone,
  onDecisionStatus,
}: {
  userName: string;
  caps: { transcription: boolean; notes: boolean; talk: boolean; fast?: boolean } | null;
  onSettings: () => void;
  fresh: boolean;
  onStartConversation: () => void;
  onSignIn: (code: string, name: string) => Promise<void>;
  workspaces: Workspace[];
  threads: Thread[];
  open: OpenAction[];
  decisions: DecisionRef[];
  library: Summary[];
  onAsk: (text: string, read?: AskRead) => void;
  /** fast pre-read of the ask box (Jev); null when no key is set */
  readAsk: ((text: string) => Promise<AskRead | null>) | null;
  /** route id → label, for the assistant chip */
  routeLabel: (id: string) => string;
  onTalk: () => void;
  talking: boolean;
  onRecord: () => void;
  onOpenMeeting: (dir: string, workspace: string) => void;
  onGoWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onSeeTodos: () => void;
  onDone: (oa: OpenAction) => void;
  onDecisionStatus: (d: DecisionRef, s: DecisionStatus) => void;
}) {
  const [code, setCode] = useState("");
  const [signInName, setSignInName] = useState("");
  const [ownKeys, setOwnKeys] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;

  const live = open.filter((o) => !o.action.parked);
  const onYou = byUrgency(live.filter(isMine));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = onYou.filter(
    (o) => o.action.due_date && o.action.due_date < today,
  );
  const proposed = decisions.filter((d) => d.decision.status === "proposed");
  const active = threads
    .filter((t) => t.status === "active")
    .sort((a, b) => b.updated - a.updated);
  const movedToday = active.filter((t) => t.updated >= dayAgo).length;
  const newNotes = library.filter((s) => s.created >= dayAgo).length;
  const latest = [...library].sort((a, b) => b.created - a.created).slice(0, 5);

  // the state of things, said as news rather than as debt
  const headline =
    movedToday || newNotes
      ? [
          movedToday ? `${plural(movedToday, "project")} moved` : "",
          newNotes ? `${plural(newNotes, "new note")}` : "",
        ]
          .filter(Boolean)
          .join(" and ") + " since yesterday."
      : active.length
        ? `${plural(active.length, "active project")}.`
        : "Nothing here yet.";

  const suggestions = [
    active[0] ? `where does ${active[0].title} stand?` : "",
    "what's on me today?",
    active[0] ? `write an update on ${active[0].title}` : "write a message to…",
  ].filter(Boolean) as string[];

  // needs you: overdue first, then decisions to confirm, then the rest
  type Need =
    | { kind: "todo"; oa: OpenAction }
    | { kind: "decision"; d: DecisionRef };
  const needs: Need[] = [
    ...overdue.map((oa) => ({ kind: "todo" as const, oa })),
    ...proposed.map((d) => ({ kind: "decision" as const, d })),
    ...onYou
      .filter((o) => !overdue.includes(o))
      .map((oa) => ({ kind: "todo" as const, oa })),
  ];
  const needsSummary = [
    onYou.length ? plural(onYou.length, "to-do") : "",
    overdue.length ? `${overdue.length} overdue` : "",
    proposed.length ? `${proposed.length} to confirm` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  async function addWorkspace() {
    const n = newName.trim();
    setAdding(false);
    setNewName("");
    if (n) await onCreateWorkspace(n);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* greeting + the one place to ask */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="display text-[30px] leading-tight">
            {greeting(userName)}.
          </h2>
          <p className="text-[15px] text-olive">{headline}</p>
        </div>
        <AskBox
          suggestions={suggestions}
          workspaces={workspaces}
          threads={threads}
          onAsk={onAsk}
          readAsk={readAsk}
          routeLabel={routeLabel}
          onTalk={onTalk}
          talking={talking}
        />
      </div>

      {caps && (!caps.transcription || !caps.notes) && (
        <Card className="flex flex-col gap-3 border-thyme bg-thyme/10">
          <Eyebrow>Set up</Eyebrow>
          {!ownKeys ? (
            <>
              <p className="text-[13px] leading-relaxed">
                Two ways to run Za3tar. Sign in with an invite code and it just
                works, through Za3tar's own keys. Or use your own provider keys
                and nothing leaves this Mac except to the providers you chose.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!code.trim()) return;
                  await onSignIn(code.trim(), signInName.trim());
                }}
                className="flex flex-wrap gap-2"
              >
                <Field
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="invite code"
                  className="w-48"
                  mono
                />
                <Field
                  value={signInName}
                  onChange={(e) => setSignInName(e.target.value)}
                  placeholder="your name"
                  className="w-40"
                />
                <Button
                  tone="primary"
                  size="sm"
                  type="submit"
                  disabled={!code.trim()}
                >
                  sign in with Za3tar
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setOwnKeys(true)}
                >
                  I have my own keys
                </Button>
              </form>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed">
                {!caps.transcription && !caps.notes
                  ? "Za3tar needs two keys: ElevenLabs for transcription and Anthropic for notes, decisions and drafts."
                  : !caps.transcription
                    ? "Transcription is off: add an ElevenLabs key. Recording still works; the transcript waits."
                    : "Notes are off: add an Anthropic key. Transcripts still come in; notes and decisions wait."}
                {!caps.talk ? " Talking out loud is optional and needs an OpenAI key." : ""}
              </p>
              <div className="flex gap-2">
                <Button tone="primary" size="sm" onClick={onSettings}>
                  open Settings
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => setOwnKeys(false)}
                >
                  back
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {fresh && (
        <Card className="flex flex-col gap-2 border-ink/40">
          <Eyebrow>Start here</Eyebrow>
          <p className="text-[14px] leading-relaxed">
            Nothing in here yet. Tell Za3tar what you are working on and it sets
            up your workspaces, the projects in each, and the people. Then
            record your next meeting and watch it land in the right place.
          </p>
          <div className="flex items-center gap-2">
            <Button
              tone="primary"
              size="sm"
              onClick={onStartConversation}
              disabled={!!caps && !caps.notes}
            >
              start with a conversation
            </Button>
            {caps && !caps.notes && (
              <span className="text-[12px] text-olive">
                sign in or add a key first
              </span>
            )}
          </div>
        </Card>
      )}

      {/* the body of the page: your workspaces */}
      <section className="flex flex-col gap-2">
        <Eyebrow className="px-1">Your workspaces</Eyebrow>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {workspaces.map((w) => {
            const top = active.find((t) => t.workspace === w.id);
            const todos = live.filter((o) => o.workspace === w.id).length;
            const confirm = proposed.filter((d) => d.workspace === w.id).length;
            const counts = [
              todos ? plural(todos, "to-do") : "",
              confirm ? plural(confirm, "decision") + " to confirm" : "",
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={w.id}
                onClick={() => onGoWorkspace(w.id)}
                className="flex min-h-[120px] flex-col gap-1.5 rounded-xl border border-line bg-paper p-4 text-left transition-colors hover:border-ink/40"
              >
                <span dir="auto" className="arabic text-start text-[16px] font-semibold">
                  {w.name}
                </span>
                <p
                  dir="auto"
                  className="arabic line-clamp-2 text-start text-[13px] leading-relaxed text-olive"
                >
                  {top ? (
                    <>
                      <span className="font-medium text-ink">{top.title}</span>
                      {top.summary ? ` — ${top.summary}` : ""}
                    </>
                  ) : (
                    w.description || "Nothing here yet."
                  )}
                </p>
                <span className="mt-auto pt-1 text-[12px] text-olive">
                  {counts ? (
                    <span className="text-ink">{counts}</span>
                  ) : (
                    "nothing open"
                  )}
                </span>
              </button>
            );
          })}
          {adding ? (
            <div className="flex min-h-[120px] flex-col justify-center gap-2 rounded-xl border border-ink/40 bg-paper p-4">
              <Field
                autoFocus
                dir="auto"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addWorkspace();
                  if (e.key === "Escape") {
                    setNewName("");
                    setAdding(false);
                  }
                }}
                onBlur={() => void addWorkspace()}
                placeholder="a client, a company, a big area of life"
                className="arabic"
              />
              <span className="text-[11px] text-olive">
                enter to add · esc to cancel
              </span>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-olive transition-colors hover:border-ink/40 hover:text-ink"
            >
              + New workspace
            </button>
          )}
        </div>
      </section>

      {/* what needs you: short, secondary */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Needs you</Eyebrow>
          {needsSummary && (
            <span className="text-[12px] text-olive">{needsSummary}</span>
          )}
          <button
            onClick={onSeeTodos}
            className="ml-auto text-[12px] text-olive hover:text-ink"
          >
            See all to-dos →
          </button>
        </div>
        {needs.length === 0 ? (
          <Empty>Nothing needs you right now.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {needs.slice(0, 5).map((n) =>
              n.kind === "todo" ? (
                <TodoLine
                  key={`t-${n.oa.dir}-${n.oa.action.id}`}
                  oa={n.oa}
                  where={wsName(n.oa.workspace)}
                  onDone={onDone}
                  onOpen={(oa) => onOpenMeeting(oa.dir, oa.workspace)}
                />
              ) : (
                <DecisionLine
                  key={`d-${n.d.dir}-${n.d.decision.id}`}
                  d={n.d}
                  where={wsName(n.d.workspace)}
                  onStatus={onDecisionStatus}
                />
              ),
            )}
          </Card>
        )}
      </section>

      {/* the latest notes */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Recent notes</Eyebrow>
          <button
            onClick={onRecord}
            className="ml-auto flex items-center gap-1.5 text-[12px] text-olive hover:text-ink"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-thyme" />
            Record a meeting
          </button>
        </div>
        {latest.length === 0 ? (
          <Empty>
            No notes yet. Record a meeting, or paste notes into a workspace.
          </Empty>
        ) : (
          <Card pad={false} className="p-2">
            {latest.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenMeeting(s.dir, s.workspace)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink/5"
              >
                <span
                  dir="auto"
                  className="arabic min-w-0 flex-1 truncate text-start text-[13px]"
                >
                  {s.title || "Untitled note"}
                </span>
                <span className="text-[11px] text-olive">
                  {wsName(s.workspace)}
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
    </div>
  );
}
