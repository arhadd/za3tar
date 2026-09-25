// /api/try — the za3tar discovery conversation. One call per turn:
// transcript so far -> next question + the company page as structured JSON.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { guard, envInt } from "./_guard.js";

export const config = { maxDuration: 60 };

const client = new Anthropic();

// Caps sit just above what the real front-ends send:
// - typed (/try, modes turn + assess): the page stops input at 7 user turns;
//   assistant turns are its own opener and model replies (two short sentences + a question).
// - voice (/talk, modes page + assess): a 4-minute spoken conversation, merged per speaker.
const TYPED = { turns: 7, chars: 7000, userLen: 1500, assistantLen: 1000 };
const VOICE = { turns: 40, chars: 12000, userLen: 1500, assistantLen: 1500 };
const MAX_TOKENS = { turn: 3500, page: 3500, assess: 5000, finish: 5000 };

// per IP: typed turns + assessments share one budget; /talk's background page
// refreshes get their own so a long voice session cannot starve its assessment.
const LIMIT_WINDOW = 10 * 60 * 1000;
const LIMIT_TRY = envInt("TRY_LIMIT_PER_10MIN", 20);
const LIMIT_PAGE = envInt("TRY_PAGE_LIMIT_PER_10MIN", 30);
const GLOBAL_HOURLY = envInt("TRY_GLOBAL_PER_HOUR", 400); // per warm instance

const Page = z.object({
  company: z.object({
    name: z.string().nullable(),
    what: z.string().nullable(),
    locations: z.array(z.string()),
  }),
  people: z.array(z.object({ name: z.string(), role: z.string() })),
  systems: z.array(z.string()),
  workflows: z.array(z.object({
    name: z.string(),
    owner: z.string().nullable(),
    systems: z.array(z.string()),
    breaks_at: z.string().nullable(),
    approval: z.string().nullable(),
  })),
  sources_of_truth: z.array(z.object({ question: z.string(), system: z.string() })),
  never_automatic: z.array(z.string()),
  open_questions: z.array(z.string()),
  ai_use: z.object({
    tools: z.array(z.string()),
    used_for: z.array(z.string()),
    who: z.string().nullable(),
    tried_and_stalled: z.array(z.string()),
  }),
});

const PageOnly = z.object({ page: Page });

const Assess = z.object({
  level: z.enum(["not started", "a few people", "team workflows", "agents at work"]),
  headline: z.string(),
  working: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendations: z.array(z.object({
    kind: z.enum(["learn", "connect", "build", "teach"]),
    title: z.string(),
    why: z.string(),
    first_step: z.string(),
  })),
  page: Page,
});

const Turn = z.object({
  reply: z.string(),
  page: Page,
  enough: z.boolean(),
});

const Finish = z.object({
  summary: z.string(),
  suggestions: z.array(z.object({
    kind: z.enum(["learn", "connect", "build", "teach"]),
    title: z.string(),
    why: z.string(),
    first_step: z.string(),
  })),
  page: Page,
});

const SYSTEM = `You are za3tar's discovery conversation, on za3tar.ai/try. A visitor describes their business; you ask what a good operator would ask, and you keep a structured page of what they said.

How you talk: plain, short, one question at a time. Curious, never salesy. Arabic or English, whichever they use; if they mix, mix. Keep Arabic exactly as spoken in the page, never translate it.

What you are after, roughly in this order (skip what they already covered):
1. What the business does, and who is involved.
2. Walk me through what happens today, step by step, for the main thing you sell or deliver.
3. When something enters the business (an order, an invoice, a request), which system does it hit first, and where does it go next?
4. Where are people entering or checking the same thing twice?
5. Which system wins when two disagree?
6. Who owns each step, who approves it?
7. What should never be decided or changed automatically?
8. How is the team using AI right now, if at all: which tools, who, for what, and what was tried that fizzled?

Hard rules:
- The page contains only what they said or clearly implied. Empty arrays are correct when they have not said. Never invent people, systems, numbers, or problems.
- ai_use: what AI tools they use today, for what, who uses them, and what they tried that stalled. Only from what they said.
- Never sell: no pricing, no promises of what za3tar will build, no timelines, no capability claims. You discover and reflect.
- Never ask for credentials, customer data, or anything sensitive. If they paste it, do not repeat it.
- "reply" is your next message: at most two short sentences, then one question. After enough is known (usually 4 to 6 answers), set enough=true and say you have enough to suggest where to start.
- Do not use these words: leverage, empower, transform, seamless, unlock, journey, harness, supercharge.`;

const FINISH = `Now finish. Write "summary": one plain sentence about this business as they described it. Then exactly three "suggestions", in the order you would do them, each tied to something they actually said:
- kind: learn = we would need to look closer at this first; connect = two systems they named should be joined; build = a small tool or agent for work nobody sells software for; teach = the team learns to do this differently.
- title: under eight words, plain.
- why: one sentence quoting or closely paraphrasing what they said that points at it.
- first_step: one concrete sentence, what would happen first. No pricing, no timelines, no promises.
Return the final page too.`;

