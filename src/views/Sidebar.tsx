import { useState } from "react";
import { Mark } from "../brand/Mark";
import type { View, Workspace } from "../types";
import type { Route } from "../routes";

export function Sidebar({
  workspaces,
  wsId,
  onSelectWorkspace,
  onCreateWorkspace,
  view,
  onView,
  counts,
  runtimeReady,
  onSettings,
  routes,
  routeStatus,
  onRoute,
}: {
  routes: Route[];
  routeStatus: Record<string, string>;
  onRoute: (id: string) => void;
  workspaces: Workspace[];
  wsId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  view: View;
  onView: (v: View) => void;
  counts: Record<View, number>;
  runtimeReady: boolean;
  onSettings: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const nav: { id: View; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "threads", label: "Threads" },
    { id: "meetings", label: "Meetings" },
    { id: "people", label: "People" },
    { id: "decisions", label: "Decisions" },
    { id: "followups", label: "Follow-ups" },
  ];

  async function submit() {
    const n = name.trim();
    if (!n) return setAdding(false);
    await onCreateWorkspace(n);
    setName("");
    setAdding(false);
  }

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-panel text-limestone">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <Mark size={22} className="text-limestone" />
        <span className="wordmark text-[19px] leading-none">Za3tar</span>
      </div>

      <div className="px-3">
        <div className="eyebrow px-1 pb-1.5 text-limestone/45">Workspaces</div>
        <div className="flex flex-col gap-0.5">
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelectWorkspace(w.id)}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                w.id === wsId
                  ? "bg-limestone/10 text-limestone"
                  : "text-limestone/70 hover:bg-limestone/5 hover:text-limestone"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  w.id === wsId ? "bg-thyme" : "bg-limestone/25"
                }`}
              />
              <span className="truncate">{w.name}</span>
            </button>
          ))}
          {adding ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
              onBlur={submit}
              placeholder="workspace name"
              className="mt-0.5 rounded-md border border-hairline bg-ink px-2 py-1.5 text-[13px] text-limestone outline-none placeholder:text-limestone/35 focus:border-thyme"
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="mt-0.5 rounded-md px-2 py-1.5 text-left text-[12px] text-limestone/45 transition-colors hover:text-limestone"
            >
              + new workspace
            </button>
          )}
        </div>
      </div>

      <nav className="mt-6 flex flex-col gap-0.5 px-3">
        {nav.map((n) => (
          <button
            key={n.id}
            onClick={() => onView(n.id)}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
              view === n.id
                ? "bg-limestone/10 text-limestone"
                : "text-limestone/70 hover:bg-limestone/5 hover:text-limestone"
            }`}
          >
            <span>{n.label}</span>
            {counts[n.id] > 0 && (
              <span
                className={`rounded px-1.5 text-[11px] tabular-nums ${
                  n.id === "followups"
                    ? "bg-thyme/90 text-ink"
                    : "text-limestone/45"
                }`}
              >
                {counts[n.id]}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-hairline px-3 py-3">
        {routes.length > 0 && (
          <>
            <div className="eyebrow px-2 pb-1 text-limestone/45">Hands</div>
            {routes.map((r) => {
              const st = routeStatus[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => onRoute(r.id)}
                  title={r.description}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-limestone/70 transition-colors hover:bg-limestone/5 hover:text-limestone"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      st === "working" || st === "connecting"
                        ? "pulse bg-thyme"
                        : st === "ready"
                          ? "bg-thyme"
                          : "bg-limestone/25"
                    }`}
                  />
                  <span className="truncate">{r.label}</span>
                  {st && (
                    <span className="ml-auto text-[11px] text-limestone/45">
                      {st === "working" ? "working" : st === "ready" ? "ready" : st}
                    </span>
                  )}
                </button>
              );
            })}
          </>
        )}
        {routes.length === 0 && (
          <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-limestone/60">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                runtimeReady ? "bg-thyme" : "bg-limestone/25"
              }`}
            />
            {runtimeReady ? "Za3tar can do work for you" : "Za3tar works locally"}
          </div>
        )}
        <button
          onClick={onSettings}
          className="rounded-md px-2 py-1.5 text-left text-[13px] text-limestone/70 transition-colors hover:bg-limestone/5 hover:text-limestone"
        >
          Settings
        </button>
      </div>
    </aside>
  );
}
