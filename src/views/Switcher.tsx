// ⌘K: jump to any project, idea or workspace by typing a few letters of it,
// or keep what you typed as an idea. Empty, it lists the projects you opened
// last (not the one on screen), so going back to the previous one is ⌘K, enter.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { Thread, Workspace } from "../types";
import { statusLabel } from "./ThreadsView";

type Place = "home" | "library" | "todos" | "ideas";

type Row =
  | { kind: "project"; t: Thread }
  | { kind: "workspace"; w: Workspace }
  | { kind: "place"; place: Place; label: string }
  | { kind: "idea" };

const PLACES: { place: Place; label: string }[] = [
  { place: "home", label: "Home" },
  { place: "library", label: "Meetings" },
  { place: "todos", label: "To-dos" },
  { place: "ideas", label: "Ideas" },
];

// done projects stay findable, after everything still in motion
const ORDER: Record<Thread["status"], number> = {
  active: 0,
  idea: 1,
  parked: 2,
  done: 3,
};

export function Switcher({
  workspaces,
  threads,
  visited,
  current,
  ideaWorkspace,
  onOpenProject,
  onOpenWorkspace,
  onGo,
  onSaveIdea,
  onClose,
}: {
  workspaces: Workspace[];
  /** every project, most recently moved first */
  threads: Thread[];
  /** project ids opened, most recent first */
  visited: string[];
  /** the project on screen, left out of the recent list */
  current: string | null;
  /** where a new idea goes unless the user picks another (tab) */
  ideaWorkspace: string;
  onOpenProject: (id: string) => void;
  onOpenWorkspace: (id: string) => void;
  onGo: (place: Place) => void;
  onSaveIdea: (title: string, workspace: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [ws, setWs] = useState(
    workspaces.some((w) => w.id === ideaWorkspace)
      ? ideaWorkspace
      : (workspaces[0]?.id ?? ideaWorkspace),
  );
  const [saving, setSaving] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;

  const rows: Row[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) {
      const byId = new Map(threads.map((t) => [t.id, t]));
      const opened = visited
        .map((id) => byId.get(id))
        .filter((t): t is Thread => !!t && t.status !== "done");
      const rest = threads.filter(
        (t) => t.status === "active" && !visited.includes(t.id),
      );
      return [...opened, ...rest]
        .filter((t) => t.id !== current)
        .slice(0, 8)
        .map((t) => ({ kind: "project" as const, t }));
    }
    const words = query.split(/\s+/);
    const hit = (label: string, extra = "") => {
      const hay = `${label} ${extra}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const l = label.toLowerCase();
      return l.startsWith(query) ? 0 : l.includes(query) ? 1 : 2;
    };
    const scored: { row: Row; score: number }[] = [];
    threads.forEach((t, i) => {
      const s = hit(t.title, wsName(t.workspace));
      if (s !== null)
        scored.push({
          row: { kind: "project", t },
          score: s * 100 + ORDER[t.status] * 20 + Math.min(i, 19),
        });
    });
    workspaces.forEach((w) => {
      const s = hit(w.name);
      if (s !== null) scored.push({ row: { kind: "workspace", w }, score: s * 100 + 50 });
    });
    PLACES.forEach((p) => {
      const s = hit(p.label);
      if (s !== null) scored.push({ row: { kind: "place", ...p }, score: s * 100 + 60 });
    });
    scored.sort((a, b) => a.score - b.score);
    return [...scored.slice(0, 8).map((x) => x.row), { kind: "idea" as const }];
  }, [q, threads, workspaces, visited, current]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-row="${sel}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  async function saveIdea() {
    const title = q.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      await onSaveIdea(title, ws);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function pick(r: Row | undefined) {
    if (!r) return;
    if (r.kind === "idea") return void saveIdea();
    if (r.kind === "project") onOpenProject(r.t.id);
    else if (r.kind === "workspace") onOpenWorkspace(r.w.id);
    else onGo(r.place);
    onClose();
  }

  function cycleWorkspace(step: number) {
    if (!workspaces.length) return;
    const i = workspaces.findIndex((w) => w.id === ws);
    setWs(workspaces[(i + step + workspaces.length) % workspaces.length].id);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Tab") {
      e.preventDefault();
      cycleWorkspace(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) void saveIdea();
      else pick(rows[sel]);
    }
  }

  const rowClass = (on: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${
      on ? "bg-ink/6 text-ink" : "text-ink/80"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 px-4 pt-[14vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          dir="auto"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Jump to a project, or type an idea"
          className="arabic border-b border-line bg-transparent px-4 py-3.5 text-start text-[15px] text-ink outline-none placeholder:text-olive/70"
        />
        <div ref={list} className="flex max-h-[50vh] flex-col overflow-y-auto p-1.5">
          {!q.trim() && rows.length > 0 && (
            <div className="eyebrow px-3 pt-1.5 pb-1 text-olive">Recent projects</div>
          )}
          {!q.trim() && rows.length === 0 && (
            <p className="px-3 py-3 text-[13px] text-olive">
              Type a project, a workspace, or an idea to keep.
            </p>
          )}
          {rows.map((r, i) => {
            const on = i === sel;
            const common = {
              "data-row": i,
              onMouseMove: () => setSel(i),
              onClick: () => pick(r),
            };
            if (r.kind === "project")
              return (
                <button key={`p-${r.t.id}`} {...common} className={rowClass(on)}>
                  <span dir="auto" className="arabic min-w-0 flex-1 truncate text-start">
                    {r.t.title}
                  </span>
                  {r.t.status !== "active" && (
                    <span className="shrink-0 text-[11px] text-olive">
                      {statusLabel[r.t.status]}
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] text-olive">
                    {wsName(r.t.workspace)}
                  </span>
                </button>
              );
            if (r.kind === "workspace")
              return (
                <button key={`w-${r.w.id}`} {...common} className={rowClass(on)}>
                  <span className="min-w-0 flex-1 truncate">{r.w.name}</span>
                  <span className="shrink-0 text-[11px] text-olive">workspace</span>
                </button>
              );
            if (r.kind === "place")
              return (
                <button key={`g-${r.place}`} {...common} className={rowClass(on)}>
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                </button>
              );
            return (
              <button
                key="idea"
                {...common}
                disabled={saving}
                className={`${rowClass(on)} mt-1 border-t border-line`}
              >
                <span className="shrink-0 text-olive">+ idea</span>
                <span dir="auto" className="arabic min-w-0 flex-1 truncate text-start">
                  {q.trim()}
                </span>
                <span className="shrink-0 text-[11px] text-olive">
                  in {wsName(ws)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-4 border-t border-line px-4 py-2 text-[11px] text-olive">
          <span>↵ open</span>
          <span>⌘↵ save as idea</span>
          <span>tab: idea goes in {wsName(ws)}</span>
          <span className="ml-auto">esc</span>
        </div>
      </div>
    </div>
  );
}
