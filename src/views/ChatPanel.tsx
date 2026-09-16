// Typed conversation with Za3tar: the same brain as Talk, without the mic.
// It answers from the snapshot and changes the app with ops; what it changed
// shows as activity lines under the exchange. Onboarding is this panel with
// an opening question.
import { useEffect, useRef, useState } from "react";
import { Button, Card, Chip, Eyebrow } from "../ui";

export type ChatLine = {
  role: "you" | "za3tar" | "activity" | "error";
  text: string;
};

export function ChatPanel({
  title,
  hint,
  lines,
  busy,
  onSend,
  onClose,
}: {
  title: string;
  hint?: string;
  lines: ChatLine[];
  busy: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length, busy]);

  return (
    <Card className="flex flex-col gap-3 border-ink/40">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${busy ? "pulse bg-ink" : "bg-thyme"}`}
        />
        <Eyebrow>{title}</Eyebrow>
        {busy && <Chip tone="accent">thinking</Chip>}
        <Button tone="ghost" size="sm" className="ml-auto" onClick={onClose}>
          close
        </Button>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {lines.map((l, i) =>
          l.role === "activity" || l.role === "error" ? (
            <span
              key={i}
              className={`px-1 text-[12px] ${l.role === "error" ? "text-alert" : "text-olive"}`}
            >
              {l.role === "error" ? "⚠ " : "→ "}
              {l.text}
            </span>
          ) : (
            <p
              key={i}
              dir="auto"
              className={`arabic selectable max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-start text-[14px] leading-relaxed ${
                l.role === "you"
                  ? "self-end bg-ink text-limestone"
                  : "self-start bg-ink/5"
              }`}
            >
              {l.text}
            </p>
          ),
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || busy) return;
          onSend(text.trim());
          setText("");
        }}
        className="flex gap-2"
      >
        <textarea
          dir="auto"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !busy) {
                onSend(text.trim());
                setText("");
              }
            }
          }}
          placeholder={hint ?? "say something, or ask"}
          rows={1}
          className="arabic min-h-10 flex-1 resize-none rounded-lg border border-line bg-white px-3 py-2 text-start text-[13px] outline-none focus:border-ink"
        />
        <Button
          tone="primary"
          size="sm"
          type="submit"
          disabled={busy || !text.trim()}
        >
          send
        </Button>
      </form>
    </Card>
  );
}
