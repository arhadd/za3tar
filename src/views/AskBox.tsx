// The one place to talk to Za3tar: type, or press the mic to speak. As you
// type, a fast pre-read (Jev) shows how Za3tar understood the ask before you
// press enter, and is passed along so the answer starts in the right place.
import { useEffect, useRef, useState } from "react";
import { Button, Field } from "../ui";
import type { AskRead, Thread, Workspace } from "../types";

const INTENT_LABEL: Record<string, string> = {
  catch_up: "summarize",
  write: "write a draft",
  do: "make a change",
  nudge: "nudge someone",
  question: "answer",
};

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function AskBox({
  placeholder = "Ask Za3tar anything, or tell it what to write or do",
  suggestions = [],
  workspaces,
  threads,
  onAsk,
  readAsk,
  routeLabel,
  onTalk,
  talking,
}: {
  placeholder?: string;
  suggestions?: string[];
  workspaces: Workspace[];
  threads: Thread[];
  onAsk: (text: string, read?: AskRead) => void;
  /** fast pre-read of the ask box (Jev); null when no key is set */
  readAsk: ((text: string) => Promise<AskRead | null>) | null;
  /** route id → label, for the assistant chip */
  routeLabel: (id: string) => string;
  onTalk: () => void;
  /** a voice conversation is already on */
  talking: boolean;
}) {
  const [ask, setAsk] = useState("");
  const [read, setRead] = useState<AskRead | null>(null);
  const readSeq = useRef(0);
  useEffect(() => {
    const text = ask.trim();
    if (!readAsk || text.length < 6) {
      setRead(null);
      return;
    }
    const seq = ++readSeq.current;
    const h = setTimeout(() => {
      void readAsk(text).then((r) => {
        if (seq === readSeq.current) setRead(r);
      });
    }, 350);
    return () => clearTimeout(h);
  }, [ask, readAsk]);

  const wsName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!ask.trim()) return;
          onAsk(ask.trim(), read ?? undefined);
          setAsk("");
          setRead(null);
        }}
        className="flex gap-2"
      >
        <div className="relative flex min-w-0 flex-1">
          <Field
            dir="auto"
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={placeholder}
            className="arabic flex-1 py-3 pr-12 pl-4 text-[15px]"
          />
          <button
            type="button"
            onClick={onTalk}
            disabled={talking}
            title={talking ? "Za3tar is listening" : "talk instead of typing"}
            aria-label="talk to Za3tar"
            className={`absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition-colors ${
              talking
                ? "bg-thyme text-ink"
                : "text-olive hover:bg-ink/5 hover:text-ink"
            }`}
          >
            <MicIcon />
          </button>
        </div>
        <Button tone="primary" size="lg" type="submit" disabled={!ask.trim()}>
          Ask
        </Button>
      </form>
      {read && ask.trim() && read.intent_confidence >= 0.5 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-olive">
          <span className="opacity-70">→</span>
          <span className="rounded-full bg-thyme/15 px-2.5 py-0.5 text-ink">
            {INTENT_LABEL[read.intent] ?? read.intent}
          </span>
          {read.workspace && read.workspace_confidence >= 0.6 && (
            <span className="rounded-full border border-line px-2.5 py-0.5">
              {wsName(read.workspace)}
            </span>
          )}
          {read.thread && read.thread_confidence >= 0.6 && (
            <span className="rounded-full border border-line px-2.5 py-0.5">
              {threads.find((t) => t.id === read.thread)?.title ?? read.thread}
            </span>
          )}
          {read.hand && read.hand_confidence >= 0.75 ? (
            <span className="rounded-full bg-ink px-2.5 py-0.5 text-paper">
              straight to {routeLabel(read.hand)}
            </span>
          ) : (
            read.outside >= 0.75 && (
              <span className="opacity-70">
                needs an assistant outside the app
              </span>
            )
          )}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => onAsk(s)}
              dir="auto"
              className="arabic rounded-full border border-line px-3 py-1 text-[12px] text-olive transition-colors hover:border-ink/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
