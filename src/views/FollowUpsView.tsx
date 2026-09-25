// To-dos: what someone owes from a note (stored as open actions). Inside a
// workspace it is that workspace's list; from the sidebar it is every to-do
// across workspaces, grouped by workspace.
import { useState } from "react";
import { Button, Chip, Empty, ownerTone } from "../ui";
import { bridgeId, relDate, todayISO } from "../format";
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
        <span dir="auto" className="arabic text-start text-[14px]">
          {oa.action.title}
        </span>
        {where && (
          <button
            onClick={() => onOpen(oa)}
            className="self-start text-[11px] text-olive hover:text-ink"
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
        <span dir="auto" className="arabic text-start text-[14px]">
          {d.decision.text}
        </span>
        <span className="text-[11px] text-olive">
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
        {runtimeReady && openActions.length > 0 && (
          <Button
            tone="ghost"
            size="sm"
            className="ml-auto"
            onClick={onSync}
            disabled={busy}
            title="check with your assistant what was nudged, answered or done"
          >
            check for updates
          </Button>
        )}
      </div>

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
                      <span dir="auto" className="arabic text-start text-[14px]">
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
