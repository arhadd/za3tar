// Two places and your workspaces: Home, To-dos across everything, then one
// row per workspace. What a workspace holds (projects, notes, people…) is a
// tab row on the workspace's own page, not a second list here.
import { useState } from "react";
import { Mark } from "../brand/Mark";
import type { Workspace } from "../types";

const WS_VIEWS = new Set([
  "overview",
  "threads",
  "meetings",
  "people",
  "decisions",
  "followups",
]);

export function Sidebar({
  workspaces,
  wsId,
  onSelectWorkspace,
  onCreateWorkspace,
  view,
  onHome,
  onTodos,
  todosOnMe,
  inSettings,
  onSettings,
  assistant,
  onAssistant,
}: {
  workspaces: Workspace[];
  wsId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  view: string;
  onHome: () => void;
  onTodos: () => void;
  /** open to-dos on the user, across workspaces */
  todosOnMe: number;
  inSettings: boolean;
  onSettings: () => void;
  /** a connected assistant (route), shown as one quiet line; null when none */
  assistant: { label: string; status: string } | null;
  onAssistant: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function submit() {
    const n = name.trim();
    if (!n) return setAdding(false);
    await onCreateWorkspace(n);
    setName("");
    setAdding(false);
  }

  const item = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
      active
        ? "bg-limestone/10 text-limestone"
        : "text-limestone/70 hover:bg-limestone/5 hover:text-limestone"
    }`;
  const inWorkspace = !inSettings && WS_VIEWS.has(view);

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-panel text-limestone">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <Mark size={22} className="text-limestone" />
        <span className="wordmark text-[19px] leading-none">Za3tar</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pb-5">
        <button
          onClick={onHome}
          className={item(!inSettings && view === "home")}
        >
          Home
        </button>
        <button
          onClick={onTodos}
          className={item(!inSettings && view === "todos")}
        >
          To-dos
          {todosOnMe > 0 && (
            <span
              title="open to-dos on you, across workspaces"
              className="ml-auto rounded bg-thyme/90 px-1.5 text-[11px] tabular-nums text-ink"
            >
              {todosOnMe}
            </span>
          )}
        </button>
      </nav>

      <div className="px-3">
        <div className="eyebrow px-1 pb-1.5 text-limestone/45">Workspaces</div>
        <div className="flex flex-col gap-0.5">
          {workspaces.map((w) => {
            const on = inWorkspace && w.id === wsId;
            return (
              <button
                key={w.id}
                onClick={() => onSelectWorkspace(w.id)}
                className={item(on)}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    on ? "bg-thyme" : "bg-limestone/25"
                  }`}
                />
                <span className="truncate">{w.name}</span>
              </button>
            );
          })}
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
              + New workspace
            </button>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 border-t border-hairline px-3 py-3">
        {assistant && (
          <button
            onClick={onAssistant}
            title={`${assistant.label} · ${assistant.status}`}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] text-limestone/60 transition-colors hover:text-limestone"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full bg-thyme ${
                assistant.status === "working" || assistant.status === "connecting"
                  ? "pulse"
                  : ""
              }`}
            />
            {assistant.status === "working"
              ? "Assistant working…"
              : "Assistant connected"}
          </button>
        )}
        <button onClick={onSettings} className={item(inSettings)}>
          Settings
        </button>
      </div>
    </aside>
  );
}
