import { useState } from "react";
import { Button, Chip, Empty, Eyebrow, ownerTone } from "../ui";
import { bridgeId, relDate, todayISO } from "../format";
import type { OpenAction, RuntimeFollowupStatus } from "../types";

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
}: {
  onPark: (oa: OpenAction, parked: boolean) => void;
  openActions: OpenAction[];
  runtimeStatus: Record<string, RuntimeFollowupStatus>;
  runtimeReady: boolean;
  onSync: () => void;
  onDone: (oa: OpenAction) => void;
  onNudge: (oa: OpenAction) => void;
  onOpenMeeting: (dir: string) => void;
  busy: boolean;
}) {
  const today = todayISO();
  const [lens, setLens] = useState<"mine" | "others" | "all" | "parked">("mine");
  const parkedN = openActions.filter((o) => o.action.parked).length;
  const live = openActions.filter((o) => !o.action.parked);
  const isMine = (o: OpenAction) =>
    o.action.owner === "me" || /^(ala|me)\b/i.test(o.action.owner);
  const shown =
    lens === "parked"
      ? openActions.filter((o) => o.action.parked)
      : lens === "mine"
        ? live.filter(isMine)
        : lens === "others"
          ? live.filter((o) => !isMine(o))
          : live;
  const lenses: { id: typeof lens; label: string; n: number }[] = [
    { id: "mine", label: "on me", n: live.filter(isMine).length },
    { id: "others", label: "waiting on others", n: live.filter((o) => !isMine(o)).length },
    { id: "all", label: "all", n: live.length },
    { id: "parked", label: "parked", n: parkedN },
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Eyebrow>Follow-ups</Eyebrow>
        <div className="flex gap-1">
          {lenses.map((l) => (
            <button
              key={l.id}
              onClick={() => setLens(l.id)}
              className={`rounded-md px-2 py-0.5 text-[12px] transition-colors ${
                lens === l.id ? "bg-ink text-limestone" : "text-olive hover:text-ink"
              }`}
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
            title="pull nudged / replied / done statuses back in"
          >
            sync
          </Button>
        )}
      </div>
      {shown.length === 0 && (
        <Empty>
          {lens === "mine"
            ? "كله سالك — nothing on you right now."
            : lens === "parked"
              ? "Nothing parked."
              : "Nothing here."}
        </Empty>
      )}
      {shown.length > 0 && (
        <div className="rounded-xl border border-line bg-paper p-2">
          {shown.map((oa) => {
            const overdue = !!oa.action.due_date && oa.action.due_date < today;
            const js = runtimeStatus[bridgeId(oa.dir, oa.action.id)];
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
                    onClick={() => onOpenMeeting(oa.dir)}
                    className="self-start text-[12px] text-olive hover:text-ink"
                  >
                    {oa.person ? `${oa.person} · ` : ""}
                    {oa.meeting_title || "untitled meeting"} ·{" "}
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
                  <Button
                    size="sm"
                    tone="quiet"
                    disabled={busy}
                    onClick={() => onNudge(oa)}
                    title="draft a WhatsApp nudge"
                  >
                    nudge
                  </Button>
                  <Button
                    size="sm"
                    tone="ghost"
                    disabled={busy}
                    onClick={() => onPark(oa, !oa.action.parked)}
                    title={oa.action.parked ? "back on the list" : "not now"}
                  >
                    {oa.action.parked ? "unpark" : "park"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
