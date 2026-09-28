import { useEffect, useState } from "react";
import { Button, Card, Chip, Empty, Eyebrow, Field } from "../ui";
import { fmtDur, hhmmToMin, relDate } from "../format";
import type { RuntimeSchedule, Summary, Workspace } from "../types";

const SCOPE_KEY = "za3tar.meetings.scope";

export function MeetingsView({
  library,
  workspaces,
  currentWs,
  currentDir,
  onOpen,
  runtimeReady,
  schedule,
  onFetchToday,
  onPrefill,
  onCreateBrief,
  briefRequested,
  onBriefShown,
  busy,
}: {
  /** every meeting, across all workspaces */
  library: Summary[];
  workspaces: Workspace[];
  currentWs: string;
  currentDir: string | null;
  onOpen: (dir: string, workspace: string) => void;
  runtimeReady: boolean;
  schedule: RuntimeSchedule | null;
  onFetchToday: () => void;
  onPrefill: (title: string, person: string) => void;
  onCreateBrief: (b: {
    title: string;
    person: string;
    notes: string;
  }) => Promise<void>;
  briefRequested?: boolean;
  onBriefShown?: () => void;
  busy: boolean;
}) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const [q, setQ] = useState("");
  // Meetings used to be visible only inside their own workspace, so a meeting
  // filed elsewhere (or recorded while another workspace was open) looked lost.
  // Default to everything; "this workspace" narrows it back down.
  const [scope, setScope] = useState<"all" | "here">(() => {
    try {
      return localStorage.getItem(SCOPE_KEY) === "here" ? "here" : "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SCOPE_KEY, scope);
    } catch {
      /* fine */
    }
  }, [scope]);
  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;
  const scoped =
    scope === "all"
      ? library
      : library.filter((s) => s.workspace === currentWs);
  const [brief, setBrief] = useState<{
    title: string;
    person: string;
    notes: string;
  } | null>(null);
  useEffect(() => {
    if (briefRequested) {
      setBrief({ title: "", person: "", notes: "" });
      onBriefShown?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefRequested]);
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? scoped.filter(
        (s) =>
          s.title.toLowerCase().includes(needle) ||
          s.person.toLowerCase().includes(needle),
      )
    : scoped;

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
              Nothing on the calendar today.
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
        <div className="flex items-center gap-2 px-1">
          <Eyebrow>Notes</Eyebrow>
          <Field
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="find by title or person"
            className="ml-auto w-56 py-1 text-[12px]"
          />
          <Button
            tone="quiet"
            size="sm"
            onClick={() =>
              setBrief(brief ? null : { title: "", person: "", notes: "" })
            }
          >
            {brief ? "cancel" : "+ paste notes"}
          </Button>
        </div>
        {brief && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onCreateBrief(brief);
              setBrief(null);
            }}
            className="flex flex-col gap-2 rounded-xl border border-ink/40 bg-paper p-4"
          >
            <span className="text-[12px] text-olive">
              Paste meeting notes, a chat, or a message. Za3tar pulls out the
              decisions and to-dos from it.
            </span>
            <div className="flex gap-2">
              <Field
                dir="auto"
                autoFocus
                value={brief.title}
                onChange={(e) => setBrief({ ...brief, title: e.target.value })}
                placeholder="what is this about?"
                className="arabic flex-[2]"
              />
              <Field
                dir="auto"
                value={brief.person}
                onChange={(e) => setBrief({ ...brief, person: e.target.value })}
                placeholder="with whom?"
                className="arabic flex-1"
              />
            </div>
            <textarea
              dir="auto"
              value={brief.notes}
              onChange={(e) => setBrief({ ...brief, notes: e.target.value })}
              placeholder="notes, in whatever language they came in"
              className="arabic min-h-32 rounded-lg border border-line bg-white p-3 text-start text-[13px] outline-none focus:border-ink"
            />
            <div>
              <Button tone="primary" size="sm" type="submit" disabled={busy}>
                add note
              </Button>
            </div>
          </form>
        )}
        {library.length === 0 && !brief && (
          <Empty>
            No notes yet. Hit Record when a meeting starts, or paste notes.
          </Empty>
        )}
        {library.length > 0 && (
          <div className="flex items-center gap-1 px-1 text-[12px]">
            {(["all", "here"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setScope(v)}
                className={`rounded-full px-2.5 py-1 ${
                  scope === v
                    ? "bg-ink text-paper"
                    : "text-olive hover:text-ink"
                }`}
              >
                {v === "all" ? "all workspaces" : wsName(currentWs)}
              </button>
            ))}
          </div>
        )}
        {library.length > 0 && shown.length === 0 && (
          <Empty>
            {needle
              ? `Nothing matches "${q}".`
              : `No meetings in ${wsName(currentWs)} yet.`}
          </Empty>
        )}
        <div className="flex flex-col gap-1">
          {shown.map((s) => (
            <button
              key={s.id}
              onClick={() => onOpen(s.dir, s.workspace)}
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
                  {s.title || "Untitled note"}
                </span>
                <span className="text-[12px] text-olive">
                  {s.person ? `${s.person} · ` : ""}
                  {relDate(s.created)}
                  {scope === "all" && s.workspace !== currentWs
                    ? ` · ${wsName(s.workspace)}`
                    : ""}
                  {s.has_audio ? ` · ${fmtDur(s.duration_secs)}` : ""}
                </span>
              </div>
              {!s.has_audio ? (
                <Chip tone="outline">pasted</Chip>
              ) : s.has_notes ? (
                <Chip tone="olive">recording</Chip>
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
