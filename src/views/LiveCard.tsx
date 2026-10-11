// What an assistant is doing elsewhere, as it happens: its other chats and
// scheduled jobs, newest first, with the ones moving right now marked. Read
// only — the place to act is the chat itself, or the ask box above.
import { useEffect, useState } from "react";
import { Card, Chip, Eyebrow } from "../ui";
import { ago, sourceLabel, type Feed } from "../feed";

export function LiveCard({ label, feed }: { label: string; feed: Feed }) {
  // relative times stay true without waiting for the next change
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const live = feed.status === "live";
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Eyebrow>{label}, live</Eyebrow>
        <span
          className={`h-1.5 w-1.5 rounded-full ${live ? "bg-thyme" : "pulse bg-olive/40"}`}
        />
        {!live && (
          <span className="ml-auto text-[11px] text-olive">
            {feed.status === "connecting" ? "connecting…" : "reconnecting…"}
          </span>
        )}
      </div>
      {feed.sessions.length === 0 ? (
        <p className="text-[12px] text-olive">
          {feed.error ?? (live ? "Nothing yet." : "Reaching it…")}
        </p>
      ) : (
        <div className="flex flex-col">
          {feed.sessions.map((s) => (
            <div
              key={s.id}
              title={[s.display_name, s.preview].filter(Boolean).join(" — ")}
              className="flex items-center gap-2 py-1 text-[13px]"
            >
              <Chip tone={s.is_active ? "accent" : "outline"}>
                {sourceLabel(s.source)}
              </Chip>
              <span
                dir="auto"
                className="arabic min-w-0 flex-1 truncate text-start"
              >
                {s.title || s.preview || "(untitled)"}
              </span>
              <span className="shrink-0 text-[11px] text-olive">
                {ago(s.last_active, now)}
              </span>
            </div>
          ))}
        </div>
      )}
      {!live && feed.sessions.length > 0 && feed.error && (
        <p className="text-[11px] text-olive">{feed.error}</p>
      )}
    </Card>
  );
}
