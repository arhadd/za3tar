// Shapes shared between the Rust commands and the views. Field names mirror
// the serde structs in src-tauri/src/*.rs.

export type Level = { peak: number; seconds: number };
export type Segment = { speaker: string; start: number; text: string };
export type Phase = "idle" | "recording" | "processing" | "done";

export type Link = { kind: string; label: string; target: string };
export type Workspace = {
  id: string;
  name: string;
  created: number;
  description: string;
  links: Link[];
  runtime_command: string;
};

export type ThreadStatus = "active" | "parked" | "done";
export type Thread = {
  id: string;
  workspace: string;
  title: string;
  summary: string;
  status: ThreadStatus;
  owner: string;
  created: number;
  updated: number;
};

export type Summary = {
  dir: string;
  id: string;
  created: number;
  title: string;
  person: string;
  workspace: string;
  thread: string;
  has_transcript: boolean;
  has_notes: boolean;
  has_audio: boolean;
  duration_secs: number;
};

export type PersonRow = {
  name: string;
  phone: string;
  email: string;
  org: string;
  role: string;
  aliases: string[];
  meetings: number;
  last_met: number;
  open_actions: number;
  workspaces: string[];
};

export type ActionItem = {
  id: number;
  title: string;
  owner: string;
  due_label?: string | null;
  due_date?: string | null;
  detail?: string | null;
  done: boolean;
  parked: boolean;
};

export type DecisionStatus = "proposed" | "confirmed" | "superseded";
export type Decision = {
  id: number;
  text: string;
  status: DecisionStatus;
  note: string;
};

export type MeetingActions = {
  decisions: Decision[];
  actions: ActionItem[];
  questions: string[];
};

export type DraftKind = "whatsapp" | "email";
export type Draft = {
  kind: DraftKind;
  subject: string;
  body: string;
  target: string;
};

export type OpenAction = {
  dir: string;
  meeting_title: string;
  meeting_created: number;
  person: string;
  workspace: string;
  thread: string;
  action: ActionItem;
};

export type DecisionRef = {
  dir: string;
  meeting_title: string;
  meeting_created: number;
  person: string;
  workspace: string;
  thread: string;
  decision: Decision;
};

export type QuestionRef = {
  dir: string;
  meeting_title: string;
  meeting_created: number;
  workspace: string;
  thread: string;
  text: string;
};

export type Settings = {
  elevenlabs_api_key: string;
  anthropic_api_key: string;
  user_name: string;
  agent_name: string;
  agent_command: string;
};

// runtime envelopes — docs/AGENT-PROTOCOL.md. The runtime is whatever does
// Za3tar's work outside the app; the user never addresses it by name.
export type RuntimeAck = {
  ok: boolean;
  events_created: { action_id: string; title: string; when: string }[];
  followups_tracked: string[];
  person: string;
  warnings: string[];
};
export type RuntimeEvent = {
  start: string;
  end: string;
  title: string;
  attendees: string[];
};
export type RuntimeSchedule = {
  date: string;
  events: RuntimeEvent[];
  error?: string;
};
export type RuntimeFollowupStatus = {
  id: string;
  status: string;
  note: string;
  updated_at: string;
};

export type View =
  | "overview"
  | "threads"
  | "meetings"
  | "people"
  | "decisions"
  | "followups";
