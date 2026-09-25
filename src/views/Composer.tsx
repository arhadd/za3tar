// A draft Za3tar made: a message, a note, an agenda, a brief. It is editable,
// and it goes somewhere — copied, sent, or kept as a note on a thread. This is
// the difference between a place that lists your work and a place you work in.
import { useEffect, useState } from "react";
import { Button, Card, Chip, Eyebrow, Field } from "../ui";
import type { Thread } from "../types";

export type Draft = {
  title: string;
  text: string;
  instruction: string;
  thread: string;
  busy: boolean;
};

export function Composer({
  draft,
  threads,
  onChange,
  onRevise,
  onCopy,
  onSend,
  onKeep,
  onClose,
}: {
  draft: Draft;
  threads: Thread[];
  onChange: (d: Draft) => void;
  onRevise: (instruction: string) => void;
  onCopy: () => void;
  onSend: () => void;
  onKeep: () => void;
  onClose: () => void;
}) {
  const [revision, setRevision] = useState("");
  const [rows, setRows] = useState(8);
  useEffect(() => {
    const lines = draft.text.split("\n").length + 2;
    setRows(Math.min(24, Math.max(6, lines)));
  }, [draft.text]);

  return (
    <Card className="flex flex-col gap-3 border-ink/40">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${draft.busy ? "pulse bg-ink" : "bg-thyme"}`}
        />
        <Eyebrow>{draft.title || "Draft"}</Eyebrow>
        {draft.busy && <Chip tone="accent">writing</Chip>}
        <Button tone="ghost" size="sm" className="ml-auto" onClick={onClose}>
          close
        </Button>
      </div>

      <textarea
        dir="auto"
        value={draft.text}
        onChange={(e) => onChange({ ...draft, text: e.target.value })}
        rows={rows}
        placeholder={draft.busy ? "" : "nothing yet"}
        className="arabic selectable resize-none rounded-lg border border-line bg-white p-3 text-start text-[14px] leading-relaxed outline-none focus:border-ink"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          size="sm"
          onClick={onSend}
          disabled={!draft.text.trim()}
        >
          send on WhatsApp
        </Button>
        <Button size="sm" onClick={onCopy} disabled={!draft.text.trim()}>
          copy
        </Button>
        <label className="flex items-center gap-1.5 text-[12px] text-olive">
          keep on
          <select
            value={draft.thread}
            onChange={(e) => onChange({ ...draft, thread: e.target.value })}
            className="max-w-[220px] rounded-md border border-line bg-white px-1.5 py-1 text-[12px] text-ink outline-none focus:border-ink"
          >
            <option value="">no project</option>
            {threads.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={onKeep} disabled={!draft.text.trim()}>
          keep as a note
        </Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!revision.trim() || draft.busy) return;
          onRevise(revision.trim());
          setRevision("");
        }}
        className="flex gap-2 border-t border-line pt-3"
      >
        <Field
          dir="auto"
          value={revision}
          onChange={(e) => setRevision(e.target.value)}
          placeholder="shorter · warmer · add the dates · in Arabic"
          className="arabic flex-1"
        />
        <Button
          size="sm"
          type="submit"
          disabled={draft.busy || !revision.trim()}
        >
          redo it
        </Button>
      </form>
    </Card>
  );
}