const ASSESS = `Now assess how this business uses AI today, from what they said and from the context form. Be honest and specific; no flattery, no hype.
- level: "not started" (nothing in use), "a few people" (individuals use ChatGPT-type tools on their own), "team workflows" (AI is part of at least one shared workflow), "agents at work" (something runs on its own with review).
- headline: one plain sentence about where they are.
- working: up to three things that already work for them, in their words.
- gaps: up to three specific gaps, each tied to something they said (double entry, a system nobody joined, work stuck in one person's head).
- recommendations: exactly three, in order. kind = learn (look closer first) | connect (join two systems they named) | build (a small tool or agent for work nobody sells software for) | teach (the team learns to do this differently). title under eight words; why quotes or closely paraphrases them; first_step is one concrete sentence. No pricing, no timelines, no promises.
Return the final page too.`;

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const mode = ["finish", "page", "assess"].includes(body?.mode) ? body.mode : "turn";
  const ok = guard(req, res, {
    name: mode === "page" ? "try-page" : "try",
    globalName: "try",
    perIp: { limit: mode === "page" ? LIMIT_PAGE : LIMIT_TRY, windowMs: LIMIT_WINDOW },
    globalHourly: GLOBAL_HOURLY,
  });
  if (!ok) return;

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  const ctx = body?.context && typeof body.context === "object" ? body.context : null;
  if (!messages || !messages.length || messages.length > 200) return res.status(400).json({ error: "messages" });

  // voice transcripts (page / assess) have many short turns; the typed flow has few long ones.
  // /try's assessment is also mode "assess" but stays far inside the voice caps.
  const voice = mode === "page" || mode === "assess";
  const cap = voice ? VOICE : TYPED;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return res.status(400).json({ error: "messages" });
    let content = m.content.trim();
    if (!content) continue;
    // visitor text is truncated as before; an over-long "assistant" line did not come from us
    if (m.role === "assistant" && content.length > cap.assistantLen) return res.status(400).json({ error: "messages" });
    if (m.role === "user") content = content.slice(0, cap.userLen);
    const last = clean[clean.length - 1];
    if (last && last.role === m.role) {
      // typed UI always alternates; a run of same-role turns there is not from the page
      if (!voice) return res.status(400).json({ error: "messages" });
      // voice: one speaker kept talking across a dropped empty line
      last.content = (last.content + " " + content).slice(0, m.role === "assistant" ? cap.assistantLen : cap.userLen);
    } else clean.push({ role: m.role, content });
  }
  if (!clean.length) return res.status(400).json({ error: "messages" });
  const userTurns = clean.filter(m => m.role === "user").length;
  const chars = clean.reduce((n, m) => n + m.content.length, 0);
  if (userTurns > cap.turns || chars > cap.chars)
    return res.status(429).json({ error: "This conversation is long enough. Book a session to continue." });
  // the model's own lines never outnumber the visitor's by more than the opener
  if (clean.length - userTurns > userTurns + 1) return res.status(400).json({ error: "messages" });
  if (mode === "turn" && clean[clean.length - 1].role !== "user") return res.status(400).json({ error: "messages" });

  if (ctx) {
    const f = (k, n = 80) => (typeof ctx[k] === "string" ? ctx[k].slice(0, n) : "");
    const systems = Array.isArray(ctx.systems) ? ctx.systems.slice(0, 12).map(x => String(x).slice(0, 30)).join(", ") : "";
    clean.unshift({ role: "user", content: `Context from the form, before we spoke: name ${f("name")}; role ${f("role")}; company ${f("company")}; what it does: ${f("what", 200)}; team size ${f("size", 20)}; systems: ${systems || "none given"}; AI today: ${f("ai", 120)}.` });
  }
  if (clean[0].role !== "user") clean.unshift({ role: "user", content: "(starts)" });

  const convo = mode === "finish" ? [...clean, { role: "user", content: FINISH }]
    : mode === "assess" ? [...clean, { role: "user", content: ASSESS }]
    : mode === "page" ? [...clean, { role: "user", content: "Update the page from everything said so far. Return only the page." }]
    : clean;
  const schema = mode === "finish" ? Finish : mode === "assess" ? Assess : mode === "page" ? PageOnly : Turn;

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: MAX_TOKENS[mode],
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: convo,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
    });
    if (response.stop_reason === "refusal") return res.status(200).json({ error: "Let's keep it to how the business runs.", refusal: true });
    if (!response.parsed_output) return res.status(502).json({ error: "Could not read the page. Try once more." });
    return res.status(200).json(response.parsed_output);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Busy right now. Try again in a minute." });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: "The page builder hit an error. Try again." });
    return res.status(500).json({ error: "Something broke on our side." });
  }
}
