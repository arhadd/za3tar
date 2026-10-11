// Client side of the live feed (src-tauri/src/feed.rs): for every assistant
// with a live line, what it is doing elsewhere — its other chats and
// scheduled jobs, newest first — refreshed the moment the far side says
// something moved, not on a timer.
import { useEffect, useState } from "react";
import { invoke, listen } from "./ipc";
import type { Route } from "./routes";

export type FeedSession = {
  id: string;
  title: string | null;
  preview: string | null;
  /** where it happened: whatsapp, cron, cli, acp, desktop… */
  source: string;
  is_active: boolean;
  /** unix seconds */
  last_active: number;
  message_count: number;
  display_name?: string | null;
};

export type Feed = {
  status: "connecting" | "live" | "down";
  error: string | null;
  sessions: FeedSession[];
};

const RECENT = "/api/sessions?order=recent&limit=6&min_messages=1";

const blank: Feed = { status: "connecting", error: null, sessions: [] };

/** route id → its feed, for the enabled routes that name a live command */
export function useFeeds(routes: Route[]): Record<string, Feed> {
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const wanted = routes.filter((r) => r.enabled && r.live?.trim());
  // restart only when which routes have a line, or their command, changes
  const key = wanted.map((r) => `${r.id}\u0000${r.live}`).join("\u0001");

  const patch = (route: string, p: Partial<Feed>) =>
    setFeeds((f) => ({ ...f, [route]: { ...(f[route] ?? blank), ...p } }));

  useEffect(() => {
    const timers: Record<string, number> = {};
    // a burst of changes (a reply streaming in) becomes one read
    const refresh = (route: string) => {
      window.clearTimeout(timers[route]);
      timers[route] = window.setTimeout(async () => {
        try {
          const r = await invoke<{ sessions?: FeedSession[] }>("feed_get", {
            route,
            path: RECENT,
          });
          patch(route, { sessions: r.sessions ?? [], error: null });
        } catch (e) {
          patch(route, { error: String(e) });
        }
      }, 250);
    };
    const un = listen<any>("feed-event", (e) => {
      const p = e.payload;
      if (p.kind === "status") {
        patch(p.route, { status: p.status, error: p.error ?? null });
        if (p.status === "live") refresh(p.route);
      } else if (p.kind === "event" && p.event === "sessions.changed") {
        refresh(p.route);
      }
    });
    return () => {
      un.then((f) => f());
      Object.values(timers).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    // show "connecting…" straight away; drop routes that lost their line
    setFeeds((f) =>
      Object.fromEntries(wanted.map((r) => [r.id, f[r.id] ?? blank])),
    );
    // routes save as you type; wait for the command to settle before dialling
    const t = window.setTimeout(() => {
      for (const r of wanted) {
        invoke("feed_start", { route: r.id }).catch((e) =>
          patch(r.id, { status: "down", error: String(e) }),
        );
      }
    }, 1500);
    return () => {
      window.clearTimeout(t);
      for (const r of wanted)
        invoke("feed_stop", { route: r.id }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return feeds;
}

/** where a session happened, in words */
export function sourceLabel(source: string): string {
  return (
    {
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      slack: "Slack",
      discord: "Discord",
      email: "Email",
      cron: "Scheduled",
      cli: "Terminal",
      tui: "Terminal",
      acp: "Za3tar",
      desktop: "Desktop",
      webhook: "Webhook",
    }[source] ?? source
  );
}

/** "just now", "4m ago", "3h ago", "2d ago" */
export function ago(unix: number, now: number): string {
  const s = Math.max(0, Math.floor(now / 1000 - unix));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
