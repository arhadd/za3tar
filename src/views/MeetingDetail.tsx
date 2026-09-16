import { MarkdownLite } from "../MarkdownLite";
import { Button, Card, Chip, Eyebrow, Field, ownerTone } from "../ui";
import { fmtDur, longDate } from "../format";
import { DecisionRow } from "./DecisionsView";
import type {
  ActionItem,
  DecisionRef,
  DecisionStatus,
  Draft,
  DraftKind,
  Level,
  MeetingActions,
  PersonRow,
  Phase,
  Segment,
  Workspace,
} from "../types";

export type MeetingDetailProps = {
  phase: Phase;
  viewingPast: boolean;
  dir: string | null;
  created?: number;
  duration?: number;
  hasAudio: boolean;
  title: string;
  setTitle: (t: string) => void;
  person: string;
  setPerson: (p: string) => void;
  onMetaBlur: () => void;
  people: PersonRow[];
  workspaces: Workspace[];
  meetingWs: string;
  onMoveWorkspace: (ws: string) => void;

  levels: { mic?: Level; system?: Level };
  roughNotes: string;
  setRoughNotes: (s: string) => void;
  permissionHint: string | null;
  heardThem: boolean;
  onGrantSystemAudio: () => void;

  segments: Segment[] | null;
  notes: string | null;
  actions: MeetingActions | null;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  busy: string | null;
  copied: boolean;
  showTranscript: boolean;
  setShowTranscript: (v: boolean) => void;
  runtimeReady: boolean;

  onBack: () => void;
  onTranscribePast: () => void;
  onMakeNotes: () => void;
  onExtract: () => void;
  onToggleDone: (a: ActionItem) => void;
  onDecisionStatus: (d: DecisionRef, s: DecisionStatus) => void;
  onDraft: (k: DraftKind) => void;
  onSendDraft: () => void;
  onCopyDraft: () => void;
  onDraftViaRuntime: () => void;
  onExportCalendar: () => void;
  onTrack: () => void;
  onCopyPacket: () => void;
};

