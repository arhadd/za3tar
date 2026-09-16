import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, listen } from "./ipc";
import { Sidebar } from "./views/Sidebar";
import { MeetingsView } from "./views/MeetingsView";
import { MeetingDetail } from "./views/MeetingDetail";
import { PeopleView } from "./views/PeopleView";
import { DecisionsView } from "./views/DecisionsView";
import { FollowUpsView } from "./views/FollowUpsView";
import { WorkspaceView } from "./views/WorkspaceView";
import { ThreadsView, ThreadDetail } from "./views/ThreadsView";
import { TalkPanel, type TalkState } from "./views/TalkPanel";
import { LiveSession, type LiveOp, type TalkLine } from "./live";
import { RoutePanel } from "./views/RoutePanel";
import {
  answerPermission,
  cancelRoute,
  emptySession,
  onRouteEvent,
  promptRoute,
  reduce,
  startRoute,
  stopRoute,
  type Route,
  type RouteSession,
} from "./routes";
import { SettingsView } from "./views/SettingsView";
import { Button } from "./ui";
import {
  bridgeId,
  meetingIdOf,
  mmss,
  parseEnvelope,
  todayContext,
} from "./format";
import type {
  ActionItem,
  DecisionRef,
  DecisionStatus,
  Draft,
  DraftKind,
  Level,
  Link,
  MeetingActions,
  OpenAction,
  PersonRow,
  Phase,
  QuestionRef,
  RuntimeAck,
  RuntimeFollowupStatus,
  RuntimeSchedule,
  Segment,
  Settings,
  Summary,
  Thread,
  View,
  Workspace,
} from "./types";

const WS_KEY = "za3tar.workspace";

