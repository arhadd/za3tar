import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MarkdownLite } from "./MarkdownLite";

type Level = { peak: number; seconds: number };
type Segment = { speaker: string; start: number; text: string };
type Phase = "idle" | "recording" | "processing" | "done";

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
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
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

  async function start() {
    setError(null);
    setPermissionHint(null);
    setSegments(null);
    setNotes(null);
    setLevels({});
    setElapsed(0);
    try {
      await invoke("start_recording");
      setPhase("recording");
    } catch (e) {
      setError(String(e));
    }
  }

  async function stop() {
    try {
      const d = await invoke<string>("stop_recording");
      setDir(d);
      setPhase("processing");
      setBusy("transcribing the two tracks…");
      const segs = await invoke<Segment[]>("transcribe", { dir: d });
      setSegments(segs);
      setPhase("done");
    } catch (e) {
      setError(String(e));
      setPhase("done");
    } finally {
      setBusy(null);
    }
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
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function copyNotes() {
    if (!notes) return;
    await navigator.clipboard.writeText(notes);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-2xl font-bold text-olive-deep">za3tar</h1>
        <span className="ml-auto text-xs text-ink-soft">
          meeting notes, بالعربيزي
        </span>
      </header>

      {phase === "idle" && (
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="what's this meeting? (optional)"
          className="rounded-xl border border-sesame bg-white px-4 py-3 text-sm outline-none focus:border-olive"
        />
      )}

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
        <div className="rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-ink">
          🫧 {permissionHint}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-olive" />
          {busy}
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
                  {s.speaker === "me" ? "me" : "them"}
                </span>
                <p dir="rtl" className="arabic text-right text-sm text-ink">
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          {!notes && (
            <button
              onClick={makeNotes}
              disabled={!!busy}
              className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
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
              onClick={copyNotes}
              className="ml-auto rounded-lg bg-sesame px-3 py-1 text-xs text-ink-soft hover:text-olive-deep"
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

export default App;
