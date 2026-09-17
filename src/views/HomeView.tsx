// Home: hi, and everything you have to think about, across every workspace.
// On you first (overdue, then dated, then the rest), then what is waiting for
// a yes, what is in motion, who you are waiting on, and what just came in.
import { useState } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field, ownerTone } from "../ui";
import { relDate, todayISO } from "../format";
import { threadTone } from "./ThreadsView";
import type {
  DecisionRef,
  DecisionStatus,
  OpenAction,
  RuntimeSchedule,
  Summary,
  Thread,
  Workspace,
} from "../types";

export const isMine = (o: OpenAction) =>
  o.action.owner === "me" || /^(ala|me)\b/i.test(o.action.owner);

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
  schedule,
  runtimeReady,
  busy,
  onFetchToday,
  onOpenMeeting,
  onOpenThread,
  onGoWorkspace,
  onDone,
  onPark,
  onDecisionStatus,
}: {
  userName: string;
  caps: { transcription: boolean; notes: boolean; talk: boolean } | null;
  onSettings: () => void;
  fresh: boolean;
  onStartConversation: () => void;
  onSignIn: (code: string, name: string) => Promise<void>;
  workspaces: Workspace[];
  threads: Thread[];
  open: OpenAction[];
  decisions: DecisionRef[];
  library: Summary[];
  schedule: RuntimeSchedule | null;
  runtimeReady: boolean;
  busy: boolean;
  onFetchToday: () => void;
  onOpenMeeting: (dir: string, workspace: string) => void;
  onOpenThread: (t: Thread) => void;
  onGoWorkspace: (id: string) => void;
  onDone: (oa: OpenAction) => void;
  onPark: (oa: OpenAction, parked: boolean) => void;
  onDecisionStatus: (d: DecisionRef, s: DecisionStatus) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ownKeys, setOwnKeys] = useState(false);
  const today = todayISO();
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;
  const threadTitle = (id: string) => threads.find((t) => t.id === id)?.title;

  const live = open.filter((o) => !o.action.parked);
  const mine = live.filter(isMine);
  const rank = (o: OpenAction) =>
    o.action.due_date && o.action.due_date < today
      ? 0
      : o.action.due_date && o.action.due_date <= week
        ? 1
        : o.action.due_date
          ? 2
          : 3;
  const onYou = [...mine].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.action.due_date && b.action.due_date)
      return a.action.due_date < b.action.due_date ? -1 : 1;
    return b.meeting_created - a.meeting_created;
  });
  const overdue = onYou.filter((o) => rank(o) === 0).length;
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const stale = onYou.filter((o) => o.action.due_date && o.action.due_date < monthAgo);
  const thisWeek = onYou.filter((o) => rank(o) === 1).length;
  const shown = onYou.slice(0, 12);

  const proposed = decisions
    .filter((d) => d.decision.status === "proposed")
    .slice(0, 6);

  const active = threads
    .filter((t) => t.status === "active")
    .sort((a, b) => b.updated - a.updated);
  const quiet = (t: Thread) =>
    Math.floor((Date.now() / 1000 - t.updated) / 86400);

  const others = live.filter((o) => !isMine(o));
  const byOwner = new Map<string, number>();
  for (const o of others)
    byOwner.set(o.action.owner, (byOwner.get(o.action.owner) ?? 0) + 1);
  const waiting = [...byOwner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const latest = [...library].sort((a, b) => b.created - a.created).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="display text-[28px] leading-tight">
            {greeting(userName)}.
          </h2>
          <p className="text-[14px] text-olive">
            {mine.length === 0
              ? "Nothing on you right now."
              : `${mine.length} on you${overdue ? `, ${overdue} overdue` : ""}${
                  thisWeek ? `, ${thisWeek} due this week` : ""
                }. ${active.length} thread${active.length === 1 ? "" : "s"} in motion.`}
          </p>
        </div>
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
                  await onSignIn(code.trim(), name.trim());
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="your name"
                  className="w-40"
                />
                <Button tone="primary" size="sm" type="submit" disabled={!code.trim()}>
                  sign in with Za3tar
                </Button>
                <Button tone="ghost" size="sm" type="button" onClick={() => setOwnKeys(true)}>
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
                {!caps.talk ? " Talk is optional and needs an OpenAI key." : ""}
              </p>
              <div className="flex gap-2">
                <Button tone="primary" size="sm" onClick={onSettings}>
                  open Settings
                </Button>
                <Button tone="ghost" size="sm" onClick={() => setOwnKeys(false)}>
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
            Nothing in here yet. The quickest way in is a two-minute conversation:
            tell Za3tar what you are working on and it sets up your workspaces,
            the threads in motion, and the people. Then record your next meeting
            and watch it land in the right place.
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
              <span className="text-[12px] text-olive">needs the Anthropic key first</span>
            )}
          </div>
        </Card>
      )}
      {runtimeReady && (
        <Card pad={false} className="p-3">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Today</Eyebrow>
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              onClick={onFetchToday}
              disabled={busy}
            >
              {schedule ? "refresh" : "what's on today"}
            </Button>
          </div>
          {schedule?.error && (
            <p className="px-1 py-2 text-[13px] text-olive">
              calendar unreachable: {schedule.error}
            </p>
          )}
          {schedule && !schedule.error && schedule.events.length === 0 && (
            <p className="px-1 py-2 text-[13px] text-olive">
              Nothing on the calendar today.
            </p>
          )}
          {schedule?.events.map((ev, i) => (
            <div
              key={i}
              className="mt-1 flex items-center gap-3 rounded-lg px-2 py-1.5"
            >
              <span className="w-11 shrink-0 text-[12px] tabular-nums text-olive">
                {ev.start}
              </span>
              <span
                dir="auto"
                className="arabic min-w-0 flex-1 truncate text-start text-[13px]"
              >
                {ev.title}
              </span>
              {ev.attendees[0] && <Chip tone="outline">{ev.attendees[0]}</Chip>}
            </div>
          ))}
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>On you</Eyebrow>
          <span className="text-[12px] text-olive">
            across every workspace, overdue first
          </span>
        </div>
        {stale.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-olive">
            <span>
              {stale.length} overdue by more than a month. Probably not real any more.
            </span>
            <Button
              size="sm"
              tone="quiet"
              className="ml-auto"
              onClick={() => stale.forEach((o) => onPark(o, true))}
            >
              park them
            </Button>
          </div>
        )}
        {shown.length === 0 ? (
          <Empty>Nothing on you.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {shown.map((oa) => {
              const r = rank(oa);
              const tt = threadTitle(oa.thread);
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
                    <button
                      onClick={() => onOpenMeeting(oa.dir, oa.workspace)}
                      className="self-start text-[11px] text-olive hover:text-ink"
                    >
                      {wsName(oa.workspace)}
                      {tt
                        ? ` · ${tt}`
                        : oa.meeting_title
                          ? ` · ${oa.meeting_title}`
                          : ""}{" "}
                      ↗
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(oa.action.due_label || oa.action.due_date) && (
                      <Chip
                        tone={
                          r === 0 ? "alert" : r === 1 ? "accent" : "outline"
                        }
                      >
                        {r === 0 ? "overdue · " : ""}
                        {oa.action.due_label || oa.action.due_date}
                      </Chip>
                    )}
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() => onPark(oa, true)}
                      title="not now"
                    >
                      park
                    </Button>
                  </div>
                </div>
              );
            })}
            {onYou.length > shown.length && (
              <p className="px-2 pt-1 text-[12px] text-olive">
                +{onYou.length - shown.length} more in the workspaces'
                follow-ups
              </p>
            )}
          </Card>
        )}
      </section>

      {proposed.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <Eyebrow>Waiting for a yes</Eyebrow>
            <span className="text-[12px] text-olive">
              decisions extracted but not confirmed
            </span>
          </div>
          <Card pad={false} className="p-2">
            {proposed.map((d) => (
              <div
                key={`${d.dir}-${d.decision.id}`}
                className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span dir="auto" className="arabic text-start text-[14px]">
                    {d.decision.text}
                  </span>
                  <span className="text-[11px] text-olive">
                    {wsName(d.workspace)}
                    {threadTitle(d.thread) ? ` · ${threadTitle(d.thread)}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    tone="quiet"
                    onClick={() => onDecisionStatus(d, "confirmed")}
                  >
                    confirm
                  </Button>
                  <Button
                    size="sm"
                    tone="ghost"
                    onClick={() => onDecisionStatus(d, "superseded")}
                  >
                    supersede
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>In motion</Eyebrow>
          <span className="text-[12px] text-olive">
            most recently moved first
          </span>
        </div>
        {active.length === 0 ? (
          <Empty>No threads in motion. Open a workspace and add one.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
            {active.slice(0, 10).map((t) => {
              const q = quiet(t);
              const o = live.filter((x) => x.thread === t.id).length;
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenThread(t)}
                  className="flex flex-col gap-1 rounded-xl border border-line bg-paper px-4 py-3 text-left transition-colors hover:border-ink/40"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-olive">
                      {wsName(t.workspace)}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {o > 0 && <Chip tone="accent">{o} open</Chip>}
                      {q >= 14 && <Chip tone="outline">quiet {q}d</Chip>}
                      <Chip tone={threadTone[t.status]}>{t.status}</Chip>
                    </span>
                  </div>
                  <span
                    dir="auto"
                    className="arabic text-start text-[14px] font-medium"
                  >
                    {t.title}
                  </span>
                  {t.summary && (
                    <span
                      dir="auto"
                      className="arabic line-clamp-2 text-start text-[12px] text-olive"
                    >
                      {t.summary}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <Eyebrow>Waiting on others</Eyebrow>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {waiting.map(([owner, n]) => (
              <span
                key={owner}
                className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px]"
              >
                <Chip tone={ownerTone(owner)}>{owner}</Chip>
                <span className="text-olive">{n} open</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Latest</Eyebrow>
        </div>
        {latest.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <Card pad={false} className="p-2">
            {latest.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenMeeting(s.dir, s.workspace)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenMeeting(s.dir, s.workspace);
                }}
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink/5"
              >
                <span
                  dir="auto"
                  className="arabic min-w-0 flex-1 truncate text-start text-[13px]"
                >
                  {s.title || "Untitled meeting"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoWorkspace(s.workspace);
                  }}
                  className="text-[11px] text-olive hover:text-ink"
                >
                  {wsName(s.workspace)}
                </button>
                {s.person && <Chip tone="outline">{s.person}</Chip>}
                <span className="shrink-0 text-[12px] text-olive">
                  {relDate(s.created)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