function App() {
  // capture + processing
  const [phase, setPhase] = useState<Phase>("idle");
  const [dir, setDir] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ mic?: Level; system?: Level }>({});
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<number | null>(null);

  // the meeting on screen
  const [title, setTitle] = useState("");
  const [person, setPerson] = useState("");
  const [roughNotes, setRoughNotes] = useState("");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [actions, setActions] = useState<MeetingActions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [viewingPast, setViewingPast] = useState(false);
  const [meetingWs, setMeetingWs] = useState("personal");
  const [meetingThread, setMeetingThread] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [questions, setQuestions] = useState<QuestionRef[]>([]);
  const [threadOpen, setThreadOpen] = useState<string | null>(null);

  // talk
  const live = useRef<LiveSession | null>(null);
  const [talk, setTalk] = useState<TalkState>("idle");
  const [talkLines, setTalkLines] = useState<TalkLine[]>([]);
  const [talkMuted, setTalkMuted] = useState(false);

  // routes — other agents with hands
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeSessions, setRouteSessions] = useState<Record<string, RouteSession>>({});
  const [routeOpen, setRouteOpen] = useState<string | null>(null);
  const routesRef = useRef<Route[]>([]);
  routesRef.current = routes;
  // refs so the voice brain always sees current state without re-binding
  const snap = useRef<() => string>(() => "");
  const apply = useRef<(ops: LiveOp[]) => Promise<string[]>>(async () => []);

  // the workspace and its views
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState<string>(() => {
    try {
      return localStorage.getItem(WS_KEY) || "personal";
    } catch {
      return "personal";
    }
  });
  const [view, setView] = useState<View>("overview");
  const [library, setLibrary] = useState<Summary[]>([]);
  const [openActions, setOpenActions] = useState<OpenAction[]>([]);
  const [decisions, setDecisions] = useState<DecisionRef[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);

  // settings + runtime (whatever does Za3tar's work outside the app)
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Settings | null>(null);
  const [schedule, setSchedule] = useState<RuntimeSchedule | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<
    Record<string, RuntimeFollowupStatus>
  >({});
  const [runtimeReady, setRuntimeReady] = useState(false);

  const heardThem = !!segments?.some((s) => s.speaker !== "me");

  // ── data ──────────────────────────────────────────────────────────────
  async function refreshAll() {
    try {
      setWorkspaces(await invoke<Workspace[]>("list_workspaces"));
    } catch {
      /* best-effort */
    }
    try {
      setLibrary(await invoke<Summary[]>("list_recordings"));
    } catch {
      /* best-effort */
    }
    try {
      const open = await invoke<OpenAction[]>("list_open_actions");
      const today = new Date().toISOString().slice(0, 10);
      open.sort((a, b) => {
        const ao = a.action.due_date && a.action.due_date < today ? 0 : 1;
        const bo = b.action.due_date && b.action.due_date < today ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return b.meeting_created - a.meeting_created;
      });
      setOpenActions(open);
    } catch {
      /* best-effort */
    }
    try {
      setDecisions(await invoke<DecisionRef[]>("list_decisions"));
    } catch {
      /* best-effort */
    }
    try {
      setPeople(await invoke<PersonRow[]>("list_people"));
    } catch {
      /* best-effort */
    }
    try {
      setThreads(await invoke<Thread[]>("list_threads"));
    } catch {
      /* best-effort */
    }
    try {
      setQuestions(await invoke<QuestionRef[]>("list_questions"));
    } catch {
      /* best-effort */
    }
    try {
      setRoutes(await invoke<Route[]>("list_routes"));
    } catch {
      /* best-effort */
    }
  }

  async function refreshRuntime(ws = wsId) {
    try {
      setRuntimeReady(
        await invoke<boolean>("agent_available", { workspace: ws }),
      );
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    refreshAll();
    refreshRuntime();
    const un = listen<any>("capture-event", (e) => {
      const p = e.payload;
      if (p?.event === "level")
        setLevels((c) => ({
          ...c,
          [p.track]: { peak: p.peak ?? 0, seconds: p.seconds ?? 0 },
        }));
      else if (p?.event === "permission_hint")
        setPermissionHint(p.message ?? "system audio permission needed");
      else if (p?.event === "error")
        setError(`${p.track ? p.track + ": " : ""}${p.message}`);
    });
    const unRoute = onRouteEvent((e) => {
      if (!e?.route) return;
      setRouteSessions((cur) => {
        const base =
          cur[e.route] ??
          emptySession(
            routesRef.current.find((r) => r.id === e.route) ?? {
              id: e.route,
              label: e.route,
              description: "",
              kind: "acp",
              command: "",
              cwd: "",
              enabled: true,
            },
          );
        const next = reduce(base, e);
        // a new prompt's text starts fresh (status → working)
        return { ...cur, [e.route]: next };
      });
    });
    return () => {
      un.then((f) => f());
      unRoute.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (phase === "recording") {
      const started = Date.now();
      timer.current = window.setInterval(
        () => setElapsed(Math.floor((Date.now() - started) / 1000)),
        250,
      );
    } else if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [phase]);

  useEffect(() => {
    try {
      localStorage.setItem(WS_KEY, wsId);
    } catch {
      /* fine */
    }
    refreshRuntime(wsId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // if the remembered workspace no longer exists, fall back
  useEffect(() => {
    if (workspaces.length && !workspaces.some((w) => w.id === wsId))
      setWsId(workspaces[0].id);
  }, [workspaces, wsId]);

  const wsLibrary = useMemo(
    () => library.filter((s) => s.workspace === wsId),
    [library, wsId],
  );
  const wsOpen = useMemo(
    () => openActions.filter((o) => o.workspace === wsId),
    [openActions, wsId],
  );
  const wsDecisions = useMemo(
    () => decisions.filter((d) => d.workspace === wsId),
    [decisions, wsId],
  );
  const wsThreads = useMemo(
    () => threads.filter((t) => t.workspace === wsId),
    [threads, wsId],
  );
  const wsQuestions = useMemo(
    () => questions.filter((q) => q.workspace === wsId),
    [questions, wsId],
  );
  const wsPeople = useMemo(
    () =>
      people.filter(
        (p) => p.workspaces.length === 0 || p.workspaces.includes(wsId),
      ),
    [people, wsId],
  );
  const current = library.find((s) => s.dir === dir);

  const contactOf = (name: string): PersonRow | undefined =>
    people.find((p) => p.name === name || p.aliases.includes(name));
  const waDigits = (phone: string) => phone.replace(/[^\d]/g, "");

  function showFlash(msg: string, ms = 2500) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), ms);
  }

  // ── workspaces ────────────────────────────────────────────────────────
  async function createWorkspace(name: string) {
    try {
      const ws = await invoke<Workspace>("create_workspace", { name });
      await refreshAll();
      setWsId(ws.id);
      setMeetingOpen(false);
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveWorkspace(w: Workspace) {
    try {
      await invoke("update_workspace", {
        id: w.id,
        name: w.name,
        description: w.description,
        links: w.links,
        runtimeCommand: w.runtime_command,
      });
      await refreshAll();
      refreshRuntime();
      showFlash("workspace saved");
    } catch (e) {
      setError(String(e));
    }
  }

  async function openLink(l: Link) {
    try {
      if (/^https?:\/\//i.test(l.target))
        await invoke("open_external", { url: l.target });
      else await invoke("open_path", { path: l.target });
    } catch (e) {
      setError(String(e));
    }
  }

  async function createBrief(b: {
    title: string;
    person: string;
    notes: string;
  }) {
    try {
      const d = await invoke<string>("create_brief", {
        title: b.title,
        person: b.person,
        workspace: wsId,
        notes: b.notes,
        thread: view === "threads" && threadOpen ? threadOpen : null,
      });
      await refreshAll();
      await openPast(d);
      if (b.notes.trim()) {
        setBusy("pulling out decisions & actions…");
        try {
          const a = await invoke<MeetingActions>("extract_actions", {
            dir: d,
            title: b.title.trim() || null,
            today: todayContext(),
          });
          setActions(a);
          refreshAll();
        } catch (e) {
          setError(String(e));
        } finally {
          setBusy(null);
        }
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function createThread(title: string) {
    try {
      const t = await invoke<Thread>("create_thread", {
        workspace: wsId,
        title,
        summary: null,
        owner: null,
      });
      await refreshAll();
      setThreadOpen(t.id);
      setView("threads");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveThread(t: Thread) {
    try {
      await invoke("update_thread", {
        id: t.id,
        title: t.title,
        summary: t.summary,
        status: t.status,
        owner: t.owner,
      });
      await refreshAll();
      showFlash("thread moved");
    } catch (e) {
      setError(String(e));
    }
  }

  async function deleteThread(t: Thread) {
    try {
      await invoke("delete_thread", { id: t.id });
      await refreshAll();
      setThreadOpen(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function moveMeetingThread(thread: string) {
    if (!dir) return;
    setMeetingThread(thread);
    try {
      await invoke("set_recording_thread", { dir, thread });
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
  }

  async function moveMeeting(ws: string) {
    if (!dir) return;
    setMeetingWs(ws);
    try {
      await invoke("set_recording_workspace", { dir, workspace: ws });
      await refreshAll();
      setWsId(ws);
    } catch (e) {
      setError(String(e));
    }
  }

  // ── capture ───────────────────────────────────────────────────────────
  async function start() {
    setError(null);
    setPermissionHint(null);
    setSegments(null);
    setNotes(null);
    setActions(null);
    setDraft(null);
    setShowTranscript(false);
    setLevels({});
    setElapsed(0);
    setDir(null);
    setTitle("");
    setPerson("");
    setRoughNotes("");
    setViewingPast(false);
    setMeetingWs(wsId);
    setMeetingThread(view === "threads" && threadOpen ? threadOpen : "");
    setView("meetings");
    setShowSettings(false);
    setMeetingOpen(true);
    try {
      await invoke("start_recording");
      setPhase("recording");
    } catch (e) {
      setError(String(e));
      setMeetingOpen(false);
    }
  }

  /** notes + actions for a given recording; each step fails soft so the
   *  matching button stays available instead of killing the whole flow. */
  async function synthesize(d: string) {
    try {
      setBusy("writing your notes…");
      const md = await invoke<string>("generate_notes", {
        dir: d,
        roughNotes: roughNotes.trim() || null,
        title: title.trim() || null,
      });
      setNotes(md);
    } catch (e) {
      setError(String(e));
    }
    try {
      setBusy("pulling out decisions & actions…");
      const a = await invoke<MeetingActions>("extract_actions", {
        dir: d,
        title: title.trim() || null,
        today: todayContext(),
      });
      setActions(a);
      setDraft(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
      refreshAll();
    }
  }

  async function stop() {
    try {
      const d = await invoke<string>("stop_recording");
      setDir(d);
      // the meeting belongs to the workspace it was recorded in
      invoke("set_recording_workspace", { dir: d, workspace: meetingWs }).catch(
        () => {},
      );
      if (meetingThread)
        invoke("set_recording_thread", { dir: d, thread: meetingThread }).catch(
          () => {},
        );
      if (title.trim())
        invoke("set_recording_title", { dir: d, title: title.trim() }).catch(
          () => {},
        );
      if (person.trim())
        invoke("set_recording_person", { dir: d, person: person.trim() }).catch(
          () => {},
        );
      setPhase("processing");
      setBusy("transcribing the two tracks…");
      const segs = await invoke<Segment[]>("transcribe", { dir: d });
      setSegments(segs);
      setPhase("done");
      // the whole point: stop → notes → actions, no clicks
      await synthesize(d);
    } catch (e) {
      setError(String(e));
      setPhase("done");
      setBusy(null);
    }
  }

  async function transcribePast() {
    if (!dir) return;
    setError(null);
    setBusy("transcribing the two tracks…");
    try {
      const segs = await invoke<Segment[]>("transcribe", { dir });
      setSegments(segs);
      refreshAll();
    } catch (e) {
      setError(String(e));
      setBusy(null);
      return;
    }
    await synthesize(dir);
  }

  async function makeNotes() {
    if (!dir) return;
    setError(null);
    setBusy("writing your notes…");
    try {
      const md = await invoke<string>("generate_notes", {
        dir,
        roughNotes: roughNotes.trim() || null,
        title: title.trim() || null,
      });
      setNotes(md);
      refreshAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function extractActions() {
    if (!dir) return;
    setError(null);
    setBusy("pulling out decisions & actions…");
    try {
      const a = await invoke<MeetingActions>("extract_actions", {
        dir,
        title: title.trim() || null,
        today: todayContext(),
      });
      setActions(a);
      setDraft(null);
      refreshAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  // ── outcomes ──────────────────────────────────────────────────────────
  async function toggleDone(a: ActionItem) {
    if (!dir || !actions) return;
    setActions({
      ...actions,
      actions: actions.actions.map((x) =>
        x.id === a.id ? { ...x, done: !x.done } : x,
      ),
    });
    invoke("set_action_done", { dir, id: a.id, done: !a.done })
      .then(refreshAll)
      .catch(() => {});
  }

  async function setDecisionStatus(d: DecisionRef, status: DecisionStatus) {
    // optimistic in both the ledger and the open meeting
    setDecisions((cur) =>
      cur.map((x) =>
        x.dir === d.dir && x.decision.id === d.decision.id
          ? { ...x, decision: { ...x.decision, status } }
          : x,
      ),
    );
    if (dir === d.dir && actions)
      setActions({
        ...actions,
        decisions: actions.decisions.map((x) =>
          x.id === d.decision.id ? { ...x, status } : x,
        ),
      });
    try {
      await invoke("set_decision_status", {
        dir: d.dir,
        id: d.decision.id,
        status,
        note: null,
      });
      refreshAll();
    } catch (e) {
      setError(String(e));
    }
  }

  async function parkAction(oa: OpenAction, parked: boolean) {
    setOpenActions((cur) =>
      cur.map((x) =>
        x.dir === oa.dir && x.action.id === oa.action.id
          ? { ...x, action: { ...x.action, parked } }
          : x,
      ),
    );
    invoke("set_action_parked", { dir: oa.dir, id: oa.action.id, parked })
      .then(refreshAll)
      .catch(() => {});
  }

  /** mark an open action done from the follow-ups view (optimistic) */
  async function markOpenDone(oa: OpenAction) {
    setOpenActions((cur) =>
      cur.filter((x) => !(x.dir === oa.dir && x.action.id === oa.action.id)),
    );
    if (dir === oa.dir && actions)
      setActions({
        ...actions,
        actions: actions.actions.map((x) =>
          x.id === oa.action.id ? { ...x, done: true } : x,
        ),
      });
    invoke("set_action_done", { dir: oa.dir, id: oa.action.id, done: true })
      .then(refreshAll)
      .catch(() => {});
  }

  // ── follow-through ────────────────────────────────────────────────────
  async function makeDraft(kind: DraftKind) {
    if (!dir) return;
    setError(null);
    setBusy(
      kind === "whatsapp"
        ? "drafting the WhatsApp follow-up…"
        : "drafting the recap email…",
    );
    try {
      const d = await invoke<{ subject?: string | null; body: string }>(
        "draft_followup",
        { dir, kind, title: title.trim() || null },
      );
      setDraft({
        kind,
        subject: d.subject ?? "",
        body: d.body,
        target: person.trim(),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  /** chase one open action — drafts a WhatsApp nudge into the open meeting */
  async function nudge(oa: OpenAction) {
    setError(null);
    setBusy("drafting the nudge…");
    try {
      const d = await invoke<{ subject?: string | null; body: string }>(
        "draft_nudge",
        { dir: oa.dir, id: oa.action.id, title: oa.meeting_title || null },
      );
      await openPast(oa.dir);
      setDraft({
        kind: "whatsapp",
        subject: "",
        body: d.body,
        target: oa.person,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function sendDraft() {
    if (!draft) return;
    const contact = draft.target ? contactOf(draft.target) : undefined;
    try {
      if (draft.kind === "whatsapp") {
        const text = encodeURIComponent(draft.body);
        const digits = contact?.phone ? waDigits(contact.phone) : "";
        try {
          await invoke("open_external", {
            url: digits
              ? `whatsapp://send?phone=${digits}&text=${text}`
              : `whatsapp://send?text=${text}`,
          });
        } catch {
          await invoke("open_external", {
            url: `https://wa.me/${digits}?text=${text}`,
          });
        }
      } else {
        const to = contact?.email ?? "";
        const url = `mailto:${to}?subject=${encodeURIComponent(
          draft.subject,
        )}&body=${encodeURIComponent(draft.body)}`;
        await invoke("open_external", { url });
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(
      draft.kind === "email" && draft.subject
        ? `${draft.subject}\n\n${draft.body}`
        : draft.body,
    );
    showFlash("draft copied");
  }

  async function exportCalendar() {
    if (!dir) return;
    setError(null);
    try {
      await invoke<string>("export_calendar", {
        dir,
        title: title.trim() || null,
      });
      showFlash("sent to Calendar");
    } catch (e) {
      setError(String(e));
    }
  }

  /** notes + open actions + questions as one markdown packet. */
  function packetMarkdown(): string {
    let md = `# ${title.trim() || "meeting"} — ${new Date().toLocaleDateString()}\n\n`;
    if (notes) md += `${notes}\n\n`;
    if (actions) {
      if (actions.decisions.length) {
        md += `## decisions\n`;
        for (const d of actions.decisions)
          md += `- ${d.text}${d.status !== "proposed" ? ` _(${d.status})_` : ""}\n`;
        md += "\n";
      }
      if (actions.actions.length) {
        md += `## action items\n`;
        for (const a of actions.actions) {
          const due = a.due_label || a.due_date;
          md += `- [${a.done ? "x" : " "}] ${a.title} — **${a.owner}**${due ? ` (${due})` : ""}\n`;
        }
        md += "\n";
      }
      if (actions.questions.length) {
        md += `## open questions\n`;
        for (const q of actions.questions) md += `- ${q}\n`;
      }
    }
    return md.trim();
  }

  async function copyPacket() {
    await navigator.clipboard.writeText(packetMarkdown());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  // ── the runtime: Za3tar doing work outside the app ────────────────────
  /** one round-trip; null on transport failure */
  async function runtimeExchange(
    message: string,
    busyMsg: string,
  ): Promise<string | null> {
    setBusy(busyMsg);
    setError(null);
    try {
      return await invoke<string>("send_to_agent", {
        message,
        workspace: meetingOpen && dir ? meetingWs : wsId,
      });
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** the whole meeting → the runtime as a ZA3TAR_PACKET: calendar +
      follow-up tracking, acknowledged structurally */
  async function trackAndSchedule() {
    if (!actions || !dir) return;
    const contact = person.trim() ? contactOf(person.trim()) : undefined;
    const open = actions.actions.filter((a) => !a.done);
    const packet = {
      meeting: {
        id: meetingIdOf(dir),
        title: title.trim() || "untitled",
        started_at: current
          ? new Date(current.created * 1000).toISOString()
          : new Date().toISOString(),
        person: { name: person.trim(), phone: contact?.phone ?? "" },
      },
      decisions: actions.decisions.map((d) => d.text),
      actions: open.map((a) => ({
        id: bridgeId(dir, a.id),
        text: a.title,
        owner: a.owner,
        due: a.due_date ?? "",
      })),
      questions: actions.questions,
      notes_md: notes ?? "",
    };
    const reply = await runtimeExchange(
      `ZA3TAR_PACKET v1\n${JSON.stringify(packet)}`,
      "Za3tar is scheduling and tracking…",
    );
    if (reply == null) return;
    try {
      const ack = parseEnvelope<RuntimeAck>(reply, "ZA3TAR_ACK");
      const bits = [
        `${ack.events_created.length} on your calendar`,
        `${ack.followups_tracked.length} follow-ups being tracked`,
      ];
      if (ack.warnings.length) bits.push(`note: ${ack.warnings[0]}`);
      showFlash(bits.join(" · "), 6000);
    } catch {
      showFlash(`${reply.slice(0, 140)}${reply.length > 140 ? "…" : ""}`, 5000);
    }
  }

  /** today's calendar so meetings start pre-titled */
  async function fetchToday() {
    const reply = await runtimeExchange(
      `ZA3TAR_QUERY v1\n{"type":"today"}`,
      "reading today's calendar…",
    );
    if (reply == null) return;
    try {
      setSchedule(parseEnvelope<RuntimeSchedule>(reply, "ZA3TAR_SCHEDULE"));
    } catch {
      setError("the schedule reply wasn't parseable");
    }
  }

  /** pull real-world follow-up statuses (nudged/replied/done) back in */
  async function syncFollowups() {
    const snapshot = [...wsOpen];
    const ids = snapshot.map((oa) => bridgeId(oa.dir, oa.action.id));
    if (!ids.length) return;
    const reply = await runtimeExchange(
      `ZA3TAR_QUERY v1\n${JSON.stringify({ type: "followups", ids })}`,
      "syncing follow-ups…",
    );
    if (reply == null) return;
    try {
      const st = parseEnvelope<{ followups: RuntimeFollowupStatus[] }>(
        reply,
        "ZA3TAR_STATUS",
      );
      const map: Record<string, RuntimeFollowupStatus> = {};
      for (const f of st.followups) map[f.id] = f;
      setRuntimeStatus(map);
      let done = 0;
      for (const oa of snapshot) {
        if (map[bridgeId(oa.dir, oa.action.id)]?.status === "done") {
          markOpenDone(oa);
          done++;
        }
      }
      showFlash(
        `synced ${st.followups.length}${done ? ` · ${done} completed` : ""}`,
        4000,
      );
    } catch {
      setError("the status reply wasn't parseable");
    }
  }

  /** Za3tar delivers the draft to the person over WhatsApp */
  async function sendDraftViaRuntime() {
    if (!draft) return;
    const contact = draft.target ? contactOf(draft.target) : undefined;
    const who = draft.target || "the other participant";
    const via = contact?.phone
      ? ` (WhatsApp ${contact.phone})`
      : contact?.email
        ? ` (email ${contact.email})`
        : " (find them in my contacts)";
    const reply = await runtimeExchange(
      `[za3tar] please send this message to ${who}${via} and confirm once delivered:\n\n${draft.body}`,
      "Za3tar is sending it…",
    );
    if (reply != null)
      showFlash(`${reply.slice(0, 140)}${reply.length > 140 ? "…" : ""}`, 5000);
  }

  // ── navigation ────────────────────────────────────────────────────────
  async function openPast(recDir: string) {
    setError(null);
    setPermissionHint(null);
    setShowTranscript(false);
    setShowSettings(false);
    try {
      const detail = await invoke<{
        title: string;
        person: string;
        workspace: string;
        thread: string;
        segments: Segment[];
        notes: string | null;
      }>("load_recording", { dir: recDir });
      const past = await invoke<MeetingActions | null>("load_actions", {
        dir: recDir,
      }).catch(() => null);
      setDir(recDir);
      setTitle(detail.title);
      setPerson(detail.person);
      setMeetingWs(detail.workspace);
      setMeetingThread(detail.thread);
      setSegments(detail.segments.length ? detail.segments : null);
      setNotes(detail.notes);
      setActions(past);
      setDraft(null);
      setRoughNotes("");
      setViewingPast(true);
      setMeetingOpen(true);
      setView("meetings");
      if (phase !== "recording") setPhase("done");
    } catch (e) {
      setError(String(e));
    }
  }

  function saveMeta() {
    if (!dir) return;
    invoke("set_recording_title", { dir, title: title.trim() }).catch(() => {});
    invoke("set_recording_person", { dir, person: person.trim() })
      .then(refreshAll)
      .catch(() => {});
  }

  async function openSettings() {
    try {
      setSettingsForm(await invoke<Settings>("get_settings"));
      setShowSettings(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveSettings() {
    if (!settingsForm) return;
    try {
      await invoke("save_settings", { settings: settingsForm });
      setShowSettings(false);
      showFlash("settings saved");
      refreshRuntime();
    } catch (e) {
      setError(String(e));
    }
  }

  async function savePerson(e: {
    name: string;
    phone: string;
    email: string;
    org: string;
    role: string;
    aliases: string[];
  }) {
    try {
      await invoke("save_person", e);
      await refreshAll();
      showFlash("contact saved");
    } catch (err) {
      setError(String(err));
    }
  }

  function grantSystemAudio() {
    invoke("open_system_audio_settings").catch(() => {});
  }

  // ── talk ──────────────────────────────────────────────────────────────
  const refOf = (o: OpenAction) => `${meetingIdOf(o.dir)}#${o.action.id}`;
  const dRefOf = (d: DecisionRef) => `d:${meetingIdOf(d.dir)}#${d.decision.id}`;

  snap.current = () => {
    const today = new Date().toISOString().slice(0, 10);
    const lines: string[] = [];
    lines.push(`workspace: ${wsName} (${wsId}) · today ${today}`);
    const w = workspaces.find((x) => x.id === wsId);
    if (w?.description) lines.push(`about: ${w.description}`);
    lines.push(
      `workspaces: ${workspaces.map((x) => `[${x.id}] ${x.name}`).join(" · ")}`,
    );
    lines.push("\nthreads:");
    for (const t of wsThreads)
      lines.push(
        `- [${t.id}] ${t.title} (${t.status}${t.owner ? `, ${t.owner}` : ""}) — ${t.summary || "no state line"}`,
      );
    const liveOpen = wsOpen.filter((o) => !o.action.parked);
    lines.push(`\nopen items (${liveOpen.length}):`);
    for (const o of liveOpen.slice(0, 40)) {
      const t = threads.find((x) => x.id === o.thread)?.title;
      const due = o.action.due_date
        ? ` due ${o.action.due_date}${o.action.due_date < today ? " OVERDUE" : ""}`
        : o.action.due_label
          ? ` (${o.action.due_label})`
          : "";
      lines.push(`- ${refOf(o)} [${o.action.owner}]${t ? ` {${t}}` : ""} ${o.action.title}${due}`);
    }
    const parked = wsOpen.filter((o) => o.action.parked);
    if (parked.length)
      lines.push(`\nparked: ${parked.map((o) => `${refOf(o)} ${o.action.title}`).join(" · ")}`);
    const prop = wsDecisions.filter((d) => d.decision.status === "proposed");
    if (prop.length) {
      lines.push(`\ndecisions waiting for a yes:`);
      for (const d of prop) lines.push(`- ${dRefOf(d)} ${d.decision.text}`);
    }
    const recent = wsLibrary.slice(0, 15);
    if (recent.length) {
      lines.push(`\nmeetings & briefs (newest first):`);
      for (const m of recent)
        lines.push(
          `- [${m.id}] ${m.title || "untitled"}${m.person ? ` with ${m.person}` : ""} · ${new Date(m.created * 1000).toISOString().slice(0, 10)}${m.has_audio ? "" : " (brief)"}`,
        );
    }
    if (wsPeople.length)
      lines.push(
        `\npeople: ${wsPeople
          .map((p) => `${p.name}${p.role || p.org ? ` (${[p.role, p.org].filter(Boolean).join(", ")})` : ""}`)
          .join(" · ")}`,
      );
    const enabledRoutes = routes.filter((r) => r.enabled);
    if (enabledRoutes.length)
      lines.push(
        `\nroutes (other agents you can hand work to): ${enabledRoutes
          .map((r) => `[${r.id}] ${r.label} — ${r.description}`)
          .join(" · ")}`,
      );
    lines.push(
      `\nstate: ${phase === "recording" ? "RECORDING now" : "not recording"}; view ${view}${
        threadOpen ? `; thread open ${threadOpen}` : ""
      }${meetingOpen && dir ? `; meeting open [${meetingIdOf(dir)}]${actions ? " with outcomes" : ""}` : ""}`,
    );
    return lines.join("\n");
  };

  apply.current = async (ops) => {
    const out: string[] = [];
    for (const op of ops) {
      try {
        if (op.op === "park" || op.op === "unpark" || op.op === "done") {
          const oa = openActions.find((o) => refOf(o) === op.ref);
          if (!oa) {
            out.push(`couldn't find ${op.ref}`);
            continue;
          }
          if (op.op === "done") await markOpenDone(oa);
          else await parkAction(oa, op.op === "park");
          out.push(`${op.op}: ${oa.action.title}`);
        } else if (op.op === "confirm" || op.op === "supersede") {
          const d = decisions.find((x) => dRefOf(x) === op.ref);
          if (!d) {
            out.push(`couldn't find ${op.ref}`);
            continue;
          }
          await setDecisionStatus(d, op.op === "confirm" ? "confirmed" : "superseded");
          out.push(`${op.op === "confirm" ? "confirmed" : "superseded"}: ${d.decision.text}`);
        } else if (op.op === "move_thread") {
          const t = threads.find((x) => x.id === op.id);
          if (!t) {
            out.push(`no thread ${op.id}`);
            continue;
          }
          await saveThread({
            ...t,
            summary: op.summary ?? t.summary,
            status: (op.status as Thread["status"]) ?? t.status,
          });
          out.push(`moved thread: ${t.title}`);
        } else if (op.op === "open_thread") {
          setThreadOpen(op.id);
          setView("threads");
          setMeetingOpen(false);
          out.push(`opened ${threads.find((x) => x.id === op.id)?.title ?? op.id}`);
        } else if (op.op === "go") {
          setView(op.view as View);
          setMeetingOpen(false);
          out.push(`showing ${op.view}`);
        } else if (op.op === "brief") {
          await createBrief({ title: op.title, person: "", notes: op.notes });
          out.push(`filed a brief: ${op.title}`);
        } else if (op.op === "record") {
          if (phase !== "recording") await start();
          out.push("recording");
        } else if (op.op === "stop_recording") {
          if (phase === "recording") await stop();
          out.push("stopped recording");
        } else if (op.op === "workspace") {
          const w = workspaces.find((x) => x.id === op.id);
          if (!w) {
            out.push(`no workspace ${op.id}`);
            continue;
          }
          setWsId(w.id);
          setView("overview");
          setThreadOpen(null);
          if (phase !== "recording") setMeetingOpen(false);
          out.push(`switched to ${w.name}`);
        } else if (op.op === "open_meeting") {
          const m = library.find((x) => x.id === op.id);
          if (!m) {
            out.push(`no meeting ${op.id}`);
            continue;
          }
          await openPast(m.dir);
          out.push(`opened ${m.title || "untitled meeting"}`);
        } else if (op.op === "draft") {
          if (!dir || !actions) {
            out.push("open a meeting with outcomes first");
            continue;
          }
          await makeDraft(op.kind);
          out.push(`drafted the ${op.kind === "email" ? "recap email" : "WhatsApp follow-up"}`);
        } else if (op.op === "nudge") {
          const oa = openActions.find((o) => refOf(o) === op.ref);
          if (!oa) {
            out.push(`couldn't find ${op.ref}`);
            continue;
          }
          await nudge(oa);
          out.push(`drafted a nudge: ${oa.action.title}`);
        } else if (op.op === "person") {
          const cur = people.find((p) => p.name === op.name || p.aliases.includes(op.name));
          await savePerson({
            name: cur?.name ?? op.name,
            phone: op.phone ?? cur?.phone ?? "",
            email: op.email ?? cur?.email ?? "",
            org: op.org ?? cur?.org ?? "",
            role: op.role ?? cur?.role ?? "",
            aliases: cur?.aliases ?? [],
          });
          out.push(`saved ${cur?.name ?? op.name}`);
        }
      } catch (e) {
        out.push(`failed: ${String(e)}`);
      }
    }
    return out;
  };

  // ── routes ────────────────────────────────────────────────────────────
  async function ensureRoute(routeId: string): Promise<Route> {
    const r = routes.find((x) => x.id === routeId && x.enabled);
    if (!r) throw new Error(`no route ${routeId}`);
    const cur = routeSessions[routeId];
    if (r.kind === "acp" && (!cur || cur.status === "closed")) {
      setRouteSessions((c) => ({ ...c, [routeId]: emptySession(r) }));
      setRouteOpen(routeId);
      await startRoute(r, r.cwd || undefined);
    }
    return r;
  }

  /** send text to a route and wait for its answer; the panel shows the work */
  async function askRoute(routeId: string, text: string): Promise<string | null> {
    try {
      const r = await ensureRoute(routeId);
      setRouteOpen(routeId);
      if (r.kind !== "acp") return runtimeExchange(text, `asking ${r.label}…`);
      setRouteSessions((c) => ({
        ...c,
        [routeId]: { ...(c[routeId] ?? emptySession(r)), text: "", tools: {}, lastPrompt: text, error: null },
      }));
      const res = await promptRoute(routeId, text);
      return res.text || null;
    } catch (e) {
      setRouteSessions((c) =>
        c[routeId] ? { ...c, [routeId]: { ...c[routeId], error: String(e), status: "closed" } } : c,
      );
      setError(String(e));
      return null;
    }
  }

  async function closeRoute(routeId: string) {
    await stopRoute(routeId).catch(() => {});
    setRouteSessions((c) => {
      const n = { ...c };
      delete n[routeId];
      return n;
    });
    setRouteOpen(null);
  }

  async function startTalk() {
    if (live.current) return;
    setTalkLines([]);
    const s = new LiveSession({
      onLine: (l) =>
        setTalkLines((cur) => {
          // captions replace their own last line; activity appends
          if ((l.role === "you" || l.role === "za3tar") && cur[cur.length - 1]?.role === l.role)
            return [...cur.slice(0, -1), l];
          return [...cur, l].slice(-40);
        }),
      onState: setTalk,
      snapshot: () => snap.current(),
      applyOps: (ops) => apply.current(ops),
      runtime: (route, m) => askRoute(route, m),
      onMuted: setTalkMuted,
    });
    setTalkMuted(false);
    live.current = s;
    try {
      await s.start(
        `You are Za3tar's voice. Keep it short and warm, mirror the user's language (Arabic, English, or mixed). You do not know the workspace yourself: every substantive request is delegated to the client, which answers with what to say; speak that answer as-is, do not add to it. While waiting for the client, say at most one short holding word (لحظة / one sec) and then stay quiet; never ask the user to repeat, never comment on audio quality, never guess at an answer. Workspace: ${wsName}.`,
      );
      s.prompt(
        `Say one short greeting: you're here, in the ${wsName} workspace, what do they want to look at. Then listen.`,
      );
    } catch (e) {
      setError(String(e));
      live.current = null;
      setTalk("idle");
    }
  }

  async function endTalk() {
    await live.current?.stop();
    live.current = null;
  }

  // ── render ────────────────────────────────────────────────────────────
  const wsName = workspaces.find((w) => w.id === wsId)?.name ?? "Personal";
  const headline = showSettings
    ? "Settings"
    : view === "overview"
      ? wsName
      : view === "threads"
      ? threadOpen
        ? (threads.find((t) => t.id === threadOpen)?.title ?? "Thread")
        : "Threads"
      : view === "meetings"
      ? meetingOpen
        ? phase === "recording"
          ? "Recording"
          : title.trim() || "Meeting"
        : "Meetings"
      : view === "people"
        ? "People"
        : view === "decisions"
          ? "Decisions"
          : "Follow-ups";

  const recordButton =
    phase === "recording" ? (
      <Button tone="accent" size="lg" onClick={stop}>
        <span className="pulse inline-block h-2.5 w-2.5 rounded-full bg-ink" />
        Stop · {mmss(elapsed)}
      </Button>
    ) : phase === "processing" ? (
      <Button tone="primary" size="lg" disabled>
        <span className="pulse inline-block h-2.5 w-2.5 rounded-full bg-limestone" />
        Working…
      </Button>
    ) : (
      <Button tone="primary" size="lg" onClick={start}>
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-thyme" />
        Record
      </Button>
    );

  return (
    <div className="flex h-full">
      <Sidebar
        workspaces={workspaces}
        wsId={wsId}
        onSelectWorkspace={(id) => {
          setWsId(id);
          setShowSettings(false);
          setView("overview");
          setThreadOpen(null);
          if (phase !== "recording") setMeetingOpen(false);
        }}
        onCreateWorkspace={createWorkspace}
        view={view}
        onView={(v) => {
          setView(v);
          setShowSettings(false);
          if (v === "threads") setThreadOpen(null);
          if (v === "meetings" && phase !== "recording") setMeetingOpen(false);
        }}
        counts={{
          overview: 0,
          threads: wsThreads.filter((t) => t.status === "active").length,
          meetings: wsLibrary.length,
          people: wsPeople.length,
          decisions: wsDecisions.filter((d) => d.decision.status === "proposed")
            .length,
          followups: wsOpen.filter((o) => !o.action.parked).length,
        }}
        runtimeReady={runtimeReady}
        onSettings={openSettings}
        routes={routes.filter((r) => r.enabled)}
        routeStatus={Object.fromEntries(
          Object.values(routeSessions).map((x) => [x.route, x.status]),
        )}
        onRoute={(id) => {
          setRouteOpen(id);
          ensureRoute(id).catch((e) => setError(String(e)));
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line px-8 py-4">
          <div className="flex min-w-0 flex-col">
            <span className="eyebrow text-olive">{wsName}</span>
            <h1
              dir="auto"
              className="display arabic truncate text-start text-[22px] leading-tight"
            >
              {headline}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {talk === "idle" ? (
              <Button tone="quiet" size="lg" onClick={startTalk} title="talk to Za3tar">
                Talk
              </Button>
            ) : (
              <Button
                tone={talkMuted ? "quiet" : "accent"}
                size="lg"
                onClick={() => live.current?.setMuted(!talkMuted)}
                title={talkMuted ? "unmute" : "mute"}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${talkMuted ? "bg-olive" : "pulse bg-ink"}`}
                />
                {talk === "connecting" ? "Connecting…" : talkMuted ? "Muted" : "Listening"}
              </Button>
            )}
            {busy && (
              <span className="flex items-center gap-2 text-[12px] text-olive">
                <span className="pulse inline-block h-1.5 w-1.5 rounded-full bg-ink" />
                {busy}
              </span>
            )}
            {recordButton}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {routeOpen && routeSessions[routeOpen] && (
              <RoutePanel
                s={routeSessions[routeOpen]}
                onSend={(t) => {
                  askRoute(routeOpen, t);
                }}
                onPermission={(rpcId, optionId) => {
                  answerPermission(routeOpen, rpcId, optionId).catch((e) => setError(String(e)));
                  setRouteSessions((c) => ({ ...c, [routeOpen]: { ...c[routeOpen], permission: null } }));
                }}
                onCancel={() => cancelRoute(routeOpen).catch(() => {})}
                onClose={() => closeRoute(routeOpen)}
              />
            )}
            {talk !== "idle" && (
              <TalkPanel
                state={talk}
                lines={talkLines}
                muted={talkMuted}
                onMute={(m) => live.current?.setMuted(m)}
                onEnd={endTalk}
              />
            )}
            {flash && (
              <div className="rounded-lg border border-thyme bg-thyme/20 px-4 py-2 text-[13px]">
                <span className="font-semibold">Za3tar</span> · {flash}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-alert/40 bg-alert/8 px-4 py-2 text-[13px] text-alert">
                <span className="selectable flex-1">{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="text-[12px] text-alert/70 hover:text-alert"
                >
                  dismiss
                </button>
              </div>
            )}

            {showSettings && settingsForm ? (
              <SettingsView
                form={settingsForm}
                onChange={setSettingsForm}
                onSave={saveSettings}
                onClose={() => setShowSettings(false)}
              />
            ) : view === "overview" && !(meetingOpen && phase === "recording") ? (
              <WorkspaceView
                ws={
                  workspaces.find((w) => w.id === wsId) ?? {
                    id: wsId,
                    name: wsName,
                    created: 0,
                    description: "",
                    links: [],
                    runtime_command: "",
                  }
                }
                library={wsLibrary}
                people={wsPeople.filter((p) => p.workspaces.includes(wsId))}
                open={wsOpen}
                decisions={wsDecisions}
                threads={wsThreads}
                onOpenThread={(id) => {
                  setThreadOpen(id);
                  setView("threads");
                }}
                runtimeReady={runtimeReady}
                onSave={saveWorkspace}
                onOpenLink={openLink}
                onGo={setView}
                onOpenMeeting={openPast}
              />
            ) : view === "threads" && !meetingOpen ? (
              threadOpen && threads.find((t) => t.id === threadOpen) ? (
                <ThreadDetail
                  t={threads.find((t) => t.id === threadOpen)!}
                  library={wsLibrary}
                  open={wsOpen}
                  decisions={wsDecisions}
                  questions={wsQuestions}
                  busy={!!busy}
                  onBack={() => setThreadOpen(null)}
                  onSave={saveThread}
                  onDelete={deleteThread}
                  onOpenMeeting={openPast}
                  onDone={markOpenDone}
                  onNudge={nudge}
                  onDecisionStatus={setDecisionStatus}
                  onAddBrief={() => {
                    setView("meetings");
                    showFlash("use + brief; it files under this thread");
                  }}
                />
              ) : (
                <ThreadsView
                  threads={wsThreads}
                  library={wsLibrary}
                  open={wsOpen}
                  decisions={wsDecisions}
                  onOpen={setThreadOpen}
                  onCreate={createThread}
                />
              )
            ) : meetingOpen ? (
              <MeetingDetail
                phase={phase}
                viewingPast={viewingPast}
                dir={dir}
                created={current?.created}
                duration={current?.has_audio ? current.duration_secs : undefined}
                hasAudio={current?.has_audio ?? !viewingPast}
                title={title}
                setTitle={setTitle}
                person={person}
                setPerson={setPerson}
                onMetaBlur={saveMeta}
                people={people}
                workspaces={workspaces}
                meetingWs={meetingWs}
                onMoveWorkspace={moveMeeting}
                threads={threads}
                meetingThread={meetingThread}
                onMoveThread={moveMeetingThread}
                levels={levels}
                roughNotes={roughNotes}
                setRoughNotes={setRoughNotes}
                permissionHint={permissionHint}
                heardThem={heardThem}
                onGrantSystemAudio={grantSystemAudio}
                segments={segments}
                notes={notes}
                actions={actions}
                draft={draft}
                setDraft={setDraft}
                busy={busy}
                copied={copied}
                showTranscript={showTranscript}
                setShowTranscript={setShowTranscript}
                runtimeReady={runtimeReady}
                onBack={() => setMeetingOpen(false)}
                onTranscribePast={transcribePast}
                onMakeNotes={makeNotes}
                onExtract={extractActions}
                onToggleDone={toggleDone}
                onDecisionStatus={setDecisionStatus}
                onDraft={makeDraft}
                onSendDraft={sendDraft}
                onCopyDraft={copyDraft}
                onDraftViaRuntime={sendDraftViaRuntime}
                onExportCalendar={exportCalendar}
                onTrack={trackAndSchedule}
                onCopyPacket={copyPacket}
              />
            ) : view === "meetings" || view === "overview" || view === "threads" ? (
              <MeetingsView
                library={wsLibrary}
                currentDir={dir}
                onOpen={openPast}
                runtimeReady={runtimeReady}
                schedule={schedule}
                onFetchToday={fetchToday}
                onPrefill={(t, who) => {
                  setTitle(t);
                  setPerson(who);
                  showFlash("next recording pre-filled");
                }}
                onCreateBrief={createBrief}
                busy={!!busy}
              />
            ) : view === "people" ? (
              <PeopleView
                people={wsPeople}
                workspaces={workspaces}
                onSave={savePerson}
              />
            ) : view === "decisions" ? (
              <DecisionsView
                decisions={wsDecisions}
                onStatus={setDecisionStatus}
                onOpenMeeting={openPast}
                busy={!!busy}
              />
            ) : (
              <FollowUpsView
                openActions={wsOpen}
                runtimeStatus={runtimeStatus}
                runtimeReady={runtimeReady}
                onSync={syncFollowups}
                onDone={markOpenDone}
                onPark={parkAction}
                onNudge={nudge}
                onOpenMeeting={openPast}
                busy={!!busy}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
