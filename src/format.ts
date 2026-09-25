export function fmtDur(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export function relDate(unix: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `today ${time}`;
  const yst = new Date(now);
  yst.setDate(now.getDate() - 1);
  if (d.toDateString() === yst.toDateString()) return `yesterday ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function longDate(unix: number): string {
  if (!unix) return "";
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export const mmss = (elapsed: number) =>
  `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

export const todayISO = () => new Date().toISOString().slice(0, 10);

/** "HH:MM" → minutes since local midnight (NaN if malformed) */
export function hhmmToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Meeting date passed to the extractor so it can resolve "بكرا" to a real date. */
export function todayContext(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.toISOString().slice(0, 10)} (${weekday})`;
}

export const meetingIdOf = (d: string) =>
  d.replace(/\/+$/, "").split("/").pop() || d;

/** local action ids are per-meeting; the runtime needs global ones */
export const bridgeId = (d: string, actionId: number) =>
  `${meetingIdOf(d)}#a${actionId}`;

/** the far side is still an agent — find the header, then the outermost JSON */
export function parseEnvelope<T>(reply: string, header: string): T {
  const at = reply.indexOf(header);
  const start = reply.indexOf("{", at >= 0 ? at + header.length : 0);
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no ${header} in the reply`);
  return JSON.parse(reply.slice(start, end + 1)) as T;
}
