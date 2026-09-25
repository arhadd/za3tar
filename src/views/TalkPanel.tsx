import { Button, Card, Chip } from "../ui";
import type { TalkLine } from "../live";

export type TalkState = "idle" | "connecting" | "live" | "thinking";

export function TalkPanel({
  state,
  lines,
  muted,
  onMute,
  onEnd,
}: {
  state: TalkState;
  lines: TalkLine[];
  muted: boolean;
  onMute: (m: boolean) => void;
  onEnd: () => void;
}) {
  const you = [...lines].reverse().find((l) => l.role === "you");
  const za = [...lines].reverse().find((l) => l.role === "za3tar");
  const activity = lines.filter((l) => l.role === "activity" || l.role === "error").slice(-4);
  return (
    <Card className="flex flex-col gap-3 border-thyme bg-thyme/10">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${muted ? "bg-olive" : "pulse bg-ink"}`}
        />
        <span className="text-[13px] font-medium">Talk</span>
        <Chip tone={state === "thinking" ? "accent" : muted ? "alert" : "outline"}>
          {state === "connecting"
            ? "connecting"
            : state === "thinking"
              ? "working on it"
              : muted
                ? "muted"
                : "listening"}
        </Chip>
        <Button
          tone={muted ? "accent" : "quiet"}
          size="sm"
          className="ml-auto"
          onClick={() => onMute(!muted)}
          title={muted ? "unmute the mic" : "mute the mic (session stays up)"}
        >
          {muted ? "Unmute" : "Mute"}
        </Button>
        <Button tone="primary" size="sm" onClick={onEnd}>
          End
        </Button>
      </div>
      {you && (
        <p dir="auto" className="arabic text-start text-[14px] text-olive">
          {you.text}
        </p>
      )}
      {za && (
        <p dir="auto" className="arabic text-start text-[15px] leading-relaxed">
          {za.text}
        </p>
      )}
      {activity.length > 0 && (
        <div className="flex flex-col gap-1">
          {activity.map((a, i) => (
            <span
              key={i}
              className={`text-[12px] ${a.role === "error" ? "text-alert" : "text-olive"}`}
            >
              {a.role === "error" ? "⚠ " : "→ "}
              {a.text}
            </span>
          ))}
        </div>
      )}
      {!you && !za && (
        <p className="text-[13px] text-olive">
          Ask where something stands, what is on you, park a thing, dictate a note,
          or say record.
        </p>
      )}
    </Card>
  );
}
