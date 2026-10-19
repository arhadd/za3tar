// Four places and your workspaces: Home, then Meetings, To-dos and Ideas
// across everything, then one row per workspace. The open workspace lists its
// active projects underneath, so switching project is one click; a workspace
// with a single active project opens straight to it. A workspace's own notes,
// people and the rest are a tab row on its page, not a second list here.
import { useState } from "react";
import { Mark } from "../brand/Mark";
import type { Thread, Workspace } from "../types";

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
  threads,
  wsId,
  threadOpen,
  onSelectWorkspace,
  onOpenProject,
  onCreateWorkspace,
  view,
  onHome,
  onMeetings,
  unfiled,
  onTodos,
  todosOnMe,
  onIdeas,
  ideas,
  onJump,
  inSettings,
  onSettings,
  assistant,
  onAssistant,
}: {
  workspaces: Workspace[];
  threads: Thread[];
  wsId: string;
  /** the project on screen, if any */
  threadOpen: string | null;
  onSelectWorkspace: (id: string) => void;
  onOpenProject: (id: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  view: string;
  onHome: () => void;
  onMeetings: () => void;
  /** meetings not filed under a project yet, across workspaces */
  unfiled: number;
  onTodos: () => void;
  /** open to-dos on the user, across workspaces */
  todosOnMe: number;
  onIdeas: () => void;
  /** ideas across workspaces */
  ideas: number;
  /** open the ⌘K switcher */
  onJump: () => void;
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
  const activeIn = (id: string) =>
    threads.filter((t) => t.workspace === id && t.status === "active");

  return (
    <aside className="flex w-[232px] shrink-0 flex-col bg-panel text-limestone">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <Mark size={22} className="text-limestone" />
        <span className="wordmark text-[19px] leading-none">Za3tar</span>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pb-5">
        <button
          onClick={onJump}
          title="jump to a project, or jot an idea"
          className="mb-2 flex w-full items-center gap-2 rounded-md border border-hairline px-2 py-1.5 text-left text-[12px] text-limestone/45 transition-colors hover:border-limestone/30 hover:text-limestone"
        >
          Jump to…
          <span className="ml-auto text-[11px] text-limestone/35">⌘K</span>
        </button>
        <button
          onClick={onHome}
          className={item(!inSettings && view === "home")}
        >
          Home
        </button>
        <button
          onClick={onMeetings}
          className={item(!inSettings && view === "library")}
        >
          Meetings
          {unfiled > 0 && (
            <span
              title="meetings not filed under a project yet"
              className="ml-auto text-[11px] tabular-nums text-limestone/45"
            >
              {unfiled}
            </span>
          )}
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
        <button
          onClick={onIdeas}
          className={item(!inSettings && view === "ideas")}
        >
          Ideas
          {ideas > 0 && (
            <span className="ml-auto text-[11px] tabular-nums text-limestone/45">
              {ideas}
            </span>
          )}
        </button>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="eyebrow px-1 pb-1.5 text-limestone/45">Workspaces</div>
        <div className="flex flex-col gap-0.5">
          {workspaces.map((w) => {
            const on = inWorkspace && w.id === wsId;
            const projects = activeIn(w.id);
            const single = projects.length === 1 ? projects[0] : null;
            return (
              <div key={w.id} className="flex flex-col gap-0.5">
                <button
                  onClick={() =>
                    single ? onOpenProject(single.id) : onSelectWorkspace(w.id)
                  }
                  title={single ? `${w.name} · ${single.title}` : w.name}
                  className={item(on)}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      on ? "bg-thyme" : "bg-limestone/25"
                    }`}
                  />
                  <span className="truncate">{w.name}</span>
                  {!on && projects.length > 1 && (
                    <span className="ml-auto text-[11px] tabular-nums text-limestone/35">
                      {projects.length}
                    </span>
                  )}
                </button>
                {on &&
                  projects.length > 1 &&
                  projects.map((t) => {
                    const here = view === "threads" && threadOpen === t.id;
                    return (
                      <button
                        key={t.id}
                        dir="auto"
                        onClick={() => onOpenProject(t.id)}
                        title={t.title}
                        className={`arabic ml-3.5 truncate rounded-md px-2 py-1 text-start text-[12px] transition-colors ${
                          here
                            ? "bg-limestone/10 text-limestone"
                            : "text-limestone/55 hover:bg-limestone/5 hover:text-limestone"
                        }`}
                      >
                        {t.title}
                      </button>
                    );
                  })}
              </div>
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
              ? `${assistant.label} is working…`
              : `${assistant.label} connected`}
          </button>
        )}
        <button onClick={onSettings} className={item(inSettings)}>
          Settings
        </button>
      </div>
    </aside>
  );
}
