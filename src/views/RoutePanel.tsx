// What a route is doing, live: the agent's words as they stream, every tool
// call as a row with its state, and the approve/deny stop when the agent
// wants to do something dangerous. Plus a box to talk to it directly.
import { useState } from "react";
import { Button, Card, Chip, Field } from "../ui";
import type { RouteSession } from "../routes";

export function RoutePanel({
  s,
  onSend,
  onPermission,
  onCancel,
  onClose,
}: {
  s: RouteSession;
  onSend: (text: string) => void;
  onPermission: (rpcId: unknown, optionId: string) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const tools = Object.values(s.tools).slice(-6);
  return (
    <Card className="flex flex-col gap-3 border-ink/40">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            s.status === "working" || s.status === "connecting"
              ? "pulse bg-ink"
              : "bg-thyme"
          }`}
        />
        <span className="text-[13px] font-medium">{s.label}</span>
        <Chip tone={s.status === "working" ? "accent" : "outline"}>
          {s.status === "connecting"
            ? "connecting"
            : s.status === "working"
              ? "working"
              : s.status === "closed"
                ? "closed"
                : "ready"}
        </Chip>
        {s.status === "working" && (
          <Button tone="ghost" size="sm" onClick={onCancel}>
            stop
          </Button>
        )}
        <Button tone="ghost" size="sm" className="ml-auto" onClick={onClose}>
          close
        </Button>
      </div>

      {s.lastPrompt && (
        <p dir="auto" className="arabic text-start text-[13px] text-olive">
          you: {s.lastPrompt}
        </p>
      )}

      {tools.length > 0 && (
        <div className="flex flex-col gap-1">
          {tools.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-md bg-ink/5 px-2 py-1 text-[12px]"
            >
              <Chip
                tone={
                  t.status === "failed"
                    ? "alert"
                    : t.status === "completed"
                      ? "olive"
                      : "outline"
                }
              >
                {t.kind || "tool"}
              </Chip>
              <span
                dir="auto"
                className="arabic min-w-0 flex-1 truncate text-start"
              >
                {t.title}
              </span>
              <span className="text-olive">
                {t.status === "completed"
                  ? "done"
                  : t.status === "failed"
                    ? "failed"
                    : "running"}
              </span>
            </div>
          ))}
        </div>
      )}

      {s.permission && (
        <div className="flex flex-col gap-2 rounded-lg border border-alert/50 bg-alert/8 p-3">
          <span className="text-[13px] font-medium">
            {s.label} wants to: {s.permission.title}
          </span>
          {s.permission.detail && (
            <pre className="selectable max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[11px]">
              {s.permission.detail}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            {s.permission.options.map((o) => (
              <Button
                key={o.optionId}
                size="sm"
                tone={o.kind.startsWith("allow") ? "accent" : "quiet"}
                onClick={() => onPermission(s.permission!.rpcId, o.optionId)}
              >
                {o.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {s.text && (
        <p
          dir="auto"
          className="arabic selectable whitespace-pre-wrap text-start text-[14px] leading-relaxed"
        >
          {s.text}
        </p>
      )}
      {s.error && <p className="text-[12px] text-alert">{s.error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || s.status !== "ready") return;
          onSend(text.trim());
          setText("");
        }}
        className="flex gap-2"
      >
        <Field
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`ask ${s.label} something, or give it a task`}
          className="arabic flex-1"
        />
        <Button
          tone="primary"
          size="sm"
          type="submit"
          disabled={s.status !== "ready"}
        >
          send
        </Button>
      </form>
    </Card>
  );
}
