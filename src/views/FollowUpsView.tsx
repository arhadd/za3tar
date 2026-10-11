// To-dos: what someone owes from a note (stored as open actions). Inside a
// workspace it is that workspace's list; from the sidebar it is every to-do
// across workspaces, grouped by workspace.
import { useState } from "react";
import { Button, Chip, Empty, ownerTone } from "../ui";
import { bridgeId, relDate, todayISO } from "../format";
import { verdictWord, type TidyVerdict } from "../tidy";
import type {
  DecisionRef,
  OpenAction,
  RuntimeFollowupStatus,
  Workspace,
} from "../types";

export const isMine = (o: OpenAction) =>
  o.action.owner === "me" || /^(ala|me)\b/i.test(o.action.owner);

/** overdue first, then due soon, then dated, then newest */
export function byUrgency(list: OpenAction[]): OpenAction[] {
  const today = todayISO();
  const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rank = (o: OpenAction) =>
    o.action.due_date && o.action.due_date < today
      ? 0
      : o.action.due_date && o.action.due_date <= week
        ? 1
        : o.action.due_date
          ? 2
          : 3;
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (a.action.due_date && b.action.due_date && a.action.due_date !== b.action.due_date)
      return a.action.due_date < b.action.due_date ? -1 : 1;
    return b.meeting_created - a.meeting_created;
  });
}

function DoneBox({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="mark done"
      title="mark done"
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-line bg-white text-transparent transition-colors hover:border-ink hover:text-ink"
    >
      ✓
    </button>
  );
}

/** one to-do in a short list (Home, a workspace's Overview) */
export function TodoLine({
  oa,
  where,
  onDone,
  onOpen,
}: {
  oa: OpenAction;
  /** small line under the title: a workspace name, a person… */
  where?: string;
  onDone: (oa: OpenAction) => void;
  onOpen: (oa: OpenAction) => void;
}) {
  const overdue = !!oa.action.due_date && oa.action.due_date < todayISO();
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-ink/4">
      <DoneBox onClick={() => onDone(oa)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span dir="auto" className="arabic text-left text-[14px]">
          {oa.action.title}
        </span>
        {where && (
          <button
            onClick={() => onOpen(oa)}
            className="self-start text-[12px] text-olive hover:text-ink"
          >
            {where} ↗
          </button>
        )}
      </div>
      {(oa.action.due_label || oa.action.due_date) && (
        <Chip tone={overdue ? "alert" : "outline"}>
          {overdue ? "overdue · " : ""}
          {oa.action.due_label || oa.action.due_date}
        </Chip>
      )}
      {!isMine(oa) && (
        <Chip tone={ownerTone(oa.action.owner)}>{oa.action.owner}</Chip>
      )}
    </div>
  );
}

