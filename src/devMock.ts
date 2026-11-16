// Browser-only stand-in for the Rust commands (see ipc.ts). Fictional people
// and companies, shaped like the real records, enough to review every view.
// Nothing here is persisted; reload and it resets.
import type { EventCallback } from "@tauri-apps/api/event";
import type {
  ActionItem,
  Decision,
  MeetingActions,
  Segment,
  Settings,
  Thread,
  Workspace,
} from "./types";

type Rec = {
  dir: string;
  id: string;
  created: number;
  title: string;
  person: string;
  workspace: string;
  thread?: string;
  duration_secs: number;
  segments: Segment[];
  notes: string | null;
  actions: MeetingActions | null;
};

const FRESH =
  typeof location !== "undefined" && /[?&]fresh=1/.test(location.search);
const now = Math.floor(Date.now() / 1000);
const day = 86400;
const iso = (d: number) => new Date(d * 1000).toISOString().slice(0, 10);

const workspaces: Workspace[] = [
  {
    id: "noor",
    name: "Noor Coffee",
    created: now - 60 * day,
    description:
      "Noor Coffee's second branch. Yousef runs the branch; done means opening day on the 28th with the launch posts out.",
    links: [
      { kind: "source", label: "Noor Coffee WhatsApp group", target: "" },
      { kind: "source", label: "weekly check-in notes", target: "~/Documents/noor/notes.md" },
      { kind: "folder", label: "launch photos", target: "~/Documents/noor/photos" },
      { kind: "url", label: "content calendar", target: "https://calendar.example.com/noor" },
      { kind: "url", label: "menu page", target: "https://noor.example.com/menu" },
    ],
    runtime_command: "my-agent --profile noor",
  },
  {
    id: "sama",
    name: "Sama Skincare",
    created: now - 120 * day,
    description: "",
    links: [],
    runtime_command: "",
  },
  {
    id: "bayt",
    name: "Bayt Hotels",
    created: now - 3 * day,
    description: "",
    links: [],
    runtime_command: "",
  },
  // the app's built-in default workspace; in this demo it holds the agency's own work
  {
    id: "personal",
    name: "Studio",
    created: 0,
    description: "",
    links: [],
    runtime_command: "",
  },
];

const dec = (
  id: number,
  text: string,
  status: Decision["status"] = "proposed",
): Decision => ({
  id,
  text,
  status,
  note: "",
});
const act = (
  id: number,
  title: string,
  owner: string,
  due_label: string | null = null,
  due_date: string | null = null,
  done = false,
): ActionItem => ({
  id,
  title,
  owner,
  due_label,
  due_date,
  detail: null,
  done,
  parked: false,
});

