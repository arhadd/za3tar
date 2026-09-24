// /api/live — mints a gpt-live-1 voice session for the browser's WebRTC offer.
// Same handshake as the Mac app's Talk (src-tauri/src/live.rs), minus client
// delegation: on the web the model answers for itself. The key never leaves here.
import { guard, envInt } from "./_guard.js";

export const config = { maxDuration: 30 };

// each call starts a paid voice session: per IP a few an hour, plus a per-instance ceiling
const LIMIT_PER_HOUR = envInt("LIVE_LIMIT_PER_HOUR", 3);
const GLOBAL_HOURLY = envInt("LIVE_GLOBAL_PER_HOUR", 40);
const MODEL = "gpt-live-1";
const VOICE = "marin";

function instructions(ctx) {
  const f = (k, n = 80) => (ctx && typeof ctx[k] === "string" ? ctx[k].slice(0, n).replace(/[\r\n]+/g, " ") : "");
  const systems = ctx && Array.isArray(ctx.systems) ? ctx.systems.slice(0, 12).map(x => String(x).slice(0, 30)).join(", ") : "";
  const who = f("name") ? `You are talking to ${f("name")}${f("role") ? ", " + f("role") : ""}${f("company") ? " at " + f("company") : ""}.` : "You do not know their name yet; ask it in passing.";
  const known = [
    f("what", 200) && `What the company does: ${f("what", 200)}.`,
    f("size", 20) && `Team size: ${f("size", 20)}.`,
    systems && `Systems they already use: ${systems}.`,
    f("ai", 120) && `How they use AI today, in their words: ${f("ai", 120)}.`,
  ].filter(Boolean).join(" ");
  return `You are Za3tar, on za3tar.ai, in a short voice conversation about someone's business. ${who} ${known}

Your goal: understand how one thing this business delivers actually moves, where it breaks, and how the company uses AI today. At the end you give an honest read of where they are with AI and what to look at first. A page on their screen fills in as you talk, from what they say.

How you talk: like a sharp, warm operator, not a form. Short turns, one question at a time, then listen. English by default; Arabic if they speak Arabic; mix if they mix. Greet them by name in one sentence and go straight to a question about their business, using what you already know. Never re-ask something on the form or already said. If they interrupt, joke, or say who they are, respond to that like a person would, then carry on.

Things to learn, in whatever order the conversation takes you (skip what you know):
- The main thing they deliver, step by step, and where it gets stuck or slow.
- Where something enters (an order, an enquiry, an invoice), and where it goes next.
- Where people enter or check the same thing twice.
- Who approves what; what should never be decided automatically.
- AI today: what tools, who uses them, for what, and what they tried that fizzled. Ask this plainly: "How is the team using AI right now, if at all?"

Rules:
- Only reflect what they said. Never invent people, systems, numbers or problems.
- Never sell: no pricing, no promises about what za3tar will build, no timelines.
- Never ask for credentials, customer data, or anything sensitive.
- Avoid these words: leverage, empower, transform, seamless, unlock, journey, harness, supercharge.
- After four or five exchanges, or when they say they are done: say you have what you need, that the assessment is now on their page, and that the next step is a session with a person, booked from the button on the page. Then stop and wait.
- If you are told time is up, wrap up in one sentence.`;
}

export default async function handler(req, res) {
  const ok = guard(req, res, {
    name: "live",
    perIp: { limit: LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000 },
    globalHourly: GLOBAL_HOURLY,
  });
  if (!ok) return;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "voice is not configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const sdp = typeof body?.sdp === "string" ? body.sdp : "";
  const ctx = body?.context && typeof body.context === "object" ? body.context : null;
  if (!sdp.startsWith("v=0") || sdp.length > 60000) return res.status(400).json({ error: "invalid offer" });

  try {
    const r = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        session: {
          model: MODEL,
          store: false,
          instructions: instructions(ctx),
          audio: { output: { voice: VOICE } },
        },
        transport: { type: "webrtc", sdp },
      }),
    });
    const v = await r.json().catch(() => ({}));
    if (!r.ok) {
      // keep provider detail in the function log, not in the visitor's browser
      console.error("live: session start failed", r.status, v?.error?.type || v?.error?.code || "");
      return res.status(502).json({ error: r.status === 429 ? "Busy right now. Try again in a minute." : "The voice service could not start. Try again." });
    }
    return res.status(200).json({ session: { id: v?.session?.id || null }, transport: { sdp: v?.transport?.sdp || "" } });
  } catch {
    return res.status(502).json({ error: "voice service unreachable" });
  }
}
