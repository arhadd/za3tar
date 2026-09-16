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
  Workspace,
} from "./types";

type Rec = {
  dir: string;
  id: string;
  created: number;
  title: string;
  person: string;
  workspace: string;
  duration_secs: number;
  segments: Segment[];
  notes: string | null;
  actions: MeetingActions | null;
};

const now = Math.floor(Date.now() / 1000);
const day = 86400;
const iso = (d: number) => new Date(d * 1000).toISOString().slice(0, 10);

const workspaces: Workspace[] = [
  { id: "personal", name: "Personal", created: 0 },
  { id: "madar", name: "Madar", created: now - 20 * day },
  { id: "house", name: "The House", created: now - 9 * day },
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
});

const recs: Rec[] = [
  {
    dir: "/mock/1",
    id: "1",
    created: now - 2 * 3600,
    title: "Madar — onboarding kickoff",
    person: "Lina",
    workspace: "madar",
    duration_secs: 41 * 60 + 12,
    segments: [
      {
        speaker: "me",
        start: 0.2,
        text: "طيب خلينا نبدأ بالـ onboarding flow، وين واقفين؟",
      },
      {
        speaker: "them",
        start: 6.1,
        text: "الـ design جاهز، بس الـ backend لسا ما ربطنا الـ Stripe.",
      },
      {
        speaker: "me",
        start: 12.4,
        text: "تمام، بنخلص الربط هالأسبوع وبنعمل demo يوم الخميس.",
      },
      {
        speaker: "them",
        start: 18.0,
        text: "Perfect. بدنا كمان نقرر إذا بنطلق بالعربي بس ولا bilingual.",
      },
      { speaker: "me", start: 24.6, text: "Bilingual من أول يوم، خلص قررنا." },
    ],
    notes:
      "## الملخص\n- مراجعة الـ onboarding flow لـ Madar: الـ design جاهز، الربط مع Stripe لسا.\n- الاتفاق على demo يوم الخميس بعد إنهاء الربط.\n\n## القرارات\n- الإطلاق bilingual من اليوم الأول.\n\n## المهام\n- **Ala:** ربط Stripe وتجهيز الـ demo.\n- **Lina:** إرسال الـ copy النهائي للـ onboarding.",
    actions: {
      decisions: [
        dec(1, "الإطلاق bilingual من اليوم الأول", "confirmed"),
        dec(2, "الـ demo يوم الخميس"),
      ],
      actions: [
        act(1, "ربط Stripe بالـ backend", "me", "هالأسبوع", iso(now + 3 * day)),
        act(
          2,
          "إرسال الـ copy النهائي للـ onboarding",
          "Lina",
          "بكرا",
          iso(now + day),
        ),
        act(3, "تجهيز الـ demo", "me", "الخميس", iso(now + 2 * day)),
      ],
      questions: ["مين بيدفع رسوم Stripe بالمرحلة الأولى؟"],
    },
  },
  {
    dir: "/mock/2",
    id: "2",
    created: now - 3 * day,
    title: "Madar — pricing follow-up",
    person: "Lina",
    workspace: "madar",
    duration_secs: 18 * 60 + 5,
    segments: [
      { speaker: "me", start: 0, text: "خلينا نراجع الـ pricing tiers." },
    ],
    notes:
      "## الملخص\n- مراجعة الـ pricing tiers الثلاثة.\n\n## القرارات\n- Tier واحد مجاني بدون بطاقة.",
    actions: {
      decisions: [
        dec(1, "Tier مجاني بدون بطاقة", "confirmed"),
        dec(2, "السعر بالدولار مش بالدينار", "superseded"),
      ],
      actions: [
        act(1, "نشر صفحة الأسعار", "Lina", "الأسبوع الجاي", iso(now - day)),
      ],
      questions: [],
    },
  },
  {
    dir: "/mock/3",
    id: "3",
    created: now - 5 * day,
    title: "The House — contractor walkthrough",
    person: "Samer",
    workspace: "house",
    duration_secs: 52 * 60,
    segments: [
      {
        speaker: "voice1",
        start: 0,
        text: "الجدار الشمالي بده عزل قبل الشتا.",
      },
    ],
    notes:
      "## الملخص\n- جولة مع Samer على الموقع: العزل قبل الشتا.\n\n## المهام\n- **Samer:** عرض سعر للعزل.",
    actions: {
      decisions: [dec(1, "العزل قبل أي شغل داخلي")],
      actions: [
        act(1, "عرض سعر للعزل", "Samer", "خلال يومين", iso(now - 3 * day)),
      ],
      questions: ["هل الرخصة بتغطي التوسعة؟"],
    },
  },
  {
    dir: "/mock/4",
    id: "4",
    created: now - 8 * day,
    title: "coffee with Dana",
    person: "Dana",
    workspace: "personal",
    duration_secs: 27 * 60,
    segments: [],
    notes: null,
    actions: null,
  },
];