const recsSeed: Rec[] = [
  {
    dir: "/mock/1",
    id: "1",
    created: now - 2 * 3600,
    title: "Bayt Hotels — kickoff",
    person: "Rana",
    workspace: "bayt",
    thread: "bayt-start",
    duration_secs: 41 * 60 + 12,
    segments: [
      {
        speaker: "me",
        start: 0.2,
        text: "أهلاً رنا، خلينا نبدأ: شو أهم إشي بدكم إياه أول شهر؟",
      },
      {
        speaker: "them",
        start: 6.1,
        text: "بصراحة الـ bookings المباشرة. أغلب الحجوزات لسا بتيجي من الـ platforms.",
      },
      {
        speaker: "me",
        start: 12.4,
        text: "تمام، بنبدأ بفندق واحد وبنشوف الأرقام قبل ما نكبّر.",
      },
      {
        speaker: "them",
        start: 18.0,
        text: "Perfect, let's start with the Aqaba property. ببعتلكم الـ brand guidelines بكرا.",
      },
      { speaker: "me", start: 24.6, text: "ممتاز، وأنا ببعت ملخص الاجتماع اليوم." },
    ],
    notes:
      "## Summary\n- Kickoff with Rana: the first goal is more direct bookings.\n- Start with one property and read the numbers before adding more.\n\n## Decisions\n- Start with the Aqaba property.\n\n## Actions\n- **Me:** send the kickoff recap.\n- **Rana:** share the brand guidelines.",
    actions: {
      decisions: [dec(1, "Start with the Aqaba property", "confirmed")],
      actions: [
        act(1, "Send the kickoff recap to Bayt Hotels", "me", "today", iso(now)),
        act(2, "Share the brand guidelines", "Rana", "tomorrow", iso(now + day)),
      ],
      questions: ["Who signs off on posts on their side?"],
    },
  },
  {
    dir: "/mock/2",
    id: "2",
    created: now - 2 * day,
    title: "Noor Coffee — launch check-in",
    person: "Yousef",
    workspace: "noor",
    thread: "noor-launch",
    duration_secs: 18 * 60 + 5,
    segments: [
      { speaker: "me", start: 0, text: "خلينا نراجع الـ launch posts وموعد التصوير." },
      { speaker: "them", start: 5.2, text: "الـ posts تمام، approved. بس التصوير يمكن نحتاج نأجله." },
    ],
    notes:
      "## Summary\n- Reviewed the launch posts for the second branch: approved.\n- The shoot may need to move; menu photos are still owed.\n\n## Decisions\n- Launch posts approved as they are.",
    actions: {
      decisions: [
        dec(1, "Launch posts approved as they are", "confirmed"),
        dec(2, "Shoot moves to Wednesday 10am"),
      ],
      actions: [
        act(1, "Send the menu photos", "Yousef", "last week", iso(now - day)),
      ],
      questions: [],
    },
  },
  {
    dir: "/mock/3",
    id: "3",
    created: now - 5 * day,
    title: "Sama Skincare — November review",
    person: "Hala",
    workspace: "sama",
    thread: "sama-december",
    duration_secs: 32 * 60,
    segments: [
      {
        speaker: "them",
        start: 0,
        text: "الـ report واضح، شكراً. خلوني أراجع خطة December وبرجعلكم.",
      },
    ],
    notes:
      "## Summary\n- Walked Hala through the November report.\n- December plan is with her for a yes.\n\n## Actions\n- **Hala:** approve the December plan.",
    actions: {
      decisions: [dec(1, "Keep the weekly reel", "confirmed")],
      actions: [
        act(1, "Approve the December plan", "Hala", "this week", iso(now + 2 * day)),
      ],
      questions: [],
    },
  },
];

const recs: Rec[] = FRESH ? [] : recsSeed;
const threadsSeed: Thread[] = [
  {
    id: "noor-launch",
    workspace: "noor",
    title: "Second branch launch",
    summary: "Opens on the 28th. Launch posts approved, menu photos late.",
    status: "active",
    owner: "me",
    created: now - 20 * day,
    updated: now - 2 * day,
  },
  {
    id: "sama-december",
    workspace: "sama",
    title: "December plan",
    summary: "November report sent. Waiting on their yes for the December plan.",
    status: "active",
    owner: "me",
    created: now - 10 * day,
    updated: now - 5 * day,
  },
  {
    id: "bayt-start",
    workspace: "bayt",
    title: "Getting started",
    summary: "New client. Kickoff call was this morning.",
    status: "active",
    owner: "me",
    created: now - 3 * day,
    updated: now - 2 * 3600,
  },
  {
    id: "studio-new-business",
    workspace: "personal",
    title: "New business",
    summary: "Two enquiries this week. Proposals not started.",
    status: "active",
    owner: "me",
    created: now - 6 * day,
    updated: now - 1 * day,
  },
  {
    id: "noor-loyalty",
    workspace: "noor",
    title: "Loyalty card for the second branch",
    summary: "",
    status: "idea",
    owner: "",
    created: now - 2 * day,
    updated: now - 2 * day,
  },
];

const threads: Thread[] = FRESH ? [] : threadsSeed;
const contactsSeed: Record<
  string,
  { phone: string; email: string; org: string; role: string; aliases: string[] }
