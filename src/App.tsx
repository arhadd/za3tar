import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MarkdownLite } from "./MarkdownLite";

type Level = { peak: number; seconds: number };
type Segment = { speaker: string; start: number; text: string };
type Phase = "idle" | "recording" | "processing" | "done";
type Summary = {
  dir: string;
  id: string;
  created: number;
  title: string;
  person: string;
  has_transcript: boolean;
  has_notes: boolean;
  duration_secs: number;
};
type PersonRow = {
  name: string;
  phone: string;
  email: string;
  meetings: number;
  last_met: number;
  open_actions: number;
};
type ActionItem = {
  id: number;
  title: string;
  owner: string;
  due_label?: string | null;
  due_date?: string | null;
  detail?: string | null;
  done: boolean;
};
type MeetingActions = {
  decisions: string[];
  actions: ActionItem[];
  questions: string[];
};
type DraftKind = "whatsapp" | "email";
type Draft = { kind: DraftKind; subject: string; body: string; target: string };
type OpenAction = {
  dir: string;
  meeting_title: string;
  meeting_created: number;
  person: string;
  action: ActionItem;
};
type Settings = {
  elevenlabs_api_key: string;
  anthropic_api_key: string;
  user_name: string;
  agent_name: string;
  agent_command: string;
};
// agent bridge envelopes — docs/AGENT-PROTOCOL.md
type AgentAck = {
  ok: boolean;
  events_created: { action_id: string; title: string; when: string }[];
  followups_tracked: string[];
  person: string;
  warnings: string[];
};
type AgentEvent = {
  start: string;
  end: string;
  title: string;
  attendees: string[];
};
type AgentSchedule = { date: string; events: AgentEvent[]; error?: string };
type AgentFollowupStatus = {
  id: string;
  status: string;
  note: string;
  updated_at: string;
};

/** the far side is still an agent — find the header, then the outermost JSON */
function parseEnvelope<T>(reply: string, header: string): T {
  const at = reply.indexOf(header);
  const start = reply.indexOf("{", at >= 0 ? at + header.length : 0);
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error(`no ${header} in the agent's reply`);
  return JSON.parse(reply.slice(start, end + 1)) as T;
}

const meetingIdOf = (d: string) => d.replace(/\/+$/, "").split("/").pop() || d;
/** local action ids are per-meeting SQLite ids; the bridge needs global ones */
const bridgeId = (d: string, actionId: number) =>
  `${meetingIdOf(d)}#a${actionId}`;

