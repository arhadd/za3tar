import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Level = { peak: number; seconds: number };

function App() {
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<{ mic?: Level; system?: Level }>({});
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [savedDir, setSavedDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);

  // subscribe to the native capture helper's event stream
  useEffect(() => {
    const un = listen<any>("capture-event", (e) => {
      const p = e.payload;
      switch (p?.event) {
        case "level":
          setLevels((cur) => ({
            ...cur,
            [p.track]: { peak: p.peak ?? 0, seconds: p.seconds ?? 0 },
          }));
          break;
        case "permission_hint":
          setPermissionHint(p.message ?? "system audio permission needed");
          break;
        case "error":
          setError(`${p.track ? p.track + ": " : ""}${p.message}`);
          break;
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  // simple elapsed timer while recording
  useEffect(() => {
    if (recording) {
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
  }, [recording]);

  async function toggle() {
    setError(null);
    try {
      if (!recording) {
        setPermissionHint(null);
        setSavedDir(null);
        setLevels({});
        setElapsed(0);
        await invoke("start_recording");
        setRecording(true);
      } else {
        const dir = await invoke<string>("stop_recording");
        setRecording(false);
        setSavedDir(dir);
      }
    } catch (e) {
      setError(String(e));
      setRecording(false);
    }
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col gap-6 p-8">
      <header className="flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-2xl font-bold text-olive-deep">za3tar</h1>
        <span className="ml-auto text-xs text-ink-soft">
          capture spike · m1
        </span>
      </header>

      <button
        onClick={toggle}
        className={`flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold text-white transition ${
          recording ? "bg-sumac" : "bg-olive hover:bg-olive-deep"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white ${
            recording ? "animate-pulse" : ""
          }`}
        />
        {recording ? `stop recording · ${mmss}` : "start recording"}
      </button>

      {recording && (
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
      )}

      {permissionHint && (
        <div className="rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-ink">
          🫧 {permissionHint}
        </div>
      )}

      {savedDir && (
        <div className="rounded-xl bg-sesame p-4 text-sm text-ink-soft">
          saved two tracks to
          <div className="mt-1 font-mono text-xs break-all text-olive-deep">
            {savedDir}
          </div>
          <div className="mt-1">system.wav (them) · mic.wav (me)</div>
        </div>
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
  // speech peaks are low (~0.1–0.2), so amplify for a readable bar
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
