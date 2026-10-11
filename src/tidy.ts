// Tidy up with the assistant: send it the open to-dos on the user and get a
// verdict per item — done, drop, someone else's, keep (with the one next
// step) or unsure — with where it saw it. The instructions are the kit's own
// skill file, so the app and an assistant that installs the skill read the
// same contract. Read-only on the far side; the user applies verdicts here.
import skill from "../kit/skills/za3tar-tidy/SKILL.md?raw";
import { bridgeId, parseEnvelope } from "./format";
import type { OpenAction } from "./types";

export type TidyVerdict = {
  id: string;
  verdict: "done" | "drop" | "theirs" | "keep" | "confirm" | "unsure";
  confidence?: "high" | "medium" | "low";
  why: string;
  evidence?: string | null;
  next?: string | null;
  can_do?: boolean;
};

export type Tidy = { at: number; verdicts: Record<string, TidyVerdict> };

/** a few minutes of lookups on the far side; more than this is a second run */
export const MAX_ITEMS = 60;

const KEY = "za3tar.tidy";

export function loadTidy(): Tidy {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || "null");
    if (t && typeof t.at === "number" && t.verdicts) return t;
  } catch {
    // no storage, or an old shape: start clean
  }
  return { at: 0, verdicts: {} };
}

export function saveTidy(t: Tidy) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    // verdicts are a convenience; losing them only means asking again
  }
}

const instructions = skill.replace(/^---[\s\S]*?\n---\n/, "").trim();

export function tidyPrompt(
  items: OpenAction[],
  wsName: (id: string) => string,
): string {
  const day = (unix: number) =>
    new Date(unix * 1000).toISOString().slice(0, 10);
  const query = {
    type: "tidy",
    today: new Date().toISOString().slice(0, 10),
    items: items.map((oa) => ({
      id: bridgeId(oa.dir, oa.action.id),
      kind: "todo",
      text: oa.action.detail
        ? `${oa.action.title} (${oa.action.detail})`
        : oa.action.title,
      owner: "me",
      due: oa.action.due_date || null,
      meeting: oa.meeting_title || "(untitled)",
      met: day(oa.meeting_created),
      workspace: wsName(oa.workspace),
      person: oa.person || null,
    })),
  };
  return [
    "Za3tar (my workspace app on the Mac) asks you to tidy up my open to-dos.",
    "This is not a bridge packet: answer it yourself. Read-only: look things up, change nothing, send nothing.",
    "Follow the skill below and reply with ONLY the ZA3TAR_TIDY v1 envelope.",
    "",
    "=== SKILL ===",
    instructions,
    "=== END SKILL ===",
    "",
    "ZA3TAR_QUERY v1",
    JSON.stringify(query),
  ].join("\n");
}

export function parseTidy(reply: string): Record<string, TidyVerdict> {
  const { verdicts } = parseEnvelope<{ verdicts?: TidyVerdict[] }>(
    reply,
    "ZA3TAR_TIDY",
  );
  const out: Record<string, TidyVerdict> = {};
  for (const v of verdicts ?? []) {
    if (v && typeof v.id === "string" && typeof v.verdict === "string")
      out[v.id] = v;
  }
  return out;
}

/** the verdict as a word on the row */
export const verdictWord: Record<TidyVerdict["verdict"], string> = {
  done: "looks done",
  drop: "drop it",
  theirs: "not yours",
  keep: "keep",
  confirm: "stands",
  unsure: "no trace",
};
