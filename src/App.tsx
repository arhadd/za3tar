import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MarkdownLite } from "./MarkdownLite";

type Level = { peak: number; seconds: number };
type Segment = { speaker: string; start: number; text: string };
type Phase = "idle" | "recording" | "processing" | "done";
type Summary = {
  dir: string;
  id: string;
  created: number;
  title: string;
  has_transcript: boolean;
  has_notes: boolean;
  duration_secs: number;
};
type ActionItem = {
  id: number;
  title: string;
  owner: string;
  due_label?: string | null;
  due_date?: string | null;
  detail?: string | null;
  done: boolean;
};
type MeetingActions = {
  decisions: string[];
  actions: ActionItem[];
  questions: string[];
};
type DraftKind = "whatsapp" | "email";
type Draft = { kind: DraftKind; subject: string; body: string };

/** Meeting date passed to the extractor so it can resolve "بكرا" to a real date. */
function todayContext(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.toISOString().slice(0, 10)} (${weekday})`;
}

function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dir, setDir] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ mic?: Level; system?: Level }>({});
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [title, setTitle] = useState("");
  const [roughNotes, setRoughNotes] = useState("");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [actions, setActions] = useState<MeetingActions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [library, setLibrary] = useState<Summary[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewingPast, setViewingPast] = useState(false);
  const timer = useRef<number | null>(null);

  // whether anyone besides the user was heard (them / them2 / …)
  const heardThem = !!segments?.some((s) => s.speaker !== "me");

  async function refreshLibrary() {
    try {
      setLibrary(await invoke<Summary[]>("list_recordings"));
    } catch {
      /* library is best-effort */
    }
  }

  useEffect(() => {
    refreshLibrary();
    const un = listen<any>("capture-event", (e) => {
      const p = e.payload;
      if (p?.event === "level")
        setLevels((c) => ({
          ...c,
          [p.track]: { peak: p.peak ?? 0, seconds: p.seconds ?? 0 },
        }));
      else if (p?.event === "permission_hint")
        setPermissionHint(p.message ?? "system audio permission needed");
      else if (p?.event === "error")
        setError(`${p.track ? p.track + ": " : ""}${p.message}`);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (phase === "recording") {
      const started = Date.now();
      timer.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - started) / 1000)),
        250,
      );
    } else if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [phase]);

  function showFlash(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2000);
  }

  async function start() {
    setError(null);
    setPermissionHint(null);
    setSegments(null);
    setNotes(null);
    setActions(null);
    setDraft(null);
    setLevels({});
    setElapsed(0);
    setViewingPast(false);
    setShowLibrary(false);
    try {
      await invoke("start_recording");
      setPhase("recording");
    } catch (e) {
      setError(String(e));
    }
  }

  /** notes + actions for a given recording; each step fails soft so the
   *  matching button stays available instead of killing the whole flow. */
  async function synthesize(d: string) {
    try {
      setBusy("writing your notes…");
      const md = await invoke<string>("generate_notes", {
        dir: d,
        roughNotes: roughNotes.trim() || null,
        title: title.trim() || null,
      });
      setNotes(md);
    } catch (e) {
      setError(String(e));
    }
    try {
      setBusy("pulling out decisions & actions…");
      const a = await invoke<MeetingActions>("extract_actions", {
        dir: d,
        title: title.trim() || null,
        today: todayContext(),
      });
      setActions(a);
      setDraft(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      refreshLibrary();
    }
  }

  async function stop() {
    try {
      const d = await invoke<string>("stop_recording");
      setDir(d);
      if (title.trim())
        invoke("set_recording_title", { dir: d, title: title.trim() }).catch(
          () => {},
        );
      setPhase("processing");
      setBusy("transcribing the two tracks…");
      const segs = await invoke<Segment[]>("transcribe", { dir: d });
      setSegments(segs);
      setPhase("done");
      // the whole point: stop → notes → actions, no clicks
      await synthesize(d);
    } catch (e) {
      setError(String(e));
      setPhase("done");
      setBusy(null);
    }
  }

  async function transcribePast() {
    if (!dir) return;
    setError(null);
    setBusy("transcribing the two tracks…");
    try {
      const segs = await invoke<Segment[]>("transcribe", { dir });
      setSegments(segs);
      refreshLibrary();
    } catch (e) {
      setError(String(e));
      setBusy(null);
      return;
    }
    await synthesize(dir);
  }

  async function makeNotes() {
    if (!dir) return;
    setError(null);
    setBusy("writing your notes…");
    try {
      const md = await invoke<string>("generate_notes", {
        dir,
        roughNotes: roughNotes.trim() || null,
        title: title.trim() || null,
      });
      setNotes(md);
      refreshLibrary();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function extractActions() {
    if (!dir) return;
    setError(null);
    setBusy("pulling out decisions & actions…");
    try {
      const a = await invoke<MeetingActions>("extract_actions", {
        dir,
        title: title.trim() || null,
        today: todayContext(),
      });
      setActions(a);
      setDraft(null);
      refreshLibrary();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleDone(a: ActionItem) {
    if (!dir || !actions) return;
    const next = {
      ...actions,
      actions: actions.actions.map((x) =>
        x.id === a.id ? { ...x, done: !x.done } : x,
      ),
    };
    setActions(next);
    invoke("set_action_done", { dir, id: a.id, done: !a.done }).catch(() => {});
  }

  async function makeDraft(kind: DraftKind) {
    if (!dir) return;
    setError(null);
    setBusy(
      kind === "whatsapp"
        ? "drafting the whatsapp follow-up…"
        : "drafting the recap email…",
    );
    try {
      const d = await invoke<{ subject?: string | null; body: string }>(
        "draft_followup",
        { dir, kind, title: title.trim() || null },
      );
      setDraft({ kind, subject: d.subject ?? "", body: d.body });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft() {
    if (!draft) return;
    try {
      if (draft.kind === "whatsapp") {
        const text = encodeURIComponent(draft.body);
        try {
          await invoke("open_external", {
            url: `whatsapp://send?text=${text}`,
          });
        } catch {
          await invoke("open_external", { url: `https://wa.me/?text=${text}` });
        }
      } else {
        const url = `mailto:?subject=${encodeURIComponent(
          draft.subject,
        )}&body=${encodeURIComponent(draft.body)}`;
        await invoke("open_external", { url });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportCalendar() {
    if (!dir) return;
    setError(null);
    try {
      await invoke<string>("export_calendar", {
        dir,
        title: title.trim() || null,
      });
      showFlash("sent to Calendar 📅");
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(
      draft.kind === "email" && draft.subject
        ? `${draft.subject}\n\n${draft.body}`
        : draft.body,
    );
    showFlash("draft copied ✓");
  }

  /** notes + open actions + questions as one markdown packet. */
  function packetMarkdown(): string {
    let md = `# ${title.trim() || "meeting"} — ${new Date().toLocaleDateString()}\n\n`;
    if (notes) md += `${notes}\n\n`;
    if (actions) {
      if (actions.actions.length) {
        md += `## action items\n`;
        for (const a of actions.actions) {
          const due = a.due_label || a.due_date;
          md += `- [${a.done ? "x" : " "}] ${a.title} — **${a.owner}**${due ? ` (${due})` : ""}\n`;
        }
        md += "\n";
      }
      if (actions.questions.length) {
        md += `## open questions\n`;
        for (const q of actions.questions) md += `- ${q}\n`;
      }
    }
    return md.trim();
  }

  async function copyPacket() {
    await navigator.clipboard.writeText(packetMarkdown());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function openPast(s: Summary) {
    setError(null);
    setPermissionHint(null);
    setBusy(null);
    try {
      const detail = await invoke<{
        title: string;
        segments: Segment[];
        notes: string | null;
      }>("load_recording", { dir: s.dir });
      const past = await invoke<MeetingActions | null>("load_actions", {
        dir: s.dir,
      }).catch(() => null);
      setDir(s.dir);
      setTitle(detail.title);
      setSegments(detail.segments.length ? detail.segments : null);
      setNotes(detail.notes);
      setActions(past);
      setDraft(null);
      setRoughNotes("");
      setViewingPast(true);
      setShowLibrary(false);
      setPhase("done");
    } catch (e) {
      setError(String(e));
    }
  }

  function grantSystemAudio() {
    invoke("open_system_audio_settings").catch(() => {});
  }

  function ownerChipClass(owner: string): string {
    if (owner === "me") return "bg-olive/15 text-olive-deep";
    if (owner.startsWith("them")) return "bg-sumac/15 text-sumac";
    return "bg-sesame text-ink-soft";
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  const openCount = actions?.actions.filter((a) => !a.done).length ?? 0;

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-2xl font-bold text-olive-deep">za3tar</h1>
        <span className="hidden text-xs text-ink-soft sm:inline">
          from meeting to done, بالعربيزي
        </span>
        <button
          onClick={() => {
            refreshLibrary();
            setShowLibrary((v) => !v);
          }}
          className="ml-auto rounded-lg px-2.5 py-1 text-xs text-ink-soft transition hover:bg-sesame hover:text-olive-deep"
        >
          {showLibrary
            ? "close"
            : `past meetings${library.length ? ` · ${library.length}` : ""}`}
        </button>
      </header>

      {showLibrary && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-white p-2">
          {library.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-soft">
              no meetings yet — hit record 🌿
            </p>
          )}
          {library.map((s) => (
            <button
              key={s.id}
              onClick={() => openPast(s)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-cream ${
                dir === s.dir ? "bg-cream" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">
                  {s.title || "untitled meeting"}
                </span>
                <span className="text-[11px] text-ink-soft">
                  {relDate(s.created)} · {fmtDur(s.duration_secs)}
                </span>
              </div>
              <div className="flex shrink-0 gap-1 text-[10px]">
                {s.has_notes ? (
                  <span className="rounded bg-olive/15 px-1.5 py-0.5 text-olive-deep">
                    notes
                  </span>
                ) : s.has_transcript ? (
                  <span className="rounded bg-sesame px-1.5 py-0.5 text-ink-soft">
                    transcript
                  </span>
                ) : (
                  <span className="rounded bg-sesame px-1.5 py-0.5 text-ink-soft">
                    audio
                  </span>
                )}
              </div>
            </button>
          ))}
        </section>
      )}

      {(phase === "idle" || viewingPast) && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (viewingPast && dir)
              invoke("set_recording_title", {
                dir,
                title: title.trim(),
              }).catch(() => {});
          }}
          placeholder="what's this meeting? (optional)"
          className="rounded-xl border border-sesame bg-white px-4 py-3 text-sm outline-none focus:border-olive"
        />
      )}

      {!viewingPast && (
        <button
          onClick={phase === "recording" ? stop : start}
          disabled={phase === "processing"}
          className={`flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold text-white transition disabled:opacity-60 ${
            phase === "recording" ? "bg-sumac" : "bg-olive hover:bg-olive-deep"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white ${
              phase === "recording" ? "animate-pulse" : ""
            }`}
          />
          {phase === "recording"
            ? `stop · ${mmss}`
            : phase === "processing"
              ? "…"
              : segments
                ? "record another"
                : "start recording"}
        </button>
      )}

      {viewingPast && (
        <button
          onClick={start}
          className="flex items-center justify-center gap-3 rounded-2xl bg-olive px-6 py-4 text-base font-semibold text-white transition hover:bg-olive-deep"
        >
          <span className="inline-block h-3 w-3 rounded-full bg-white" />
          new recording
        </button>
      )}

      {viewingPast && !segments && !busy && (
        <button
          onClick={transcribePast}
          className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
        >
          transcribe this recording
        </button>
      )}

      {phase === "recording" && (
        <>
          <div className="flex flex-col gap-3">
            <LevelBar
              label="me (mic)"
              level={levels.mic}
              color="var(--color-olive)"
            />
            <LevelBar
              label="them (system)"
              level={levels.system}
              color="var(--color-sumac)"
            />
          </div>
          <textarea
            value={roughNotes}
            onChange={(e) => setRoughNotes(e.target.value)}
            placeholder="jot rough notes while you talk — za3tar folds them into the summary…"
            className="min-h-24 rounded-xl border border-sesame bg-white p-3 text-sm outline-none focus:border-olive"
          />
        </>
      )}

      {permissionHint && (
        <div className="flex flex-col gap-2 rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-ink">
          <span>🫧 {permissionHint}</span>
          <button
            onClick={grantSystemAudio}
            className="self-start rounded-lg bg-sumac px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            open System Settings
          </button>
        </div>
      )}

      {/* after processing: if only the user was heard, the system-audio grant is
          missing (in-person voices would have been split by diarization) */}
      {phase === "done" &&
        !viewingPast &&
        segments &&
        !heardThem &&
        !permissionHint && (
          <div className="flex flex-col gap-2 rounded-xl border border-sesame bg-white p-4 text-sm text-ink">
            <span>
              🫧 sme3na بس صوتك — the other side's track was silent. grant{" "}
              <b>System Audio Recording</b> so za3tar captures them too.
            </span>
            <button
              onClick={grantSystemAudio}
              className="self-start rounded-lg bg-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-olive-deep"
            >
              open System Settings
            </button>
          </div>
        )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-olive" />
          {busy}
        </div>
      )}

      {flash && (
        <div className="rounded-xl bg-olive/10 px-4 py-2 text-sm text-olive-deep">
          {flash}
        </div>
      )}

      {segments && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">transcript</h2>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl bg-white p-3">
            {segments.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      s.speaker === "me"
                        ? "var(--color-olive)"
                        : "var(--color-sumac)",
                  }}
                >
                  {s.speaker}
                </span>
                <p dir="rtl" className="arabic text-right text-sm text-ink">
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          {!notes && !busy && (
            <button
              onClick={makeNotes}
              className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
            >
              ✍️ make notes
            </button>
          )}
        </section>
      )}

      {notes && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">notes</h2>
            <button
              onClick={makeNotes}
              disabled={!!busy}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep disabled:opacity-60"
            >
              regenerate
            </button>
            <button
              onClick={copyPacket}
              className="rounded-lg bg-sesame px-3 py-1 text-xs text-ink-soft hover:text-olive-deep"
            >
              {copied ? "copied ✓" : "copy markdown"}
            </button>
          </div>
          <div
            dir="rtl"
            className="arabic rounded-xl bg-white p-4 text-right text-sm leading-relaxed text-ink"
          >
            <MarkdownLite md={notes} />
          </div>
        </section>
      )}

      {segments && !actions && !busy && (
        <button
          onClick={extractActions}
          className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
        >
          🎯 pull out decisions & actions
        </button>
      )}

      {actions && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">
              what came out of it
            </h2>
            {openCount > 0 && (
              <span className="rounded-full bg-sumac/15 px-2 py-0.5 text-[11px] font-medium text-sumac">
                {openCount} open
              </span>
            )}
            <button
              onClick={extractActions}
              disabled={!!busy}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep disabled:opacity-60"
            >
              re-extract
            </button>
          </div>

          {actions.decisions.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
                decisions
              </h3>
              {actions.decisions.map((d, i) => (
                <p
                  key={i}
                  dir="auto"
                  className="arabic text-start text-sm text-ink"
                >
                  ✅ {d}
                </p>
              ))}
            </div>
          )}

          {actions.actions.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl bg-white p-3">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-olive-deep">
                action items
              </h3>
              {actions.actions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-cream"
                >
                  <button
                    onClick={() => toggleDone(a)}
                    aria-label={a.done ? "mark not done" : "mark done"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition ${
                      a.done
                        ? "border-olive bg-olive text-white"
                        : "border-sesame bg-white text-transparent hover:border-olive"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      dir="auto"
                      className={`arabic text-start text-sm ${
                        a.done ? "text-ink-soft line-through" : "text-ink"
                      }`}
                    >
                      {a.title}
                    </span>
                    {a.detail && (
                      <span
                        dir="auto"
                        className="arabic text-start text-xs text-ink-soft"
                      >
                        {a.detail}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(a.due_label || a.due_date) && (
                      <span className="rounded bg-cream px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {a.due_label || a.due_date}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ownerChipClass(a.owner)}`}
                    >
                      {a.owner}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {actions.questions.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
                open questions
              </h3>
              {actions.questions.map((q, i) => (
                <p
                  key={i}
                  dir="auto"
                  className="arabic text-start text-sm text-ink"
                >
                  ❓ {q}
                </p>
              ))}
            </div>
          )}

          {actions.decisions.length === 0 &&
            actions.actions.length === 0 &&
            actions.questions.length === 0 && (
              <p className="rounded-xl bg-white p-4 text-sm text-ink-soft">
                ما في قرارات أو مهام واضحة بهاللقاء — حكي حلو بس 🌿
              </p>
            )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => makeDraft("whatsapp")}
              disabled={!!busy}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
            >
              💬 whatsapp follow-up
            </button>
            <button
              onClick={() => makeDraft("email")}
              disabled={!!busy}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
            >
              ✉️ recap email
            </button>
            <button
              onClick={exportCalendar}
              disabled={!!busy}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20 disabled:opacity-60"
            >
              📅 add to Calendar
            </button>
            <button
              onClick={copyPacket}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20"
            >
              {copied ? "copied ✓" : "📋 copy packet"}
            </button>
          </div>
        </section>
      )}

      {draft && (
        <section className="flex flex-col gap-2 rounded-2xl border border-olive/30 bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-olive-deep">
              {draft.kind === "whatsapp"
                ? "💬 whatsapp draft"
                : "✉️ email draft"}
            </h2>
            <span className="text-[11px] text-ink-soft">
              edit it, then send — nothing leaves without you
            </span>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep"
            >
              close
            </button>
          </div>
          {draft.kind === "email" && (
            <input
              dir="auto"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="subject"
              className="arabic rounded-lg border border-sesame px-3 py-2 text-start text-sm outline-none focus:border-olive"
            />
          )}
          <textarea
            dir="auto"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            className="arabic min-h-40 rounded-lg border border-sesame p-3 text-start text-sm leading-relaxed outline-none focus:border-olive"
          />
          <div className="flex gap-2">
            <button
              onClick={sendDraft}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
            >
              {draft.kind === "whatsapp" ? "open in WhatsApp" : "open in Mail"}
            </button>
            <button
              onClick={copyDraft}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20"
            >
              copy
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-sumac">
          🫧 {error}
        </div>
      )}
    </main>
  );
}

function LevelBar({
  label,
  level,
  color,
}: {
  label: string;
  level?: Level;
  color: string;
}) {
  const pct = Math.min(100, (level?.peak ?? 0) * 300);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-ink-soft">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sesame">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function fmtDur(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function relDate(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `today ${time}`;
  const yst = new Date(now);
  yst.setDate(now.getDate() - 1);
  if (d.toDateString() === yst.toDateString()) return `yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default App;