> = {
  Yousef: {
    phone: "+962 79 000 0000",
    email: "yousef@noor.example",
    org: "Noor Coffee",
    role: "Branch manager",
    aliases: ["يوسف"],
  },
  Hala: {
    phone: "+962 77 000 0000",
    email: "hala@sama.example",
    org: "Sama Skincare",
    role: "Marketing lead",
    aliases: ["هلا"],
  },
  Rana: {
    phone: "+962 78 000 0000",
    email: "rana@bayt.example",
    org: "Bayt Hotels",
    role: "Brand manager",
    aliases: ["رنا"],
  },
};

const contacts: typeof contactsSeed = FRESH ? {} : contactsSeed;
if (FRESH)
  workspaces.splice(0, workspaces.length, {
    id: "personal",
    name: "Personal",
    created: 0,
    description: "",
    links: [],
    runtime_command: "",
  });
let settings: Settings = {
  elevenlabs_api_key: "",
  anthropic_api_key: "",
  openai_api_key: "",
  typesafe_api_key: "",
  user_name: "",
  language: "english",
  agent_name: "",
  agent_command: "~/bin/za3tar-runtime",
  thread_store: "",
  za3tar_token: "",
  za3tar_base: "",
  onboarded: "",
};

let mockSignedIn = false;
let feedMoved = false;
const listeners: Record<string, EventCallback<any>[]> = {};
let levelTimer: number | null = null;

function emit(event: string, payload: unknown) {
  for (const h of listeners[event] ?? []) h({ event, id: 0, payload });
}

export async function mockListen<T>(
  event: string,
  handler: EventCallback<T>,
): Promise<() => void> {
  (listeners[event] ??= []).push(handler);
  return () => {
    listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
  };
}

const byDir = (dir: string) => recs.find((r) => r.dir === dir);

