// Client side of the route layer (src-tauri/src/acp.rs): one live session
// per route, fed by `acp-event`, exposed to the views as plain state.
import { invoke, listen } from "./ipc";

export type Route = {
  id: string;
  label: string;
  description: string;
  kind: "acp" | "oneshot";
  command: string;
  cwd: string;
  enabled: boolean;
};

export type RouteTool = {
  id: string;
  title: string;
  kind: string;
  status: "pending" | "in_progress" | "completed" | "failed";
};

export type RoutePermission = {
  rpcId: unknown;
  title: string;
  detail: string;
  options: { optionId: string; name: string; kind: string }[];
};

export type RouteSession = {
  route: string;
  label: string;
  status: "connecting" | "ready" | "working" | "closed";
  text: string;
  lastPrompt: string;
  tools: Record<string, RouteTool>;
  permission: RoutePermission | null;
  error: string | null;
};

export function emptySession(route: Route): RouteSession {
  return {
    route: route.id,
    label: route.label,
    status: "connecting",
    text: "",
    lastPrompt: "",
    tools: {},
    permission: null,
    error: null,
  };
}

/** fold one acp-event into a session */
export function reduce(s: RouteSession, e: any): RouteSession {
  if (e.kind === "status") {
    const status = e.status as RouteSession["status"];
    // the turn ended: nothing can still be running, whatever we missed
    const tools =
      status === "ready" || status === "closed"
        ? Object.fromEntries(
            Object.entries(s.tools).map(([k, t]) => [
              k,
              t.status === "in_progress" || t.status === "pending"
                ? { ...t, status: "completed" as const }
                : t,
            ]),
          )
        : s.tools;
    return { ...s, status, tools, error: null };
  }
  if (e.kind === "closed") return { ...s, status: "closed" };
  if (e.kind === "permission") {
    const p = e.params ?? {};
    const tc = p.toolCall ?? {};
    const detail =
      tc.rawInput && typeof tc.rawInput === "object"
        ? JSON.stringify(tc.rawInput, null, 1)
        : typeof tc.rawInput === "string"
          ? tc.rawInput
          : "";
    return {
      ...s,
      permission: {
        rpcId: e.rpc_id,
        title: tc.title ?? "run a tool",
        detail,
        options: (p.options ?? []).map((o: any) => ({
          optionId: o.optionId,
          name: o.name,
          kind: o.kind ?? "",
        })),
      },
    };
  }
  if (e.kind === "update") {
    const u = e.update ?? {};
    const k = u.sessionUpdate;
    if (k === "agent_message_chunk" && u.content?.type === "text")
      return { ...s, text: s.text + u.content.text };
    if (k === "tool_call") {
      const id = u.toolCallId;
      return {
        ...s,
        tools: {
          ...s.tools,
          [id]: {
            id,
            title: u.title ?? "tool",
            kind: u.kind ?? "",
            status: u.status ?? "in_progress",
          },
        },
      };
    }
    if (k === "tool_call_update") {
      const id = u.toolCallId;
      const cur = s.tools[id];
      if (!cur) return s;
      return {
        ...s,
        tools: {
          ...s.tools,
          [id]: {
            ...cur,
            status: u.status ?? cur.status,
            title: u.title ?? cur.title,
          },
        },
      };
    }
  }
  return s;
}

export async function startRoute(route: Route, cwd?: string) {
  return invoke<string>("acp_start", {
    route: route.id,
    command: route.command,
    cwd: cwd ?? null,
  });
}

export async function promptRoute(routeId: string, text: string) {
  return invoke<{ stopReason: string; text: string }>("acp_prompt", {
    route: routeId,
    text,
  });
}

export const answerPermission = (
  routeId: string,
  rpcId: unknown,
  optionId: string,
) => invoke("acp_permission", { route: routeId, rpcId, optionId });
export const cancelRoute = (routeId: string) =>
  invoke("acp_cancel", { route: routeId });
export const stopRoute = (routeId: string) =>
  invoke("acp_stop", { route: routeId });
export const onRouteEvent = (h: (e: any) => void) =>
  listen<any>("acp-event", (e) => h(e.payload));
