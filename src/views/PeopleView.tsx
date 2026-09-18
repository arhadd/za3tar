import { useState } from "react";
import { Button, Chip, Empty, Eyebrow, Field } from "../ui";
import { relDate } from "../format";
import type { PersonRow, Workspace } from "../types";

type Edit = {
  name: string;
  phone: string;
  email: string;
  org: string;
  role: string;
  aliases: string;
};

export function PeopleView({
  people,
  workspaces,
  onSave,
}: {
  people: PersonRow[];
  workspaces: Workspace[];
  onSave: (e: {
    name: string;
    phone: string;
    email: string;
    org: string;
    role: string;
    aliases: string[];
  }) => Promise<void>;
}) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 px-1">
        <Eyebrow>People</Eyebrow>
        <span className="text-[12px] text-olive">
          who you've been meeting, and what's still open with them
        </span>
      </div>
      {people.length === 0 && (
        <Empty>
          Tag a meeting with a person and they show up here with a real contact
          card.
        </Empty>
      )}
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {people.map((p) =>
          edit && edit.name === p.name ? (
            <form
              key={p.name}
              onSubmit={async (e) => {
                e.preventDefault();
                await onSave({
                  ...edit,
                  aliases: edit.aliases
                    .split(/[,،]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
                setEdit(null);
              }}
              className="flex flex-col gap-2 rounded-xl border border-ink/40 bg-paper p-4"
            >
              <span className="text-[14px] font-medium">{p.name}</span>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  value={edit.phone}
                  onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                  placeholder="phone (+962…)"
                />
                <Field
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  placeholder="email"
                />
                <Field
                  value={edit.org}
                  onChange={(e) => setEdit({ ...edit, org: e.target.value })}
                  placeholder="company / team"
                />
                <Field
                  value={edit.role}
                  onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                  placeholder="role"
                />
              </div>
              <Field
                dir="auto"
                value={edit.aliases}
                onChange={(e) => setEdit({ ...edit, aliases: e.target.value })}
                placeholder="other spellings the transcript uses, comma-separated (ويزن, Yazan H.)"
              />
              <div className="flex gap-2">
                <Button tone="primary" size="sm" type="submit">
                  save
                </Button>
                <Button
                  tone="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setEdit(null)}
                >
                  cancel
                </Button>
              </div>
            </form>
          ) : (
            <div
              key={p.name}
              className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-4"
            >
              <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    dir="auto"
                    className="arabic truncate text-start text-[14px] font-medium"
                  >
                    {p.name}
                  </span>
                  <span className="truncate text-[12px] text-olive">
                    {[p.role, p.org].filter(Boolean).join(" · ") ||
                      "no role or company yet"}
                  </span>
                </div>
                {p.open_actions > 0 && (
                  <Chip tone="accent">{p.open_actions} open</Chip>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-olive">
                <span>
                  {p.meetings} meeting{p.meetings === 1 ? "" : "s"}
                </span>
                {p.last_met > 0 && <span>last {relDate(p.last_met)}</span>}
                {p.phone && <span className="selectable">{p.phone}</span>}
                {p.email && <span className="selectable">{p.email}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {p.workspaces.map((w) => (
                  <Chip key={w} tone="outline">
                    {wsName(w)}
                  </Chip>
                ))}
                {p.aliases.length > 0 && (
                  <Chip tone="outline" title="also appears as">
                    aka {p.aliases.join(", ")}
                  </Chip>
                )}
                <Button
                  tone="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    setEdit({
                      name: p.name,
                      phone: p.phone,
                      email: p.email,
                      org: p.org,
                      role: p.role,
                      aliases: p.aliases.join(", "),
                    })
                  }
                >
                  {p.phone || p.email || p.org ? "edit" : "add details"}
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