/** "HH:MM" → minutes since local midnight (NaN if malformed) */
function hhmmToMin(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** Meeting date passed to the extractor so it can resolve "بكرا" to a real date. */
function todayContext(): string {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${d.toISOString().slice(0, 10)} (${weekday})`;
}

function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dir, setDir] = useState<string | null>(null);
  const [levels, setLevels] = useState<{ mic?: Level; system?: Level }>({});
  const [permissionHint, setPermissionHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const [title, setTitle] = useState("");
  const [person, setPerson] = useState("");
  const [roughNotes, setRoughNotes] = useState("");
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [actions, setActions] = useState<MeetingActions | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [library, setLibrary] = useState<Summary[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewingPast, setViewingPast] = useState(false);
  const [openActions, setOpenActions] = useState<OpenAction[]>([]);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [personEdit, setPersonEdit] = useState<PersonRow | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState<Settings | null>(null);
  const [schedule, setSchedule] = useState<AgentSchedule | null>(null);
  const [agentStatus, setAgentStatus] = useState<
    Record<string, AgentFollowupStatus>
  >({});
  // the bridge: your always-on agent, if you've connected one (⚙ settings)
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [agentName, setAgentName] = useState("your agent");
  const timer = useRef<number | null>(null);

  // whether anyone besides the user was heard (them / them2 / …)
  const heardThem = !!segments?.some((s) => s.speaker !== "me");

  async function refreshLibrary() {
    try {
      setLibrary(await invoke<Summary[]>("list_recordings"));
    } catch {
      /* library is best-effort */
    }
    try {
      const open = await invoke<OpenAction[]>("list_open_actions");
      // overdue first, then newest meeting first
      const today = new Date().toISOString().slice(0, 10);
      open.sort((a, b) => {
        const ao = a.action.due_date && a.action.due_date < today ? 0 : 1;
        const bo = b.action.due_date && b.action.due_date < today ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return b.meeting_created - a.meeting_created;
      });
      setOpenActions(open);
    } catch {
      /* follow-ups are best-effort */
    }
    try {
      setPeople(await invoke<PersonRow[]>("list_people"));
    } catch {
      /* directory is best-effort */
    }
  }

  const contactOf = (name: string): PersonRow | undefined =>
    people.find((p) => p.name === name);

  /** wa.me wants bare international digits */
  const waDigits = (phone: string) => phone.replace(/[^\d]/g, "");

  async function refreshAgent() {
    try {
      setAgentAvailable(await invoke<boolean>("agent_available"));
      const s = await invoke<Settings>("get_settings");
      if (s.agent_name.trim()) setAgentName(s.agent_name.trim());
    } catch {
      /* bridge is best-effort */
    }
  }

  useEffect(() => {
    refreshLibrary();
    refreshAgent();
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
    return () => {
      un.then((f) => f());
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

  function showFlash(msg: string, ms = 2000) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), ms);
  }

  async function start() {
    setError(null);
    setPermissionHint(null);
    setSegments(null);
    setNotes(null);
    setActions(null);
    setDraft(null);
    setLevels({});
    setElapsed(0);
    setViewingPast(false);
    setShowLibrary(false);
    try {
      await invoke("start_recording");
      setPhase("recording");
    } catch (e) {
      setError(String(e));
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
      refreshLibrary();
    }
  }

  async function stop() {
    try {
      const d = await invoke<string>("stop_recording");
      setDir(d);
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
      refreshLibrary();
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
      refreshLibrary();
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
      refreshLibrary();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleDone(a: ActionItem) {
    if (!dir || !actions) return;
    const next = {
      ...actions,
      actions: actions.actions.map((x) =>
        x.id === a.id ? { ...x, done: !x.done } : x,
      ),
    };
    setActions(next);
    invoke("set_action_done", { dir, id: a.id, done: !a.done }).catch(() => {});
  }

  async function makeDraft(kind: DraftKind) {
    if (!dir) return;
    setError(null);
    setBusy(
      kind === "whatsapp"
        ? "drafting the whatsapp follow-up…"
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

  async function sendDraft() {
    if (!draft) return;
    const contact = draft.target ? contactOf(draft.target) : undefined;
    try {
      if (draft.kind === "whatsapp") {
        const text = encodeURIComponent(draft.body);
        const digits = contact?.phone ? waDigits(contact.phone) : "";
        // with a saved number the draft opens straight in that person's chat
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

  /** one round-trip over the bridge; null on transport failure */
  async function agentExchange(
    message: string,
    busyMsg: string,
  ): Promise<string | null> {
    setBusy(busyMsg);
    setError(null);
    try {
      return await invoke<string>("send_to_agent", { message });
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** hand a message to the agent and surface its reply */
  async function agentSend(message: string) {
    const reply = await agentExchange(message, `sending to ${agentName}…`);
    if (reply != null)
      showFlash(
        `🪼 ${reply.slice(0, 140)}${reply.length > 140 ? "…" : ""}`,
        5000,
      );
  }

  /** the whole meeting → the agent as a ZA3TAR_PACKET: calendar +
      follow-up tracking, acknowledged structurally */
  async function sendPacketToAgent() {
    if (!actions || !dir) return;
    const contact = person.trim() ? contactOf(person.trim()) : undefined;
    const created = library.find((s) => s.dir === dir)?.created;
    const open = actions.actions.filter((a) => !a.done);
    const packet = {
      meeting: {
        id: meetingIdOf(dir),
        title: title.trim() || "untitled",
        started_at: created
          ? new Date(created * 1000).toISOString()
          : new Date().toISOString(),
        person: { name: person.trim(), phone: contact?.phone ?? "" },
      },
      decisions: actions.decisions,
      actions: open.map((a) => ({
        id: bridgeId(dir, a.id),
        text: a.title,
        owner: a.owner,
        due: a.due_date ?? "",
      })),
      questions: actions.questions,
      notes_md: notes ?? "",
    };
    const reply = await agentExchange(
      `ZA3TAR_PACKET v1\n${JSON.stringify(packet)}`,
      `sending the meeting to ${agentName}…`,
    );
    if (reply == null) return;
    try {
      const ack = parseEnvelope<AgentAck>(reply, "ZA3TAR_ACK");
      const bits = [
        `📅 ${ack.events_created.length} on calendar`,
        `📌 ${ack.followups_tracked.length} follow-ups tracked`,
      ];
      if (ack.warnings.length) bits.push(`⚠ ${ack.warnings[0]}`);
      showFlash(`🪼 ${bits.join(" · ")}`, 6000);
    } catch {
      // free-form reply (agent without the envelope skill) — show what came back
      showFlash(
        `🪼 ${reply.slice(0, 140)}${reply.length > 140 ? "…" : ""}`,
        5000,
      );
    }
  }

  /** ask the agent for today's calendar so meetings start pre-titled */
  async function fetchToday() {
    const reply = await agentExchange(
      `ZA3TAR_QUERY v1\n{"type":"today"}`,
      `asking ${agentName} about today…`,
    );
    if (reply == null) return;
    try {
      setSchedule(parseEnvelope<AgentSchedule>(reply, "ZA3TAR_SCHEDULE"));
    } catch {
      setError("the agent's schedule reply wasn't parseable");
    }
  }

  /** pull real-world follow-up statuses (nudged/replied/done) back from the agent */
  async function syncFollowups() {
    const snapshot = [...openActions];
    const ids = snapshot.map((oa) => bridgeId(oa.dir, oa.action.id));
    if (!ids.length) return;
    const reply = await agentExchange(
      `ZA3TAR_QUERY v1\n${JSON.stringify({ type: "followups", ids })}`,
      `syncing follow-ups with ${agentName}…`,
    );
    if (reply == null) return;
    try {
      const st = parseEnvelope<{ followups: AgentFollowupStatus[] }>(
        reply,
        "ZA3TAR_STATUS",
      );
      const map: Record<string, AgentFollowupStatus> = {};
      for (const f of st.followups) map[f.id] = f;
      setAgentStatus(map);
      // the agent confirmed some complete → the app agrees
      let done = 0;
      for (const oa of snapshot) {
        if (map[bridgeId(oa.dir, oa.action.id)]?.status === "done") {
          markOpenDone(oa);
          done++;
        }
      }
      showFlash(
        `🪼 synced ${st.followups.length} from ${agentName}${done ? ` · ${done} completed` : ""}`,
        4000,
      );
    } catch {
      setError("the agent's status reply wasn't parseable");
    }
  }

  /** the agent delivers the draft to the person over WhatsApp */
  async function sendDraftViaAgent() {
    if (!draft) return;
    const contact = draft.target ? contactOf(draft.target) : undefined;
    const who = draft.target || "the other participant";
    const via = contact?.phone
      ? ` (WhatsApp ${contact.phone})`
      : contact?.email
        ? ` (email ${contact.email})`
        : " (find them in my contacts)";
    await agentSend(
      `[za3tar] please send this message to ${who}${via} and confirm once delivered:\n\n${draft.body}`,
    );
  }

  async function exportCalendar() {
    if (!dir) return;
    setError(null);
    try {
      await invoke<string>("export_calendar", {
        dir,
        title: title.trim() || null,
      });
      showFlash("sent to Calendar 📅");
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
    showFlash("draft copied ✓");
  }

  /** notes + open actions + questions as one markdown packet. */
  function packetMarkdown(): string {
    let md = `# ${title.trim() || "meeting"} — ${new Date().toLocaleDateString()}\n\n`;
    if (notes) md += `${notes}\n\n`;
    if (actions) {
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

  async function openPast(recDir: string) {
    setError(null);
    setPermissionHint(null);
    setBusy(null);
    try {
      const detail = await invoke<{
        title: string;
        person: string;
        segments: Segment[];
        notes: string | null;
      }>("load_recording", { dir: recDir });
      const past = await invoke<MeetingActions | null>("load_actions", {
        dir: recDir,
      }).catch(() => null);
      setDir(recDir);
      setTitle(detail.title);
      setPerson(detail.person);
      setSegments(detail.segments.length ? detail.segments : null);
      setNotes(detail.notes);
      setActions(past);
      setDraft(null);
      setRoughNotes("");
      setViewingPast(true);
      setShowLibrary(false);
      setShowFollowUps(false);
      setPhase("done");
    } catch (e) {
      setError(String(e));
    }
  }

  /** mark an open action done from the follow-ups view (optimistic) */
  async function markOpenDone(oa: OpenAction) {
    setOpenActions((cur) =>
      cur.filter((x) => !(x.dir === oa.dir && x.action.id === oa.action.id)),
    );
    // keep the per-meeting view in sync if it's the one on screen
    if (dir === oa.dir && actions) {
      setActions({
        ...actions,
        actions: actions.actions.map((x) =>
          x.id === oa.action.id ? { ...x, done: true } : x,
        ),
      });
    }
    invoke("set_action_done", {
      dir: oa.dir,
      id: oa.action.id,
      done: true,
    }).catch(() => {});
  }

  /** chase one open action — drafts a WhatsApp nudge into the draft panel */
  async function nudge(oa: OpenAction) {
    setError(null);
    setBusy("drafting the nudge…");
    try {
      const d = await invoke<{ subject?: string | null; body: string }>(
        "draft_nudge",
        { dir: oa.dir, id: oa.action.id, title: oa.meeting_title || null },
      );
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
      showFlash("settings saved ✓");
      refreshAgent();
    } catch (e) {
      setError(String(e));
    }
  }

  function grantSystemAudio() {
    invoke("open_system_audio_settings").catch(() => {});
  }

  function ownerChipClass(owner: string): string {
    if (owner === "me") return "bg-olive/15 text-olive-deep";
    if (owner.startsWith("them")) return "bg-sumac/15 text-sumac";
    return "bg-sesame text-ink-soft";
  }

  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  const openCount = actions?.actions.filter((a) => !a.done).length ?? 0;

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-5 p-6">
      <header className="flex items-center gap-2">
        <span className="text-2xl">🌿</span>
        <h1 className="text-2xl font-bold text-olive-deep">za3tar</h1>
        <span className="hidden text-xs text-ink-soft sm:inline">
          from meeting to done, بالعربيزي
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              refreshLibrary();
              setShowPeople((v) => !v);
              setShowLibrary(false);
              setShowFollowUps(false);
            }}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-soft transition hover:bg-sesame hover:text-olive-deep"
          >
            people{people.length ? ` · ${people.length}` : ""}
          </button>
          <button
            onClick={() => {
              refreshLibrary();
              setShowFollowUps((v) => !v);
              setShowLibrary(false);
              setShowPeople(false);
            }}
            className={`rounded-lg px-2.5 py-1 text-xs transition hover:bg-sesame hover:text-olive-deep ${
              openActions.length ? "font-medium text-sumac" : "text-ink-soft"
            }`}
          >
            follow-ups{openActions.length ? ` · ${openActions.length}` : ""}
          </button>
          <button
            onClick={() => {
              refreshLibrary();
              setShowLibrary((v) => !v);
              setShowFollowUps(false);
            }}
            className="rounded-lg px-2.5 py-1 text-xs text-ink-soft transition hover:bg-sesame hover:text-olive-deep"
          >
            {showLibrary
              ? "close"
              : `past meetings${library.length ? ` · ${library.length}` : ""}`}
          </button>
          <button
            onClick={openSettings}
            aria-label="settings"
            className="rounded-lg px-2 py-1 text-xs text-ink-soft transition hover:bg-sesame hover:text-olive-deep"
          >
            ⚙
          </button>
        </div>
      </header>

      {showLibrary && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-white p-2">
          {library.length === 0 && (
            <p className="px-2 py-3 text-sm text-ink-soft">
              no meetings yet — hit record 🌿
            </p>
          )}
          {library.map((s) => (
            <button
              key={s.id}
              onClick={() => openPast(s.dir)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-cream ${
                dir === s.dir ? "bg-cream" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">
                  {s.title || "untitled meeting"}
                </span>
                <span className="text-[11px] text-ink-soft">
                  {relDate(s.created)} · {fmtDur(s.duration_secs)}
                </span>
              </div>
              <div className="flex shrink-0 gap-1 text-[10px]">
                {s.has_notes ? (
                  <span className="rounded bg-olive/15 px-1.5 py-0.5 text-olive-deep">
                    notes
                  </span>
                ) : s.has_transcript ? (
                  <span className="rounded bg-sesame px-1.5 py-0.5 text-ink-soft">
                    transcript
                  </span>
                ) : (
                  <span className="rounded bg-sesame px-1.5 py-0.5 text-ink-soft">
                    audio
                  </span>
                )}
              </div>
            </button>
          ))}
        </section>
      )}

      {showPeople && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-white p-3">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-olive-deep">
            people · who you've been meeting
          </h2>
          {people.length === 0 && (
            <p className="px-1 py-2 text-sm text-ink-soft">
              tag a meeting with a person ("with whom?") and they show up here
            </p>
          )}
          {people.map((p) =>
            personEdit && personEdit.name === p.name ? (
              <div
                key={p.name}
                className="flex flex-col gap-2 rounded-lg border border-olive/30 bg-cream/60 p-2"
              >
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={personEdit.phone}
                    onChange={(e) =>
                      setPersonEdit({ ...personEdit, phone: e.target.value })
                    }
                    placeholder="phone (+9627…)"
                    className="min-w-0 flex-1 rounded-lg border border-sesame bg-white px-2.5 py-1.5 text-sm outline-none focus:border-olive"
                  />
                  <input
                    value={personEdit.email}
                    onChange={(e) =>
                      setPersonEdit({ ...personEdit, email: e.target.value })
                    }
                    placeholder="email"
                    className="min-w-0 flex-1 rounded-lg border border-sesame bg-white px-2.5 py-1.5 text-sm outline-none focus:border-olive"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await invoke("save_person", {
                          name: personEdit.name,
                          phone: personEdit.phone,
                          email: personEdit.email,
                        });
                        setPersonEdit(null);
                        refreshLibrary();
                        showFlash("contact saved ✓");
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                    className="rounded-lg bg-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-olive-deep"
                  >
                    save
                  </button>
                  <button
                    onClick={() => setPersonEdit(null)}
                    className="rounded-lg px-2 py-1.5 text-xs text-ink-soft hover:text-olive-deep"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={p.name}
                className="flex items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-cream"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  <span className="text-[11px] text-ink-soft">
                    {p.meetings} meeting{p.meetings === 1 ? "" : "s"}
                    {p.last_met ? ` · last ${relDate(p.last_met)}` : ""}
                    {p.phone ? ` · 📱 ${p.phone}` : ""}
                    {p.email ? ` · ✉️ ${p.email}` : ""}
                  </span>
                </div>
                {p.open_actions > 0 && (
                  <span className="rounded-full bg-sumac/15 px-2 py-0.5 text-[10px] font-medium text-sumac">
                    {p.open_actions} open
                  </span>
                )}
                <button
                  onClick={() => setPersonEdit(p)}
                  className="rounded-lg bg-sesame px-2 py-1 text-[11px] font-medium text-ink hover:bg-olive/20"
                >
                  {p.phone || p.email ? "edit" : "add contact"}
                </button>
              </div>
            ),
          )}
        </section>
      )}

      {showFollowUps && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-white p-3">
          <div className="flex items-center gap-2 px-1">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
              open follow-ups · across all meetings
            </h2>
            {agentAvailable && openActions.length > 0 && (
              <button
                onClick={syncFollowups}
                disabled={!!busy}
                title={`pull nudged/replied/done statuses back from ${agentName}`}
                className="ml-auto rounded-lg bg-sesame px-2 py-1 text-[11px] font-medium text-ink hover:bg-olive/20 disabled:opacity-60"
              >
                🪼 sync
              </button>
            )}
          </div>
          {openActions.length === 0 && (
            <p className="px-1 py-2 text-sm text-ink-soft">
              كله سالك — nothing open 🌿
            </p>
          )}
          {openActions.map((oa) => {
            const overdue =
              !!oa.action.due_date &&
              oa.action.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div
                key={`${oa.dir}-${oa.action.id}`}
                className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-cream"
              >
                <button
                  onClick={() => markOpenDone(oa)}
                  aria-label="mark done"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-sesame bg-white text-transparent transition hover:border-olive hover:text-olive"
                >
                  ✓
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    dir="auto"
                    className="arabic text-start text-sm text-ink"
                  >
                    {oa.action.title}
                  </span>
                  <button
                    onClick={() => openPast(oa.dir)}
                    className="self-start text-[11px] text-ink-soft hover:text-olive-deep"
                  >
                    {oa.person ? `${oa.person} · ` : ""}
                    {oa.meeting_title || "untitled meeting"} ·{" "}
                    {relDate(oa.meeting_created)} ↗
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(() => {
                    const js = agentStatus[bridgeId(oa.dir, oa.action.id)];
                    return js && js.status !== "open" ? (
                      <span
                        title={js.note || js.status}
                        className="rounded bg-olive/15 px-1.5 py-0.5 text-[10px] font-medium text-olive-deep"
                      >
                        🪼 {js.status}
                      </span>
                    ) : null;
                  })()}
                  {(oa.action.due_label || oa.action.due_date) && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        overdue
                          ? "bg-sumac/15 font-medium text-sumac"
                          : "bg-cream text-ink-soft"
                      }`}
                    >
                      {overdue ? "⏰ " : ""}
                      {oa.action.due_label || oa.action.due_date}
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ownerChipClass(oa.action.owner)}`}
                  >
                    {oa.action.owner}
                  </span>
                  <button
                    onClick={() => nudge(oa)}
                    disabled={!!busy}
                    title="draft a WhatsApp nudge"
                    className="rounded-lg bg-sesame px-2 py-1 text-[11px] font-medium text-ink hover:bg-olive/20 disabled:opacity-60"
                  >
                    💬 nudge
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {phase === "idle" && !viewingPast && (
        <section className="flex flex-col gap-1.5">
          {agentAvailable && !schedule && (
            <button
              onClick={fetchToday}
              disabled={!!busy}
              title={`${agentName} reads your calendar so meetings start pre-titled`}
              className="self-start rounded-lg bg-sesame px-2.5 py-1 text-xs text-ink-soft transition hover:bg-olive/20 hover:text-olive-deep disabled:opacity-60"
            >
              🪼 today's meetings
            </button>
          )}
          {schedule && (
            <div className="flex flex-col gap-1 rounded-2xl bg-white p-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
                  today · from {agentName}
                </h2>
                <button
                  onClick={fetchToday}
                  disabled={!!busy}
                  className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep disabled:opacity-60"
                >
                  refresh
                </button>
              </div>
              {schedule.error && (
                <p className="px-1 py-1 text-xs text-ink-soft">
                  🫧 calendar unreachable: {schedule.error}
                </p>
              )}
              {!schedule.error && schedule.events.length === 0 && (
                <p className="px-1 py-1 text-sm text-ink-soft">
                  رزنامتك فاضية اليوم 🌿
                </p>
              )}
              {schedule.events.map((ev, i) => {
                const nowMin =
                  new Date().getHours() * 60 + new Date().getMinutes();
                const s = hhmmToMin(ev.start);
                const e = hhmmToMin(ev.end);
                const live =
                  !isNaN(s) && nowMin >= s - 10 && (isNaN(e) || nowMin <= e);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setTitle(ev.title);
                      setPerson(ev.attendees[0] ?? "");
                    }}
                    title="pre-fill this meeting"
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-cream ${
                      live ? "bg-olive/10" : ""
                    }`}
                  >
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-soft">
                      {ev.start}
                    </span>
                    <span
                      dir="auto"
                      className="arabic min-w-0 flex-1 truncate text-start text-sm text-ink"
                    >
                      {ev.title}
                    </span>
                    {ev.attendees.length > 0 && (
                      <span className="shrink-0 rounded bg-sesame px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {ev.attendees[0]}
                      </span>
                    )}
                    {live && (
                      <span className="shrink-0 rounded-full bg-olive/15 px-2 py-0.5 text-[10px] font-medium text-olive-deep">
                        now — record?
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {(phase === "idle" || viewingPast) && (
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (viewingPast && dir)
                invoke("set_recording_title", {
                  dir,
                  title: title.trim(),
                }).catch(() => {});
            }}
            placeholder="what's this meeting? (optional)"
            className="min-w-0 flex-[2] rounded-xl border border-sesame bg-white px-4 py-3 text-sm outline-none focus:border-olive"
          />
          <input
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            onBlur={() => {
              if (viewingPast && dir) {
                invoke("set_recording_person", {
                  dir,
                  person: person.trim(),
                }).catch(() => {});
                refreshLibrary();
              }
            }}
            placeholder="with whom?"
            className="min-w-0 flex-1 rounded-xl border border-sesame bg-white px-4 py-3 text-sm outline-none focus:border-olive"
          />
        </div>
      )}

      {!viewingPast && (
        <button
          onClick={phase === "recording" ? stop : start}
          disabled={phase === "processing"}
          className={`flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-semibold text-white transition disabled:opacity-60 ${
            phase === "recording" ? "bg-sumac" : "bg-olive hover:bg-olive-deep"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 rounded-full bg-white ${
              phase === "recording" ? "animate-pulse" : ""
            }`}
          />
          {phase === "recording"
            ? `stop · ${mmss}`
            : phase === "processing"
              ? "…"
              : segments
                ? "record another"
                : "start recording"}
        </button>
      )}

      {viewingPast && (
        <button
          onClick={start}
          className="flex items-center justify-center gap-3 rounded-2xl bg-olive px-6 py-4 text-base font-semibold text-white transition hover:bg-olive-deep"
        >
          <span className="inline-block h-3 w-3 rounded-full bg-white" />
          new recording
        </button>
      )}

      {viewingPast && !segments && !busy && (
        <button
          onClick={transcribePast}
          className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
        >
          transcribe this recording
        </button>
      )}

      {phase === "recording" && (
        <>
          <div className="flex flex-col gap-3">
            <LevelBar
              label="me (mic)"
              level={levels.mic}
              color="var(--color-olive)"
            />
            <LevelBar
              label="them (system)"
              level={levels.system}
              color="var(--color-sumac)"
            />
          </div>
          <textarea
            value={roughNotes}
            onChange={(e) => setRoughNotes(e.target.value)}
            placeholder="jot rough notes while you talk — za3tar folds them into the summary…"
            className="min-h-24 rounded-xl border border-sesame bg-white p-3 text-sm outline-none focus:border-olive"
          />
        </>
      )}

      {permissionHint && (
        <div className="flex flex-col gap-2 rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-ink">
          <span>🫧 {permissionHint}</span>
          <button
            onClick={grantSystemAudio}
            className="self-start rounded-lg bg-sumac px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            open System Settings
          </button>
        </div>
      )}

      {/* after processing: if only the user was heard, the system-audio grant is
          missing (in-person voices would have been split by diarization) */}
      {phase === "done" &&
        !viewingPast &&
        segments &&
        !heardThem &&
        !permissionHint && (
          <div className="flex flex-col gap-2 rounded-xl border border-sesame bg-white p-4 text-sm text-ink">
            <span>
              🫧 sme3na بس صوتك — the other side's track was silent. grant{" "}
              <b>System Audio Recording</b> so za3tar captures them too.
            </span>
            <button
              onClick={grantSystemAudio}
              className="self-start rounded-lg bg-olive px-3 py-1.5 text-xs font-semibold text-white hover:bg-olive-deep"
            >
              open System Settings
            </button>
          </div>
        )}

      {busy && (
        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-olive" />
          {busy}
        </div>
      )}

      {flash && (
        <div className="rounded-xl bg-olive/10 px-4 py-2 text-sm text-olive-deep">
          {flash}
        </div>
      )}

      {segments && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">transcript</h2>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl bg-white p-3">
            {segments.map((s, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                <span
                  className="text-[11px] font-medium"
                  style={{
                    color:
                      s.speaker === "me"
                        ? "var(--color-olive)"
                        : "var(--color-sumac)",
                  }}
                >
                  {s.speaker}
                </span>
                <p dir="rtl" className="arabic text-right text-sm text-ink">
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          {!notes && !busy && (
            <button
              onClick={makeNotes}
              className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
            >
              ✍️ make notes
            </button>
          )}
        </section>
      )}

      {notes && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">notes</h2>
            <button
              onClick={makeNotes}
              disabled={!!busy}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep disabled:opacity-60"
            >
              regenerate
            </button>
            <button
              onClick={copyPacket}
              className="rounded-lg bg-sesame px-3 py-1 text-xs text-ink-soft hover:text-olive-deep"
            >
              {copied ? "copied ✓" : "copy markdown"}
            </button>
          </div>
          <div
            dir="rtl"
            className="arabic rounded-xl bg-white p-4 text-right text-sm leading-relaxed text-ink"
          >
            <MarkdownLite md={notes} />
          </div>
        </section>
      )}

      {segments && !actions && !busy && (
        <button
          onClick={extractActions}
          className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
        >
          🎯 pull out decisions & actions
        </button>
      )}

      {actions && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-soft">
              what came out of it
            </h2>
            {openCount > 0 && (
              <span className="rounded-full bg-sumac/15 px-2 py-0.5 text-[11px] font-medium text-sumac">
                {openCount} open
              </span>
            )}
            <button
              onClick={extractActions}
              disabled={!!busy}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep disabled:opacity-60"
            >
              re-extract
            </button>
          </div>

          {actions.decisions.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
                decisions
              </h3>
              {actions.decisions.map((d, i) => (
                <p
                  key={i}
                  dir="auto"
                  className="arabic text-start text-sm text-ink"
                >
                  ✅ {d}
                </p>
              ))}
            </div>
          )}

          {actions.actions.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl bg-white p-3">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-olive-deep">
                action items
              </h3>
              {actions.actions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-2.5 rounded-lg px-1 py-1.5 hover:bg-cream"
                >
                  <button
                    onClick={() => toggleDone(a)}
                    aria-label={a.done ? "mark not done" : "mark done"}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition ${
                      a.done
                        ? "border-olive bg-olive text-white"
                        : "border-sesame bg-white text-transparent hover:border-olive"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      dir="auto"
                      className={`arabic text-start text-sm ${
                        a.done ? "text-ink-soft line-through" : "text-ink"
                      }`}
                    >
                      {a.title}
                    </span>
                    {a.detail && (
                      <span
                        dir="auto"
                        className="arabic text-start text-xs text-ink-soft"
                      >
                        {a.detail}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(a.due_label || a.due_date) && (
                      <span className="rounded bg-cream px-1.5 py-0.5 text-[10px] text-ink-soft">
                        {a.due_label || a.due_date}
                      </span>
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ownerChipClass(a.owner)}`}
                    >
                      {a.owner}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {actions.questions.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-white p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-olive-deep">
                open questions
              </h3>
              {actions.questions.map((q, i) => (
                <p
                  key={i}
                  dir="auto"
                  className="arabic text-start text-sm text-ink"
                >
                  ❓ {q}
                </p>
              ))}
            </div>
          )}

          {actions.decisions.length === 0 &&
            actions.actions.length === 0 &&
            actions.questions.length === 0 && (
              <p className="rounded-xl bg-white p-4 text-sm text-ink-soft">
                ما في قرارات أو مهام واضحة بهاللقاء — حكي حلو بس 🌿
              </p>
            )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => makeDraft("whatsapp")}
              disabled={!!busy}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
            >
              💬 whatsapp follow-up
            </button>
            <button
              onClick={() => makeDraft("email")}
              disabled={!!busy}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
            >
              ✉️ recap email
            </button>
            <button
              onClick={exportCalendar}
              disabled={!!busy}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20 disabled:opacity-60"
            >
              📅 add to Calendar
            </button>
            {agentAvailable && (
              <button
                onClick={sendPacketToAgent}
                disabled={!!busy}
                title={`${agentName} puts dated items on your calendar and tracks the follow-ups`}
                className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep disabled:opacity-60"
              >
                🪼 send to {agentName}
              </button>
            )}
            <button
              onClick={copyPacket}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20"
            >
              {copied ? "copied ✓" : "📋 copy packet"}
            </button>
          </div>
        </section>
      )}

      {draft && (
        <section className="flex flex-col gap-2 rounded-2xl border border-olive/30 bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-olive-deep">
              {draft.kind === "whatsapp"
                ? "💬 whatsapp draft"
                : "✉️ email draft"}
            </h2>
            {draft.target && (
              <span className="rounded bg-olive/15 px-1.5 py-0.5 text-[10px] font-medium text-olive-deep">
                → {draft.target}
              </span>
            )}
            <span className="text-[11px] text-ink-soft">
              edit it, then send — nothing leaves without you
            </span>
            <button
              onClick={() => setDraft(null)}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep"
            >
              close
            </button>
          </div>
          {draft.kind === "email" && (
            <input
              dir="auto"
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="subject"
              className="arabic rounded-lg border border-sesame px-3 py-2 text-start text-sm outline-none focus:border-olive"
            />
          )}
          <textarea
            dir="auto"
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            className="arabic min-h-40 rounded-lg border border-sesame p-3 text-start text-sm leading-relaxed outline-none focus:border-olive"
          />
          <div className="flex gap-2">
            <button
              onClick={sendDraft}
              className="rounded-xl bg-olive px-3.5 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
            >
              {draft.kind === "whatsapp" ? "open in WhatsApp" : "open in Mail"}
            </button>
            <button
              onClick={copyDraft}
              className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20"
            >
              copy
            </button>
            {agentAvailable && (
              <button
                onClick={sendDraftViaAgent}
                disabled={!!busy}
                title={`${agentName} sends it to them on WhatsApp and confirms`}
                className="rounded-xl bg-sesame px-3.5 py-2 text-sm font-semibold text-ink hover:bg-olive/20 disabled:opacity-60"
              >
                🪼 have {agentName} send it
              </button>
            )}
          </div>
        </section>
      )}

      {showSettings && settingsForm && (
        <section className="flex flex-col gap-3 rounded-2xl border border-olive/30 bg-white p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-olive-deep">
              ⚙ settings
            </h2>
            <span className="text-[11px] text-ink-soft">
              stored locally, applied immediately
            </span>
            <button
              onClick={() => setShowSettings(false)}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-ink-soft hover:text-olive-deep"
            >
              close
            </button>
          </div>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            your name (how the notes refer to you)
            <input
              value={settingsForm.user_name}
              onChange={(e) =>
                setSettingsForm({ ...settingsForm, user_name: e.target.value })
              }
              placeholder="e.g. Ala Haddad"
              className="rounded-lg border border-sesame px-3 py-2 text-sm text-ink outline-none focus:border-olive"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            ElevenLabs API key (transcription)
            <input
              type="password"
              value={settingsForm.elevenlabs_api_key}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  elevenlabs_api_key: e.target.value,
                })
              }
              className="rounded-lg border border-sesame px-3 py-2 text-sm text-ink outline-none focus:border-olive"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-soft">
            Anthropic API key (notes & actions)
            <input
              type="password"
              value={settingsForm.anthropic_api_key}
              onChange={(e) =>
                setSettingsForm({
                  ...settingsForm,
                  anthropic_api_key: e.target.value,
                })
              }
              className="rounded-lg border border-sesame px-3 py-2 text-sm text-ink outline-none focus:border-olive"
            />
          </label>
          <div className="mt-1 flex flex-col gap-3 border-t border-sesame pt-3">
            <p className="text-[11px] text-ink-soft">
              🪼 agent bridge (optional) — connect your always-on agent and
              za3tar can put items on your calendar, deliver follow-ups, and
              sync their status. See docs/AGENT-PROTOCOL.md.
            </p>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              agent name (what to call it in the app)
              <input
                value={settingsForm.agent_name}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    agent_name: e.target.value,
                  })
                }
                placeholder="e.g. Jello"
                className="rounded-lg border border-sesame px-3 py-2 text-sm text-ink outline-none focus:border-olive"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-soft">
              agent command — gets the message as its final argument, prints
              the reply
              <input
                value={settingsForm.agent_command}
                onChange={(e) =>
                  setSettingsForm({
                    ...settingsForm,
                    agent_command: e.target.value,
                  })
                }
                placeholder="e.g. ~/bin/hx -p jello -z"
                className="rounded-lg border border-sesame px-3 py-2 font-mono text-sm text-ink outline-none focus:border-olive"
              />
            </label>
          </div>
          <button
            onClick={saveSettings}
            className="self-start rounded-xl bg-olive px-4 py-2 text-sm font-semibold text-white hover:bg-olive-deep"
          >
            save
          </button>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-sumac/40 bg-sumac/10 p-4 text-sm text-sumac">
          🫧 {error}
        </div>
      )}
    </main>
  );
}

function LevelBar({
  label,
  level,
  color,
}: {
  label: string;
  level?: Level;
  color: string;
}) {
  const pct = Math.min(100, (level?.peak ?? 0) * 300);
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-ink-soft">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sesame">
        <div
          className="h-full rounded-full transition-[width] duration-150"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function fmtDur(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function relDate(unix: number): string {
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

export default App;