export function MeetingDetail(p: MeetingDetailProps) {
  const { phase, viewingPast, dir, actions, segments, notes, draft, busy } = p;
  const openCount = actions?.actions.filter((a) => !a.done).length ?? 0;
  const recording = phase === "recording";

  const decisionRef = (
    d: MeetingActions["decisions"][number],
  ): DecisionRef => ({
    dir: dir ?? "",
    meeting_title: p.title,
    meeting_created: p.created ?? 0,
    person: p.person,
    workspace: p.meetingWs,
    decision: d,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* meeting header */}
      <div className="flex flex-col gap-3">
        <button
          onClick={p.onBack}
          className="self-start text-[12px] text-olive hover:text-ink"
        >
          ← all meetings
        </button>
        <div className="flex flex-wrap gap-2">
          <Field
            dir="auto"
            value={p.title}
            onChange={(e) => p.setTitle(e.target.value)}
            onBlur={p.onMetaBlur}
            placeholder={
              recording ? "what's this meeting?" : "Untitled meeting"
            }
            className="arabic flex-[2] text-[16px] font-medium"
          />
          <Field
            dir="auto"
            list="za-people"
            value={p.person}
            onChange={(e) => p.setPerson(e.target.value)}
            onBlur={p.onMetaBlur}
            placeholder="with whom?"
            className="arabic flex-1"
          />
          <datalist id="za-people">
            {p.people.map((x) => (
              <option key={x.name} value={x.name} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-olive">
          {p.created ? <span>{longDate(p.created)}</span> : null}
          {p.duration ? <span>{fmtDur(p.duration)}</span> : null}
          {dir && (
            <label className="flex items-center gap-1.5">
              workspace
              <select
                value={p.meetingWs}
                onChange={(e) => p.onMoveWorkspace(e.target.value)}
                className="rounded-md border border-line bg-white px-1.5 py-0.5 text-[12px] text-ink outline-none focus:border-ink"
              >
                {p.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* live */}
      {recording && (
        <Card className="flex flex-col gap-4 border-thyme bg-thyme/10">
          <div className="flex flex-col gap-2.5">
            <LevelBar label="me (mic)" level={p.levels.mic} />
            <LevelBar label="them (system)" level={p.levels.system} />
          </div>
          <textarea
            dir="auto"
            value={p.roughNotes}
            onChange={(e) => p.setRoughNotes(e.target.value)}
            placeholder="rough notes while you talk — they get folded into the summary"
            className="arabic min-h-24 rounded-lg border border-line bg-white p-3 text-start text-[13px] outline-none focus:border-ink"
          />
        </Card>
      )}

      {p.permissionHint && (
        <Card className="flex flex-col gap-2 border-alert/40 bg-alert/8 text-[13px]">
          <span>{p.permissionHint}</span>
          <Button
            tone="primary"
            size="sm"
            className="self-start"
            onClick={p.onGrantSystemAudio}
          >
            open System Settings
          </Button>
        </Card>
      )}

      {phase === "done" &&
        !viewingPast &&
        segments &&
        !p.heardThem &&
        !p.permissionHint && (
          <Card className="flex flex-col gap-2 text-[13px]">
            <span>
              sme3na بس صوتك — the other side's track was silent. Grant{" "}
              <b>System Audio Recording</b> so Za3tar captures them too.
            </span>
            <Button
              tone="primary"
              size="sm"
              className="self-start"
              onClick={p.onGrantSystemAudio}
            >
              open System Settings
            </Button>
          </Card>
        )}

      {viewingPast && p.hasAudio && !segments && !busy && (
        <Button
          tone="primary"
          className="self-start"
          onClick={p.onTranscribePast}
        >
          transcribe this recording
        </Button>
      )}

      {/* the pipeline steps, kept above the results they produce */}
      {segments && !busy && (!notes || !actions) && (
        <div className="flex flex-wrap gap-2">
          {!notes && (
            <Button tone="primary" onClick={p.onMakeNotes}>
              write the notes
            </Button>
          )}
          {!actions && (
            <Button tone="primary" onClick={p.onExtract}>
              pull out decisions & actions
            </Button>
          )}
        </div>
      )}

      {actions && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>What came out of it</Eyebrow>
            {openCount > 0 && <Chip tone="accent">{openCount} open</Chip>}
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              onClick={p.onExtract}
              disabled={!!busy}
            >
              re-extract
            </Button>
          </div>

          {actions.decisions.length > 0 && (
            <Card pad={false} className="p-2">
              <Eyebrow className="px-2 pt-1 pb-1">Decisions</Eyebrow>
              {actions.decisions.map((d) => (
                <DecisionRow
                  key={d.id}
                  d={decisionRef(d)}
                  onStatus={p.onDecisionStatus}
                  busy={!!busy}
                />
              ))}
            </Card>
          )}

          {actions.actions.length > 0 && (
            <Card pad={false} className="p-2">
              <Eyebrow className="px-2 pt-1 pb-1">Action items</Eyebrow>
              {actions.actions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg px-1 py-2 hover:bg-ink/4"
                >
                  <button
                    onClick={() => p.onToggleDone(a)}
                    aria-label={a.done ? "mark not done" : "mark done"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition-colors ${
                      a.done
                        ? "border-ink bg-ink text-limestone"
                        : "border-line bg-white text-transparent hover:border-ink"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      dir="auto"
                      className={`arabic text-start text-[14px] ${
                        a.done ? "text-olive line-through" : ""
                      }`}
                    >
                      {a.title}
                    </span>
                    {a.detail && (
                      <span
                        dir="auto"
                        className="arabic text-start text-[12px] text-olive"
                      >
                        {a.detail}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(a.due_label || a.due_date) && (
                      <Chip tone="outline">{a.due_label || a.due_date}</Chip>
                    )}
                    <Chip tone={ownerTone(a.owner)}>{a.owner}</Chip>
                  </div>
                </div>
              ))}
            </Card>
          )}

          {actions.questions.length > 0 && (
            <Card className="flex flex-col gap-1.5">
              <Eyebrow>Open questions</Eyebrow>
              {actions.questions.map((q, i) => (
                <p key={i} dir="auto" className="arabic text-start text-[14px]">
                  {q}
                </p>
              ))}
            </Card>
          )}

          {actions.decisions.length === 0 &&
            actions.actions.length === 0 &&
            actions.questions.length === 0 && (
              <Card className="text-[13px] text-olive">
                ما في قرارات أو مهام واضحة بهاللقاء — حكي حلو بس.
              </Card>
            )}

          <div className="flex flex-wrap gap-2">
            <Button
              tone="primary"
              onClick={() => p.onDraft("whatsapp")}
              disabled={!!busy}
            >
              WhatsApp follow-up
            </Button>
            <Button
              tone="primary"
              onClick={() => p.onDraft("email")}
              disabled={!!busy}
            >
              recap email
            </Button>
            <Button onClick={p.onExportCalendar} disabled={!!busy}>
              add to Calendar
            </Button>
            {p.runtimeReady && (
              <Button
                tone="accent"
                onClick={p.onTrack}
                disabled={!!busy}
                title="Za3tar puts dated items on your calendar and keeps following up"
              >
                track & schedule
              </Button>
            )}
            <Button tone="ghost" onClick={p.onCopyPacket}>
              {p.copied ? "copied ✓" : "copy as markdown"}
            </Button>
          </div>
        </section>
      )}

      {draft && (
        <Card className="flex flex-col gap-2 border-ink/40">
          <div className="flex items-center gap-2">
            <Eyebrow>
              {draft.kind === "whatsapp" ? "WhatsApp draft" : "Email draft"}
            </Eyebrow>
            {draft.target && <Chip tone="olive">→ {draft.target}</Chip>}
            <span className="text-[12px] text-olive">
              edit it, then send — nothing leaves without you
            </span>
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => p.setDraft(null)}
            >
              close
            </Button>
          </div>
          {draft.kind === "email" && (
            <Field
              dir="auto"
              value={draft.subject}
              onChange={(e) =>
                p.setDraft({ ...draft, subject: e.target.value })
              }
              placeholder="subject"
              className="arabic text-start"
            />
          )}
          <textarea
            dir="auto"
            value={draft.body}
            onChange={(e) => p.setDraft({ ...draft, body: e.target.value })}
            className="arabic min-h-40 rounded-lg border border-line bg-white p-3 text-start text-[13px] leading-relaxed outline-none focus:border-ink"
          />
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" onClick={p.onSendDraft}>
              {draft.kind === "whatsapp" ? "open in WhatsApp" : "open in Mail"}
            </Button>
            <Button onClick={p.onCopyDraft}>copy</Button>
            {p.runtimeReady && (
              <Button
                tone="accent"
                onClick={p.onDraftViaRuntime}
                disabled={!!busy}
                title="Za3tar delivers it on WhatsApp and confirms"
              >
                Za3tar sends it
              </Button>
            )}
          </div>
        </Card>
      )}

      {notes && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Notes</Eyebrow>
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              onClick={p.onMakeNotes}
              disabled={!!busy}
            >
              regenerate
            </Button>
          </div>
          <Card>
            <div className="arabic selectable text-[14px] leading-relaxed">
              <MarkdownLite md={notes} />
            </div>
          </Card>
        </section>
      )}

      {/* raw material last, and folded away: the outcomes above are the point */}
      {segments && (
        <section className="flex flex-col gap-2">
          <button
            onClick={() => p.setShowTranscript(!p.showTranscript)}
            className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-paper"
          >
            <span className="text-[12px] text-olive">
              {p.showTranscript ? "▾" : "▸"}
            </span>
            <span className="text-[13px] font-medium">
              {p.showTranscript ? "hide transcript" : "show transcript"}
            </span>
            <span className="text-[12px] text-olive">
              {segments.length} turn{segments.length === 1 ? "" : "s"}
            </span>
          </button>
          {p.showTranscript && (
            <Card className="flex max-h-80 flex-col gap-2.5 overflow-y-auto">
              {segments.map((s, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span
                    className={`text-[11px] font-semibold ${
                      s.speaker === "me" ? "text-thyme-deep" : "text-olive"
                    }`}
                  >
                    {s.speaker}
                  </span>
                  <p
                    dir="rtl"
                    className="arabic selectable text-right text-[14px]"
                  >
                    {s.text}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function LevelBar({ label, level }: { label: string; level?: Level }) {
  const pct = Math.min(100, (level?.peak ?? 0) * 300);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-[12px] text-olive">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-150"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