export async function mockInvoke<T>(
  cmd: string,
  args: Record<string, any> = {},
): Promise<T> {
  await new Promise((r) => setTimeout(r, 60));
  const out = (v: unknown) => v as T;
  switch (cmd) {
    case "list_workspaces":
      return out(workspaces);
    case "create_workspace": {
      const id = String(args.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const ws = {
        id,
        name: args.name,
        created: now,
        description: "",
        links: [],
        runtime_command: "",
      };
      workspaces.push(ws);
      return out(ws);
    }
    case "update_workspace": {
      const w = workspaces.find((x) => x.id === args.id)!;
      Object.assign(w, {
        name: args.name,
        description: args.description,
        links: args.links,
        runtime_command: args.runtimeCommand,
      });
      return out(w);
    }
    case "open_path":
      return out(null);
    case "create_brief": {
      const r: Rec = {
        dir: `/mock/${recs.length + 1}`,
        id: String(recs.length + 1),
        created: now,
        title: args.title,
        person: args.person,
        workspace: args.workspace,
        thread: args.thread ?? "",
        duration_secs: 0,
        segments: [],
        notes: args.notes || "—",
        actions: null,
      };
      recs.unshift(r);
      return out(r.dir);
    }
    case "list_recordings":
      return out(
        recs.map((r) => ({
          dir: r.dir,
          id: r.id,
          created: r.created,
          title: r.title,
          person: r.person,
          workspace: r.workspace,
          thread: r.thread ?? "",
          has_transcript: r.segments.length > 0,
          has_notes: !!r.notes,
          has_audio: r.segments.length > 0 || r.duration_secs > 0,
          duration_secs: r.duration_secs,
        })),
      );
    case "load_recording": {
      const r = byDir(args.dir)!;
      return out({
        dir: r.dir,
        title: r.title,
        person: r.person,
        workspace: r.workspace,
        thread: r.thread ?? "",
        segments: r.segments,
        notes: r.notes,
      });
    }
    case "set_recording_thread":
      byDir(args.dir)!.thread = args.thread;
      return out(null);
    case "list_threads":
      // a fresh list each time, like the real IPC, so memos see the change
      return out(threads.map((t) => ({ ...t })));
    case "create_thread": {
      const t: Thread = {
        id: `${args.workspace}-${String(args.title).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        workspace: args.workspace,
        title: args.title,
        summary: args.summary ?? "",
        status: args.status ?? "active",
        owner: args.owner ?? "",
        created: now,
        updated: now,
      };
      threads.push(t);
      return out(t);
    }
    case "update_thread": {
      const t = threads.find((x) => x.id === args.id)!;
      Object.assign(t, {
        title: args.title,
        summary: args.summary,
        status: args.status,
        owner: args.owner,
        updated: now,
      });
      return out(t);
    }
    case "delete_thread": {
      const i = threads.findIndex((x) => x.id === args.id);
      if (i >= 0) threads.splice(i, 1);
      return out(null);
    }
    case "list_questions":
      return out(
        recs.flatMap((r) =>
          (r.actions?.questions ?? []).map((q) => ({
            dir: r.dir,
            meeting_title: r.title,
            meeting_created: r.created,
            workspace: r.workspace,
            thread: r.thread ?? "",
            text: q,
          })),
        ),
      );
    case "load_actions":
      return out(byDir(args.dir)?.actions ?? null);
    case "set_recording_title":
      byDir(args.dir)!.title = args.title;
      return out(null);
    case "set_recording_person":
      byDir(args.dir)!.person = args.person;
      return out(null);
    case "set_recording_workspace":
      byDir(args.dir)!.workspace = args.workspace || "personal";
      return out(null);
    case "set_action_done": {
      const a = byDir(args.dir)?.actions?.actions.find((x) => x.id === args.id);
      if (a) a.done = args.done;
      return out(null);
    }
    case "set_action_parked": {
      const a = byDir(args.dir)?.actions?.actions.find((x) => x.id === args.id);
      if (a) a.parked = args.parked;
      return out(null);
    }
    case "set_decision_status": {
      const d = byDir(args.dir)?.actions?.decisions.find(
        (x) => x.id === args.id,
      );
      if (d) d.status = args.status;
      return out(null);
    }
    case "list_open_actions":
      return out(
        recs.flatMap((r) =>
          (r.actions?.actions ?? [])
            .filter((a) => !a.done)
            .map((a) => ({
              dir: r.dir,
              meeting_title: r.title,
              meeting_created: r.created,
              person: r.person,
              workspace: r.workspace,
              thread: r.thread ?? "",
              action: a,
            })),
        ),
      );
    case "list_decisions":
      return out(
        recs.flatMap((r) =>
          (r.actions?.decisions ?? []).map((d) => ({
            dir: r.dir,
            meeting_title: r.title,
            meeting_created: r.created,
            person: r.person,
            workspace: r.workspace,
            thread: r.thread ?? "",
            decision: d,
          })),
        ),
      );
    case "list_people": {
      const rows: Record<string, any> = {};
      for (const [name, c] of Object.entries(contacts))
        rows[name] = {
          name,
          ...c,
          meetings: 0,
          last_met: 0,
          open_actions: 0,
          workspaces: [],
        };
      for (const r of recs) {
        if (!r.person) continue;
        const row = (rows[r.person] ??= {
          name: r.person,
          phone: "",
          email: "",
          org: "",
          role: "",
          aliases: [],
          meetings: 0,
          last_met: 0,
          open_actions: 0,
          workspaces: [],
        });
        row.meetings++;
        row.last_met = Math.max(row.last_met, r.created);
        row.open_actions += (r.actions?.actions ?? []).filter(
          (a) => !a.done,
        ).length;
        if (!row.workspaces.includes(r.workspace))
          row.workspaces.push(r.workspace);
      }
      return out(Object.values(rows).sort((a, b) => b.last_met - a.last_met));
    }
    case "save_person":
      contacts[args.name] = {
        phone: args.phone,
        email: args.email,
        org: args.org ?? "",
        role: args.role ?? "",
        aliases: args.aliases ?? [],
      };
      return out(null);
    case "capabilities":
      return out(
        FRESH
          ? {
              transcription: mockSignedIn,
              notes: mockSignedIn,
              talk: mockSignedIn,
              fast: mockSignedIn,
              user_name: "",
              language: "english",
              hosted: mockSignedIn,
              onboarded: false,
            }
          : {
              transcription: true,
              notes: true,
              talk: false,
              fast: true,
              user_name: "",
              language: "english",
              hosted: false,
              onboarded: true,
            },
      );
    case "hosted_sign_in":
      mockSignedIn = true;
      return out({ id: "acc_mock", name: args.name || "you" });
    case "hosted_sign_out":
      return out(null);
    case "set_onboarded":
      return out(null);
    case "read_ask": {
      // the browser stand-in for Jev: a keyword read so the chips can be seen
      await new Promise((r) => setTimeout(r, 250));
      const text = String(args.text ?? "").toLowerCase();
      const intent = /\b(write|draft|update|message|note|agenda|email|brief)\b/.test(text)
        ? "write"
        : /\b(nudge|remind|chase|follow up)\b/.test(text)
          ? "nudge"
          : /\b(park|done|confirm|move|file|close)\b/.test(text)
            ? "do"
            : /\b(where|what|status|catch|how are|update on)\b/.test(text)
              ? "catch_up"
              : "question";
      const ws = (args.workspaces as { id: string; name: string }[]).find((w) =>
        text.includes(w.name.toLowerCase()),
      );
      const th = (args.threads as { id: string; workspace: string; title: string }[]).find((t) =>
        t.title
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.length > 3 && text.includes(w)),
      );
      return out({
        intent,
        intent_confidence: 0.9,
        workspace: ws?.id ?? th?.workspace ?? "",
        workspace_confidence: ws || th ? 0.95 : 0,
        thread: th?.id ?? "",
        thread_confidence: th ? 0.8 : 0,
        outside: /\b(calendar|email|send|book)\b/.test(text) ? 0.8 : 0.1,
        hand: /\bops\b/.test(text)
          ? ((args.routes as { id: string }[]) ?? [])[0]?.id ?? ""
          : "",
        hand_confidence: /\bops\b/.test(text) ? 0.95 : 0.9,
        model: "mock",
        ms: 250,
      });
    }
    case "compose":
      return out(
        `Mock draft for: ${args.instruction}\n\nHey — quick update. Everything on track, demo Thursday. Shout if you need anything before then.`,
      );
    case "get_settings":
      return out(settings);
    case "save_settings":
      settings = args.settings;
      return out(null);
    case "agent_available": {
      const w = workspaces.find((x) => x.id === args.workspace);
      return out(
        !!w?.runtime_command.trim() || settings.agent_command.trim().length > 0,
      );
    }
    case "start_recording":
      levelTimer = window.setInterval(() => {
        emit("capture-event", {
          event: "level",
          track: "mic",
          peak: Math.random() * 0.25,
        });
        emit("capture-event", {
          event: "level",
          track: "system",
          peak: Math.random() * 0.18,
        });
      }, 200);
      return out(null);
    case "stop_recording": {
      if (levelTimer) window.clearInterval(levelTimer);
      const r: Rec = {
        dir: `/mock/${recs.length + 1}`,
        id: String(recs.length + 1),
        created: now,
        title: "",
        person: "",
        workspace: "personal",
        duration_secs: 95,
        segments: [
          { speaker: "me", start: 0, text: "تجربة تسجيل سريعة." },
          { speaker: "them", start: 3, text: "Sounds good." },
        ],
        notes: null,
        actions: null,
      };
      recs.unshift(r);
      return out(r.dir);
    }
    case "transcribe":
      return out(byDir(args.dir)?.segments ?? []);
    case "generate_notes": {
      const r = byDir(args.dir)!;
      r.notes =
        "## Summary\n- A quick test recording.\n\n## Decisions\n—\n\n## Actions\n—";
      return out(r.notes);
    }
    case "extract_actions": {
      const r = byDir(args.dir)!;
      if (FRESH) {
        r.actions = {
          decisions: [dec(1, "Shoot moves to Wednesday", "proposed")],
          actions: [
            act(1, "Send the recap", "me", "today", iso(now)),
            act(2, "Share the brand guidelines", "Rana", "tomorrow", iso(now + day)),
          ],
          questions: ["Who signs off on posts on their side?"],
        };
        return out(r.actions);
      }
      r.actions = {
        decisions: [dec(1, "Use Za3tar for every meeting")],
        actions: [act(1, "Send the meeting summary", "me", "today", iso(now))],
        questions: [],
      };
      return out(r.actions);
    }
    case "draft_followup":
      return out({
        subject: args.kind === "email" ? "ملخص اجتماعنا" : null,
        body: "هلا، شكراً على وقتك اليوم. باختصار اتفقنا على:\n- نبدأ بفندق العقبة\n- الـ brand guidelines بتوصلنا بكرا\nبخبرك أول ما تجهز الخطة 🙌",
      });
    case "draft_nudge":
      return out({
        subject: null,
        body: "هلا يوسف، بس بحب أتأكد من صور الـ menu من اجتماعنا، إذا بدك إشي مني قلي.",
      });
    case "export_calendar":
      return out("/mock/actions.ics");
    case "open_external":
      return out(null);
    case "send_to_agent": {
      const msg = String(args.message);
      if (msg.startsWith("ZA3TAR_PACKET")) {
        const p = JSON.parse(msg.slice(msg.indexOf("{")));
        const acts: { id: string; due: string }[] = p.actions ?? [];
        return out(
          `ZA3TAR_ACK v1\n${JSON.stringify({
            ok: true,
            // filing only (schedule: false) puts nothing on the calendar
            events_created:
              p.schedule === false
                ? []
                : acts
                    .filter((a) => a.due)
                    .map((a) => ({ action_id: a.id, title: "…", when: a.due })),
            followups_tracked: acts.map((a) => a.id),
            person: p.meeting?.person?.name ? "updated" : "none",
            warnings: [],
            ...(p.thread
              ? {
                  admin: {
                    project: p.thread.title,
                    proposals: (p.decisions?.length ?? 0) + acts.length,
                  },
                }
              : {}),
          })}`,
        );
      }
      if (msg.includes('"type":"today"'))
        return out(
          'ZA3TAR_SCHEDULE v1\n{"date":"' +
            iso(now) +
            '","events":[{"start":"10:00","end":"10:45","title":"Bayt Hotels kickoff","attendees":["Rana"]},{"start":"15:30","end":"16:00","title":"Noor Coffee check-in","attendees":["Yousef"]}]}',
        );
      if (msg.includes('"type":"followups"'))
        return out(
          'ZA3TAR_STATUS v1\n{"followups":[{"id":"2#a1","status":"nudged","note":"sent yesterday","updated_at":""}]}',
        );
      return out("done — delivered on WhatsApp");
    }
    case "live_session_create":
      throw new Error("Talk needs the real app (WebRTC + your key)");
    case "live_turn": {
      const t = String(args.transcript || "").toLowerCase();
      if (/\b(write|draft|prepare|put together)\b/.test(t))
        return out({
          say: "Writing that now — it will open in a draft you can edit.",
          ops: [
            {
              op: "write",
              title: "Update",
              instruction: String(args.transcript || "").slice(-300),
            },
          ],
        });
      if (/mode: onboarding/i.test(String(args.snapshot || "")))
        return out({
          say: "Got it — set those up. Anything else, or shall we look at what I made?",
          ops: [
            { op: "create_workspace", name: "Noor Coffee", description: "client work" },
            {
              op: "create_thread",
              workspace: "noor-coffee",
              title: "Second branch launch",
              summary: "Opens on the 28th. Launch posts approved, menu photos late.",
              owner: "me",
            },
            {
              op: "create_thread",
              workspace: "personal",
              title: "New business",
              summary: "Two enquiries this week. Proposals not started.",
              owner: "me",
            },
          ],
        });
      if (/\bwhere are we\b|\bcatch me up\b/.test(t))
        return out({
          say: "Noor Coffee opens its second branch on the 28th and the menu photos are late. Sama Skincare owes a yes on the December plan. Bayt Hotels kicked off this morning.",
          ops: [],
        });
      return out({ say: "mock brain: heard you.", ops: [] });
    }
    case "live_attach":
    case "live_send":
    case "live_detach":
      return out(null);
    case "list_routes":
      if (FRESH) return out([]);
      return out([
        {
          id: "ops",
          label: "Assistant",
          description: "an always-on assistant on a server (demo)",
          kind: "acp",
          command: "mock",
          cwd: "",
          live: "mock",
          enabled: true,
        },
      ]);
    case "save_routes":
      return out(null);
    case "acp_start":
      setTimeout(() => emit("acp-event", { route: args.route, kind: "status", status: "ready" }), 300);
      return out("mock-session");
    case "acp_prompt": {
      const r = args.route;
      if (String(args.text).includes("ZA3TAR_TIDY")) {
        // tidy up: a verdict per item, cycling through the kinds
        const q = JSON.parse(String(args.text).split("ZA3TAR_QUERY v1\n").pop() || "{}");
        const kinds = [
          { verdict: "done", why: "The posts went out on Thursday; the group thanked you after.", evidence: "WhatsApp with Yousef, Thu", next: null, can_do: false },
          { verdict: "drop", why: "The shoot moved, so this step no longer applies.", evidence: "Noor Coffee check-in note", next: null, can_do: false },
          { verdict: "keep", why: "Still open: nothing sent yet.", evidence: "No reply in the thread", next: "Send Hala the December plan for sign-off", can_do: true },
          { verdict: "unsure", why: "No later trace of this anywhere.", evidence: null, next: null, can_do: false },
        ];
        emit("acp-event", { route: r, kind: "status", status: "working" });
        await new Promise((res) => setTimeout(res, 1200));
        emit("acp-event", { route: r, kind: "status", status: "ready" });
        const verdicts = (q.items ?? []).map((it: { id: string }, i: number) => ({ id: it.id, confidence: "high", ...kinds[i % kinds.length] }));
        return out({ stopReason: "end_turn", text: "ZA3TAR_TIDY v1\n" + JSON.stringify({ verdicts }) });
      }
      if (String(args.text).includes("where-it-stands")) {
        // the thread-line refresh: answer with one moved line
        emit("acp-event", { route: r, kind: "status", status: "working" });
        await new Promise((res) => setTimeout(res, 600));
        emit("acp-event", { route: r, kind: "status", status: "ready" });
        const first = threads.find((t) => t.status === "active");
        const text = first
          ? JSON.stringify({ [first.id]: `${first.summary} Their manager asked to move the shoot.`.trim() })
          : "{}";
        return out({ stopReason: "end_turn", text });
      }
      emit("acp-event", { route: r, kind: "status", status: "working" });
      setTimeout(() => emit("acp-event", { route: r, kind: "update", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "read: notes/status.md", kind: "read", status: "in_progress" } }), 200);
      setTimeout(() => emit("acp-event", { route: r, kind: "update", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } }), 700);
      setTimeout(() => emit("acp-event", { route: r, kind: "update", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Read it. Nothing has moved since yesterday." } } }), 900);
      await new Promise((res) => setTimeout(res, 1100));
      emit("acp-event", { route: r, kind: "status", status: "ready" });
      return out({ stopReason: "end_turn", text: "Read it. Nothing has moved since yesterday." });
    }
    case "acp_permission":
    case "acp_cancel":
    case "acp_stop":
      return out(null);
    case "open_system_audio_settings":
      return out(null);
    case "feed_start": {
      // connect, then one thing moves a few seconds later
      const r = args.route;
      setTimeout(() => emit("feed-event", { route: r, kind: "status", status: "live" }), 500);
      setTimeout(() => {
        feedMoved = true;
        emit("feed-event", { route: r, kind: "event", event: "sessions.changed" });
      }, 4000);
      return out(null);
    }
    case "feed_stop":
      return out(null);
    case "feed_get": {
      const now = Date.now() / 1000;
      // the WhatsApp line is always there; a few seconds in it becomes the one moving now
      const s = [
        { id: "m1", title: "Noor Coffee: moving the shoot", preview: "", source: "whatsapp", is_active: feedMoved, last_active: feedMoved ? now - 5 : now - 12 * 60, message_count: 5 },
        { id: "m2", title: "Bayt Hotels: kickoff recap", preview: "", source: "slack", is_active: false, last_active: now - 40 * 60, message_count: 6 },
        { id: "m3", title: "Morning brief to the team", preview: "", source: "cron", is_active: false, last_active: now - 3 * 3600, message_count: 2 },
      ];
      return out({ sessions: s });
    }
    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
