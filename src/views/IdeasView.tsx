// Ideas: projects not started yet, across every workspace. Jotting one is a
// line and a workspace, nothing else to fill in; starting it makes it an
// active project with its own page. ⌘K anywhere saves one too.
import { useState } from "react";
import { Button, Card, Empty, Eyebrow, Field } from "../ui";
import { relDate } from "../format";
import type { Thread, Workspace } from "../types";

export function IdeasView({
  ideas,
  workspaces,
  defaultWorkspace,
  onSave,
  onOpen,
  onStart,
  onDrop,
}: {
  ideas: Thread[];
  workspaces: Workspace[];
  /** where the box puts a new idea until the user picks another */
  defaultWorkspace: string;
  onSave: (title: string, workspace: string) => Promise<void>;
  onOpen: (id: string) => void;
  onStart: (t: Thread) => Promise<void>;
  onDrop: (t: Thread) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [ws, setWs] = useState(defaultWorkspace);
  const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id;
  // newest first: an idea is most alive the day it was had
  const rows = [...ideas].sort((a, b) => b.created - a.created);

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await onSave(title.trim(), ws);
          setTitle("");
        }}
        className="flex gap-2"
      >
        <Field
          dir="auto"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="an idea, in a line"
          className="arabic flex-1 text-[14px]"
        />
        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          aria-label="workspace"
          className="rounded-lg border border-line bg-white px-2 py-2 text-[13px] outline-none focus:border-ink"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button tone="primary" size="sm" type="submit">
          keep it
        </Button>
      </form>

      {rows.length === 0 ? (
        <Empty>
          No ideas yet. Type one above, or press ⌘K anywhere, type it and press
          ⌘↵.
        </Empty>
      ) : (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Eyebrow>Ideas · {rows.length}</Eyebrow>
            <span className="text-[12px] text-olive">
              start one when it is real; drop the ones that are not
            </span>
          </div>
          <Card pad={false} className="p-1.5">
            {rows.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-ink/4"
              >
                <button
                  onClick={() => onOpen(t.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
                >
                  <span dir="auto" className="arabic truncate text-start text-[14px]">
                    {t.title}
                  </span>
                  <span className="text-[11px] text-olive">
                    {wsName(t.workspace)} · {relDate(t.created)}
                  </span>
                </button>
                <Button tone="quiet" size="sm" onClick={() => onStart(t)}>
                  start it
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Drop the idea "${t.title}"?`)) void onDrop(t);
                  }}
                >
                  drop
                </Button>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
