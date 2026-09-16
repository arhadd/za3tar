import { Button, Card, Chip, Empty, Eyebrow } from "../ui";
import { fmtDur, hhmmToMin, relDate } from "../format";
import type { RuntimeSchedule, Summary } from "../types";

export function MeetingsView({
  library,
  currentDir,
  onOpen,
  runtimeReady,
  schedule,
  onFetchToday,
  onPrefill,
  busy,
}: {
  library: Summary[];
  currentDir: string | null;
  onOpen: (dir: string) => void;
  runtimeReady: boolean;
  schedule: RuntimeSchedule | null;
  onFetchToday: () => void;
  onPrefill: (title: string, person: string) => void;
  busy: boolean;
}) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <div className="flex flex-col gap-6">
      {runtimeReady && (
        <Card pad={false} className="p-3">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Today</Eyebrow>
            <Button
              tone="ghost"
              size="sm"
              onClick={onFetchToday}
              disabled={busy}
              className="ml-auto"
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
              رزنامتك فاضية اليوم
            </p>
          )}
          {schedule?.events.map((ev, i) => {
            const s = hhmmToMin(ev.start);
            const e = hhmmToMin(ev.end);
            const live =
              !isNaN(s) && nowMin >= s - 10 && (isNaN(e) || nowMin <= e);
            return (
              <button
                key={i}
                onClick={() => onPrefill(ev.title, ev.attendees[0] ?? "")}
                title="pre-fill the next recording"
                className={`mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink/5 ${
                  live ? "bg-thyme/20" : ""
                }`}
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
                {ev.attendees[0] && (
                  <Chip tone="outline">{ev.attendees[0]}</Chip>
                )}
                {live && <Chip tone="accent">now</Chip>}
              </button>
            );
          })}
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <Eyebrow className="px-1">Meetings</Eyebrow>
        {library.length === 0 && (
          <Empty>
            No meetings in this workspace yet. Hit Record when one starts.
          </Empty>
        )}
        <div className="flex flex-col gap-1">
          {library.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.dir)}
              className={`flex items-center gap-4 rounded-xl border px-4 py-3 text-left transition-colors ${
                currentDir === s.dir
                  ? "border-ink/40 bg-paper"
                  : "border-line bg-paper hover:border-ink/30"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  dir="auto"
                  className="arabic truncate text-start text-[14px] font-medium"
                >
                  {s.title || "Untitled meeting"}
                </span>
                <span className="text-[12px] text-olive">
                  {s.person ? `${s.person} · ` : ""}
                  {relDate(s.created)} · {fmtDur(s.duration_secs)}
                </span>
              </div>
              {s.has_notes ? (
                <Chip tone="olive">notes</Chip>
              ) : s.has_transcript ? (
                <Chip tone="outline">transcript</Chip>
              ) : (
                <Chip tone="outline">audio only</Chip>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
