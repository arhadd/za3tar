// Home is the desk, not the ledger. It opens with a place to say what you
// need, shows what is alive right now, and keeps what you owe to one line you
// can open. Everything you owe used to be the whole page; that made the app
// feel like a tracker instead of somewhere you work.
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
  onAsk,
  onTalk,
  onRecord,
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
  onAsk: (text: string) => void;
  onTalk: () => void;
  onRecord: () => void;
  onFetchToday: () => void;
  onOpenMeeting: (dir: string, workspace: string) => void;
  onOpenThread: (t: Thread) => void;
  onGoWorkspace: (id: string) => void;
  onDone: (oa: OpenAction) => void;
  onPark: (oa: OpenAction, parked: boolean) => void;
  onDecisionStatus: (d: DecisionRef, s: DecisionStatus) => void;
}) {
  const [code, setCode] = useState("");
  const [signInName, setSignInName] = useState("");
  const [ownKeys, setOwnKeys] = useState(false);
  const [ask, setAsk] = useState("");
  const [openNeeds, setOpenNeeds] = useState(false);

  const today = todayISO();
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000)
    .toISOString()
    .slice(0, 10);
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;

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
  const overdue = onYou.filter((o) => rank(o) === 0);
  const stale = overdue.filter((o) => o.action.due_date! < monthAgo);
  const proposed = decisions.filter((d) => d.decision.status === "proposed");
  const active = threads
    .filter((t) => t.status === "active")
    .sort((a, b) => b.updated - a.updated);
  const movedToday = active.filter((t) => t.updated >= dayAgo).length;
  const newEntries = library.filter((s) => s.created >= dayAgo).length;
  const latest = [...library].sort((a, b) => b.created - a.created).slice(0, 4);

  // the state of things, said as news rather than as debt
  const headline =
    movedToday || newEntries
      ? [
          movedToday
            ? `${movedToday} thread${movedToday === 1 ? "" : "s"} moved`
            : "",
          newEntries
            ? `${newEntries} new ${newEntries === 1 ? "entry" : "entries"}`
            : "",
        ]
          .filter(Boolean)
          .join(" and ") + " since yesterday."
      : active.length
        ? `${active.length} thread${active.length === 1 ? "" : "s"} in motion.`
        : "Nothing in motion yet.";

  const nextUp = schedule?.events?.find((e) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(e.start);
    if (!m) return false;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return mins >= now - 15;
  });

  const suggestions = [
    active[0] ? `where are we on ${active[0].title}?` : "",
    "what's on me today?",
    overdue[0] && !isMine(overdue[0]) ? `nudge ${overdue[0].action.owner}` : "",
    active[0] ? `write an update on ${active[0].title}` : "write a message to…",
  ].filter(Boolean) as string[];

  const needsCount = onYou.length + proposed.length;

  return (
    <div className="flex flex-col gap-7">
      {/* the desk */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="display text-[30px] leading-tight">
            {greeting(userName)}.
          </h2>
          <p className="text-[15px] text-olive">{headline}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask.trim()) return;
            onAsk(ask.trim());
            setAsk("");
          }}
          className="flex gap-2"
        >
          <Field
            dir="auto"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="ask about anything here, or say what you need written or done"
            className="arabic flex-1 px-4 py-3 text-[15px]"
          />
          <Button tone="primary" size="lg" type="submit" disabled={!ask.trim()}>
            ask
          </Button>
          <Button tone="quiet" size="lg" type="button" onClick={onTalk}>
            talk
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              dir="auto"
              className="arabic rounded-full border border-line px-3 py-1 text-[12px] text-olive transition-colors hover:border-ink/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
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
                {!caps.talk ? " Talk is optional and needs an OpenAI key." : ""}
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
            up the workspaces, what is in motion in each, and the people. Then
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

      {/* right now */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>Right now</Eyebrow>
          {runtimeReady && (
            <button
              onClick={onFetchToday}
              disabled={busy}
              className="ml-auto text-[12px] text-olive hover:text-ink"
            >
              {schedule ? "refresh the day" : "what's on today"}
            </button>
          )}
        </div>
        <Card className="flex flex-wrap items-center gap-3">
          {nextUp ? (
            <>
              <span className="text-[13px] tabular-nums text-olive">
                {nextUp.start}
              </span>
              <span
                dir="auto"
                className="arabic min-w-0 flex-1 truncate text-start text-[15px]"
              >
                {nextUp.title}
              </span>
              {nextUp.attendees[0] && (
                <Chip tone="outline">{nextUp.attendees[0]}</Chip>
              )}
            </>
          ) : (
            <span className="flex-1 text-[14px] text-olive">
              {schedule
                ? "Nothing else on the calendar today."
                : "In a meeting? Record it and it lands in the right thread."}
            </span>
          )}
          <Button tone="primary" size="sm" onClick={onRecord}>
            <span className="inline-block h-2 w-2 rounded-full bg-thyme" />
            record
          </Button>
        </Card>
      </section>

      {/* the body of the page: what is alive */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2 px-1">
          <Eyebrow>In motion</Eyebrow>
          <span className="text-[12px] text-olive">
            everything you have going, across workspaces
          </span>
        </div>
        {active.length === 0 ? (
          <Empty>
            Nothing in motion. Say what you are working on in the box above and
            Za3tar will set it up.
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {active.slice(0, 8).map((t) => {
              const items = live.filter((x) => x.thread === t.id);
              const quiet = Math.floor((Date.now() / 1000 - t.updated) / 86400);
              return (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4"
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onGoWorkspace(t.workspace)}
                      className="text-[11px] text-olive hover:text-ink"
                    >
                      {wsName(t.workspace)}
                    </button>
                    <span className="ml-auto flex gap-1">
                      {items.length > 0 && (
                        <Chip tone="accent">{items.length} open</Chip>
                      )}
                      {quiet >= 14 && (
                        <Chip tone="outline">quiet {quiet}d</Chip>
                      )}
                    </span>
                  </div>
                  <button onClick={() => onOpenThread(t)} className="text-left">
                    <span
                      dir="auto"
                      className="arabic text-start text-[15px] font-medium"
                    >
                      {t.title}
                    </span>
                  </button>
                  {t.summary && (
                    <p
                      dir="auto"
                      className="arabic line-clamp-2 text-start text-[13px] text-olive"
                    >
                      {t.summary}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() => onAsk(`where are we on ${t.title}?`)}
                    >
                      catch me up
                    </Button>
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() =>
                        onAsk(
                          `write a short update on ${t.title} for the people involved`,
                        )
                      }
                    >
                      write an update
                    </Button>
                    <Chip tone={threadTone[t.status]} className="ml-auto">
                      {t.owner || "you"}
                    </Chip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* what you owe: one line, opens if you want it */}
      <section className="flex flex-col gap-2">
        <button
          onClick={() => setOpenNeeds((v) => !v)}
          className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-3 text-left transition-colors hover:border-ink/40"
        >
          <Eyebrow>Needs you</Eyebrow>
          <span className="text-[13px] text-olive">
            {needsCount === 0
              ? "nothing right now"
              : [
                  onYou.length ? `${onYou.length} on you` : "",
                  overdue.length ? `${overdue.length} overdue` : "",
                  proposed.length ? `${proposed.length} to confirm` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
          <span className="ml-auto text-[12px] text-olive">
            {openNeeds ? "hide" : "open"}
          </span>
        </button>

        {openNeeds && (
          <div className="flex flex-col gap-3">
            {stale.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-olive">
                <span>
                  {stale.length} overdue by more than a month. Probably not real
                  any more.
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
            {onYou.length > 0 && (
              <Card pad={false} className="p-2">
                {onYou.slice(0, 10).map((oa) => {
                  const r = rank(oa);
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
                        <span
                          dir="auto"
                          className="arabic text-start text-[14px]"
                        >
                          {oa.action.title}
                        </span>
                        <button
                          onClick={() => onOpenMeeting(oa.dir, oa.workspace)}
                          className="self-start text-[11px] text-olive hover:text-ink"
                        >
                          {wsName(oa.workspace)} ↗
                        </button>
                      </div>
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
                      >
                        park
                      </Button>
                    </div>
                  );
                })}
              </Card>
            )}
            {proposed.length > 0 && (
              <Card pad={false} className="p-2">
                {proposed.slice(0, 6).map((d) => (
                  <div
                    key={`${d.dir}-${d.decision.id}`}
                    className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        dir="auto"
                        className="arabic text-start text-[14px]"
                      >
                        {d.decision.text}
                      </span>
                      <span className="text-[11px] text-olive">
                        {wsName(d.workspace)}
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
            )}
          </div>
        )}
      </section>

      {latest.length > 0 && (
        <section className="flex flex-col gap-2">
          <Eyebrow className="px-1">Latest</Eyebrow>
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
                <span className="text-[11px] text-olive">
                  {wsName(s.workspace)}
                </span>
                {s.person && <Chip tone="outline">{s.person}</Chip>}
                <span className="shrink-0 text-[12px] text-olive">
                  {relDate(s.created)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* people you are waiting on, at the foot where it belongs */}
      {(() => {
        const byOwner = new Map<string, number>();
        for (const o of live.filter((x) => !isMine(x)))
          byOwner.set(o.action.owner, (byOwner.get(o.action.owner) ?? 0) + 1);
        const waiting = [...byOwner.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        if (!waiting.length) return null;
        return (
          <section className="flex flex-col gap-2">
            <Eyebrow className="px-1">Waiting on</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {waiting.map(([owner, n]) => (
                <button
                  key={owner}
                  onClick={() =>
                    onAsk(
                      `write a short nudge to ${owner} about what is open with them`,
                    )
                  }
                  title={`draft a nudge for ${owner}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[13px] transition-colors hover:border-ink/40"
                >
                  <Chip tone={ownerTone(owner)}>{owner}</Chip>
                  <span className="text-olive">{n} open</span>
                </button>
              ))}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