const contacts: Record<
  string,
  { phone: string; email: string; org: string; role: string; aliases: string[] }
> = {
  Lina: {
    phone: "+962 79 000 0000",
    email: "lina@madar.example",
    org: "Madar",
    role: "Product lead",
    aliases: ["لينا"],
  },
  Samer: {
    phone: "+962 77 000 0000",
    email: "",
    org: "Samer & Sons",
    role: "Contractor",
    aliases: [],
  },
};

let settings: Settings = {
  elevenlabs_api_key: "",
  anthropic_api_key: "",
  user_name: "Ala",
  agent_name: "",
  agent_command: "~/bin/za3tar-runtime",
};

let recording = false;
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
      const ws = { id, name: args.name, created: now };
      workspaces.push(ws);
      return out(ws);
    }
    case "rename_workspace":
      return out(null);
    case "list_recordings":
      return out(
        recs.map((r) => ({
          dir: r.dir,
          id: r.id,
          created: r.created,
          title: r.title,
          person: r.person,
          workspace: r.workspace,
          has_transcript: r.segments.length > 0,
          has_notes: !!r.notes,
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
        segments: r.segments,
        notes: r.notes,
      });
    }
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
    case "get_settings":
      return out(settings);
    case "save_settings":
      settings = args.settings;
      return out(null);
    case "agent_available":
      return out(settings.agent_command.trim().length > 0);
    case "start_recording":
      recording = true;
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
      recording = false;
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
    case "is_recording":
      return out(recording);
    case "transcribe":
      return out(byDir(args.dir)?.segments ?? []);
    case "generate_notes": {
      const r = byDir(args.dir)!;
      r.notes =
        "## الملخص\n- تجربة تسجيل سريعة.\n\n## القرارات\n—\n\n## المهام\n—";
      return out(r.notes);
    }
    case "extract_actions": {
      const r = byDir(args.dir)!;
      r.actions = {
        decisions: [dec(1, "نستخدم Za3tar لكل الاجتماعات")],
        actions: [act(1, "إرسال ملخص الاجتماع", "me", "اليوم", iso(now))],
        questions: [],
      };
      return out(r.actions);
    }
    case "draft_followup":
      return out({
        subject: args.kind === "email" ? "ملخص اجتماعنا" : null,
        body: "هلا، شكراً على وقتك اليوم. باختصار اتفقنا على:\n- ربط Stripe هالأسبوع\n- demo يوم الخميس\nبخبرك أول ما يجهز 🙌",
      });
    case "draft_nudge":
      return out({
        subject: null,
        body: "هلا، بس بحب أتأكد من عرض السعر للعزل من اجتماعنا، إذا بدك إشي مني قلي.",
      });
    case "export_calendar":
      return out("/mock/actions.ics");
    case "open_external":
      return out(null);
    case "send_to_agent": {
      const msg = String(args.message);
      if (msg.startsWith("ZA3TAR_PACKET"))
        return out(
          'ZA3TAR_ACK v1\n{"ok":true,"events_created":[{"action_id":"1#a1","title":"ربط Stripe","when":"' +
            iso(now + 3 * day) +
            '"}],"followups_tracked":["1#a1","1#a2","1#a3"],"person":"Lina","warnings":[]}',
        );
      if (msg.includes('"type":"today"'))
        return out(
          'ZA3TAR_SCHEDULE v1\n{"date":"' +
            iso(now) +
            '","events":[{"start":"10:00","end":"10:45","title":"Madar weekly","attendees":["Lina"]},{"start":"15:30","end":"16:00","title":"مقابلة مع Samer","attendees":["Samer"]}]}',
        );
      if (msg.includes('"type":"followups"'))
        return out(
          'ZA3TAR_STATUS v1\n{"followups":[{"id":"2#a1","status":"nudged","note":"sent yesterday","updated_at":""}]}',
        );
      return out("done — delivered on WhatsApp");
    }
    case "open_system_audio_settings":
      return out(null);
    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