/** one decision waiting for a yes, in a short list */
export function DecisionLine({
  d,
  where,
  onStatus,
}: {
  d: DecisionRef;
  where?: string;
  onStatus: (d: DecisionRef, s: "confirmed" | "superseded") => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-1.5 hover:bg-ink/4">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[12px] text-olive">
        ?
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span dir="auto" className="arabic text-left text-[14px]">
          {d.decision.text}
        </span>
        <span className="text-[12px] text-olive">
          decision to confirm{where ? ` · ${where}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" tone="quiet" onClick={() => onStatus(d, "confirmed")}>
          confirm
        </Button>
        <Button
          size="sm"
          tone="ghost"
          onClick={() => onStatus(d, "superseded")}
          title="this is no longer the decision"
        >
          drop
        </Button>
      </div>
    </div>
  );
}

/** the assistant's word on one to-do, under it, with the one-tap fix */
function TidyLine({
  v,
  label,
  onDone,
  onHold,
  onDismiss,
}: {
  v: TidyVerdict;
  label: string;
  onDone: () => void;
  onHold: () => void;
  onDismiss: () => void;
}) {
  const tone =
    v.verdict === "done" ? "accent" : v.verdict === "keep" ? "neutral" : v.verdict === "drop" ? "olive" : "outline";
  return (
    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-ink/4 px-2 py-1.5 text-[12px]">
      <Chip tone={tone}>
        {label}: {verdictWord[v.verdict]}
      </Chip>
      <span className="text-ink/80">
        {v.why}
        {v.evidence ? <span className="text-olive"> ({v.evidence})</span> : null}
      </span>
      {v.next && (
        <span className="text-ink">
          Next: {v.next}
          {v.can_do ? <span className="text-olive"> · {label} can do this</span> : null}
        </span>
      )}
      <span className="ml-auto flex gap-2">
        {v.verdict === "done" && (
          <button onClick={onDone} className="font-medium text-ink hover:underline">
            mark done
          </button>
        )}
        {v.verdict === "drop" && (
          <button onClick={onHold} className="font-medium text-ink hover:underline">
            put on hold
          </button>
        )}
        <button onClick={onDismiss} className="text-olive hover:text-ink" title="hide this suggestion">
          ×
        </button>
      </span>
    </div>
  );
}

export function FollowUpsView({
  openActions,
  runtimeStatus,
  runtimeReady,
  onSync,
  onDone,
  onPark,
  onNudge,
  onOpenMeeting,
  busy,
  workspaces,
  tidy,
}: {
  onPark: (oa: OpenAction, parked: boolean) => void;
  openActions: OpenAction[];
  runtimeStatus: Record<string, RuntimeFollowupStatus>;
  runtimeReady: boolean;
  onSync: () => void;
  onDone: (oa: OpenAction) => void;
  onNudge: (oa: OpenAction) => void;
  onOpenMeeting: (oa: OpenAction) => void;
  busy: boolean;
  /** set on the all-workspaces page: group the list by workspace */
  workspaces?: Workspace[];
  /** the assistant's verdicts on open to-dos, when there is one to ask */
  tidy?: {
    label: string;
    running: boolean;
    verdicts: Record<string, TidyVerdict>;
    onRun: () => void;
    onApply: (list: OpenAction[], as: "done" | "hold") => void;
    onDismiss: (id: string) => void;
  };
}) {
  const today = todayISO();
  const [lens, setLens] = useState<"mine" | "others" | "all" | "parked">("mine");
  const parkedN = openActions.filter((o) => o.action.parked).length;
  const live = openActions.filter((o) => !o.action.parked);
  const shown = byUrgency(
    lens === "parked"
      ? openActions.filter((o) => o.action.parked)
      : lens === "mine"
        ? live.filter(isMine)
        : lens === "others"
          ? live.filter((o) => !isMine(o))
          : live,
  );
  const lenses: { id: typeof lens; label: string; n: number }[] = [
    { id: "mine", label: "On me", n: live.filter(isMine).length },
    {
      id: "others",
      label: "Waiting on others",
      n: live.filter((o) => !isMine(o)).length,
    },
    { id: "all", label: "All", n: live.length },
    { id: "parked", label: "On hold", n: parkedN },
  ];

  // grouped by workspace on the all-workspaces page, in sidebar order
  const groups: { id: string; name: string; rows: OpenAction[] }[] = workspaces
    ? [
        ...workspaces.map((w) => ({ id: w.id, name: w.name, rows: [] as OpenAction[] })),
        { id: "", name: "Other", rows: [] as OpenAction[] },
      ]
    : [{ id: "", name: "", rows: [] }];
  for (const oa of shown) {
    const g = workspaces
      ? (groups.find((x) => x.id === oa.workspace) ?? groups[groups.length - 1])
      : groups[0];
    g.rows.push(oa);
  }

  // the assistant's verdicts on what is shown, and the ones it says to act on
  const verdictOf = (oa: OpenAction) => tidy?.verdicts[bridgeId(oa.dir, oa.action.id)];
  const judged = shown.filter((oa) => !oa.action.parked && verdictOf(oa));
  const looksDone = judged.filter((oa) => verdictOf(oa)?.verdict === "done");
  const toDrop = judged.filter((oa) => verdictOf(oa)?.verdict === "drop");
  const count = (v: TidyVerdict["verdict"]) =>
    judged.filter((oa) => verdictOf(oa)?.verdict === v).length;

  // who you are waiting on, with a one-click nudge (was on Home)
  const waiting =
    lens === "others"
      ? [
          ...shown.reduce(
            (m, o) => m.set(o.action.owner, (m.get(o.action.owner) ?? 0) + 1),
            new Map<string, number>(),
          ),
        ].sort((a, b) => b[1] - a[1])
      : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex gap-1 rounded-lg border border-line bg-paper p-0.5">
          {lenses.map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                lens === l.id ? "bg-ink text-limestone" : "text-olive hover:text-ink"
              } ${l.id === "parked" && l.n === 0 && lens !== "parked" ? "hidden" : ""}`}
            >
              {l.label}
              {l.n > 0 ? ` · ${l.n}` : ""}
            </button>
          ))}
        </div>
        {tidy && lens === "mine" && live.some(isMine) && (
          <Button
            tone="quiet"
            size="sm"
            className="ml-auto"
            onClick={tidy.onRun}
            disabled={tidy.running}
            title={`${tidy.label} checks each to-do against your chats, calendar and notes; nothing changes until you apply it`}
          >
            {tidy.running ? `${tidy.label} is checking… (a few minutes)` : `Tidy up with ${tidy.label}`}
          </Button>
        )}
        {runtimeReady && openActions.length > 0 && (
          <Button
            tone="ghost"
            size="sm"
            className={tidy && lens === "mine" ? "" : "ml-auto"}
            onClick={onSync}
            disabled={busy}
            title="check with your assistant what was nudged, answered or done"
          >
            check for updates
          </Button>
        )}
      </div>

      {tidy && judged.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-paper px-3 py-2 text-[13px]">
          <span>
            {tidy.label} checked {judged.length}:{" "}
            {[
              ["done", "look done"],
              ["drop", "to drop"],
              ["theirs", "not yours"],
              ["keep", "to keep"],
              ["unsure", "no trace"],
            ]
              .map(([v, w]) => [count(v as TidyVerdict["verdict"]), w] as const)
              .filter(([n]) => n > 0)
              .map(([n, w]) => `${n} ${w}`)
              .join(" · ")}
          </span>
          <span className="ml-auto flex gap-1.5">
            {looksDone.length > 0 && (
              <Button size="sm" tone="quiet" onClick={() => tidy.onApply(looksDone, "done")}>
                mark {looksDone.length} done
              </Button>
            )}
            {toDrop.length > 0 && (
              <Button size="sm" tone="ghost" onClick={() => tidy.onApply(toDrop, "hold")}>
                put {toDrop.length} on hold
              </Button>
            )}
          </span>
        </div>
      )}

      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-olive">
          <span>Waiting on</span>
          {waiting.slice(0, 8).map(([owner, n]) => (
            <Chip key={owner} tone={ownerTone(owner)}>
              {owner} · {n}
            </Chip>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <Empty>
          {lens === "mine"
            ? "Nothing on you right now."
            : lens === "parked"
              ? "Nothing on hold."
              : lens === "others"
                ? "Not waiting on anyone."
                : "No to-dos."}
        </Empty>
      )}
      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section key={g.id || "all"} className="flex flex-col gap-1.5">
            {workspaces && (
              <h4 className="px-1 text-[12px] font-medium text-olive">
                {g.name} · {g.rows.length}
              </h4>
            )}
            <div className="rounded-xl border border-line bg-paper p-2">
              {g.rows.map((oa) => {
                const overdue =
                  !!oa.action.due_date && oa.action.due_date < today;
                const js = runtimeStatus[bridgeId(oa.dir, oa.action.id)];
                return (
                  <div
                    key={`${oa.dir}-${oa.action.id}`}
                    className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4"
                  >
                    <DoneBox onClick={() => onDone(oa)} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span dir="auto" className="arabic text-left text-[14px]">
                        {oa.action.title}
                      </span>
                      <button
                        onClick={() => onOpenMeeting(oa)}
                        className="self-start text-[12px] text-olive hover:text-ink"
                      >
                        {oa.person ? `${oa.person} · ` : ""}
                        {oa.meeting_title || "untitled note"} ·{" "}
                        {relDate(oa.meeting_created)} ↗
                      </button>
                      {tidy && verdictOf(oa) && !oa.action.parked && (
                        <TidyLine
                          v={verdictOf(oa)!}
                          label={tidy.label}
                          onDone={() => onDone(oa)}
                          onHold={() => onPark(oa, true)}
                          onDismiss={() => tidy.onDismiss(bridgeId(oa.dir, oa.action.id))}
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {js && js.status !== "open" && (
                        <Chip tone="olive" title={js.note || js.status}>
                          {js.status}
                        </Chip>
                      )}
                      {(oa.action.due_label || oa.action.due_date) && (
                        <Chip tone={overdue ? "alert" : "outline"}>
                          {overdue ? "overdue · " : ""}
                          {oa.action.due_label || oa.action.due_date}
                        </Chip>
                      )}
                      <Chip tone={ownerTone(oa.action.owner)}>
                        {oa.action.owner}
                      </Chip>
                      {!isMine(oa) && (
                        <Button
                          size="sm"
                          tone="quiet"
                          disabled={busy}
                          onClick={() => onNudge(oa)}
                          title="draft a WhatsApp nudge"
                        >
                          nudge
                        </Button>
                      )}
                      <Button
                        size="sm"
                        tone="ghost"
                        disabled={busy}
                        onClick={() => onPark(oa, !oa.action.parked)}
                        title={oa.action.parked ? "back on the list" : "not now"}
                      >
                        {oa.action.parked ? "back on" : "later"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
    </div>
  );
}
