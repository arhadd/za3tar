import { Button, Chip, Empty, Eyebrow } from "../ui";
import { relDate } from "../format";
import type { DecisionRef, DecisionStatus } from "../types";

export const statusTone: Record<
  DecisionStatus,
  "accent" | "olive" | "outline"
> = {
  confirmed: "accent",
  proposed: "outline",
  superseded: "olive",
};

export function DecisionRow({
  d,
  onStatus,
  showMeeting,
  onOpenMeeting,
  busy,
}: {
  d: DecisionRef;
  onStatus: (d: DecisionRef, status: DecisionStatus) => void;
  showMeeting?: boolean;
  onOpenMeeting?: (dir: string) => void;
  busy: boolean;
}) {
  const s = d.decision.status;
  return (
    <div className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4">
      <Chip tone={statusTone[s]} className="mt-0.5 w-[82px] justify-center">
        {s}
      </Chip>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          dir="auto"
          className={`arabic text-start text-[14px] ${
            s === "superseded" ? "text-olive line-through" : ""
          }`}
        >
          {d.decision.text}
        </span>
        {d.decision.note && (
          <span dir="auto" className="arabic text-start text-[12px] text-olive">
            {d.decision.note}
          </span>
        )}
        {showMeeting && (
          <button
            onClick={() => onOpenMeeting?.(d.dir)}
            className="self-start text-[12px] text-olive hover:text-ink"
          >
            {d.person ? `${d.person} · ` : ""}
            {d.meeting_title || "untitled note"} ·{" "}
            {relDate(d.meeting_created)} ↗
          </button>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {s !== "confirmed" && (
          <Button
            size="sm"
            tone="quiet"
            disabled={busy}
            onClick={() => onStatus(d, "confirmed")}
          >
            confirm
          </Button>
        )}
        {s !== "superseded" && (
          <Button
            size="sm"
            tone="ghost"
            disabled={busy}
            onClick={() => onStatus(d, "superseded")}
          >
            supersede
          </Button>
        )}
        {s === "superseded" && (
          <Button
            size="sm"
            tone="ghost"
            disabled={busy}
            onClick={() => onStatus(d, "proposed")}
          >
            reopen
          </Button>
        )}
      </div>
    </div>
  );
}

export function DecisionsView({
  decisions,
  onStatus,
  onOpenMeeting,
  busy,
}: {
  decisions: DecisionRef[];
  onStatus: (d: DecisionRef, status: DecisionStatus) => void;
  onOpenMeeting: (dir: string) => void;
  busy: boolean;
}) {
  const groups: { status: DecisionStatus; label: string }[] = [
    { status: "proposed", label: "Waiting for a yes" },
    { status: "confirmed", label: "Confirmed" },
    { status: "superseded", label: "Superseded" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline gap-2 px-1">
        <Eyebrow>Decisions</Eyebrow>
        <span className="text-[12px] text-olive">
          what this workspace has settled. Extracted ones stay proposed until
          you confirm them.
        </span>
      </div>
      {decisions.length === 0 && (
        <Empty>
          No decisions yet. They appear here once a note is processed.
        </Empty>
      )}
      {groups.map((g) => {
        const rows = decisions.filter((d) => d.decision.status === g.status);
        if (!rows.length) return null;
        return (
          <section key={g.status} className="flex flex-col gap-1">
            <h4 className="px-1 text-[12px] font-medium text-olive">
              {g.label} · {rows.length}
            </h4>
            <div className="rounded-xl border border-line bg-paper p-2">
              {rows.map((d) => (
                <DecisionRow
                  key={`${d.dir}-${d.decision.id}`}
                  d={d}
                  onStatus={onStatus}
                  showMeeting
                  onOpenMeeting={onOpenMeeting}
                  busy={busy}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
