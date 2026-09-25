// The Za3tar hosted proxy. One small service that lets an app sign in with an
// invite code and then use the providers through Za3tar's own keys, metered
// per account per month. Self-hosters run the same file with their keys.
//
//   node server.mjs            (PORT, DATA_DIR, keys and ADMIN_TOKEN from env)
//
// Storage is plain JSON under DATA_DIR: accounts.json, invites.json and
// usage/<YYYY-MM>.json. Tokens are stored hashed. Nothing about meeting
// content is kept: bodies pass through and are gone.

import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";

const PORT = Number(process.env.PORT || 8791);
const DATA = process.env.DATA_DIR || "./data";
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || "",
  elevenlabs: process.env.ELEVENLABS_API_KEY || "",
  openai: process.env.OPENAI_API_KEY || "",
  typesafe: process.env.TYPESAFE_API_KEY || "",
};
const ADMIN = process.env.ADMIN_TOKEN || "";
// Anthropic pass-through only serves what the app itself sends: these models,
// at most this many output tokens per request. Anything else is refused.
const ANTHROPIC_MODELS = new Set(
  (process.env.ANTHROPIC_MODELS || "claude-sonnet-5").split(",").map((s) => s.trim()).filter(Boolean),
);
const ANTHROPIC_MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS || 8192);
// invite redemption: attempts per IP per window
const REDEEM_LIMIT = Number(process.env.REDEEM_LIMIT || 10);
const REDEEM_WINDOW_MS = 15 * 60 * 1000;
// how long a minted live session may be attached to
const LIVE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CAPS = {
  anthropic_tokens: Number(process.env.CAP_ANTHROPIC_TOKENS || 2_000_000),
  asr_seconds: Number(process.env.CAP_ASR_SECONDS || 18_000), // 5 hours
  live_seconds: Number(process.env.CAP_LIVE_SECONDS || 3_600), // 1 hour
  typesafe_tokens: Number(process.env.CAP_TYPESAFE_TOKENS || 5_000_000), // ~$0.20
};

mkdirSync(join(DATA, "usage"), { recursive: true });

// ── tiny JSON store ────────────────────────────────────────────────────
function load(name, fallback) {
  const p = join(DATA, name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function save(name, value) {
  const p = join(DATA, name);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, p);
}
const month = () => new Date().toISOString().slice(0, 7);
const usageFile = () => `usage/${month()}.json`;
const sha = (s) => createHash("sha256").update(s).digest("hex");

function accounts() {
  return load("accounts.json", {});
}
function invites() {
  return load("invites.json", {});
}
function usageOf(id) {
  const u = load(usageFile(), {});
  return u[id] || { anthropic_tokens: 0, asr_seconds: 0, live_seconds: 0, requests: 0 };
}
function addUsage(id, patch) {
  const u = load(usageFile(), {});
  const cur = u[id] || { anthropic_tokens: 0, asr_seconds: 0, live_seconds: 0, requests: 0 };
  for (const [k, v] of Object.entries(patch)) cur[k] = (cur[k] || 0) + v;
  u[id] = cur;
  save(usageFile(), u);
  return cur;
}

// ── auth ───────────────────────────────────────────────────────────────
// The token travels in the Authorization header only — never the query
// string, where it would end up in access logs.
function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}
function accountFor(token) {
  if (!token) return null;
  const hash = sha(token);
  for (const [id, a] of Object.entries(accounts())) {
    if (a.revoked) continue;
    if (a.token_hash === hash) return { id, ...a };
  }
  return null;
}
function isAdmin(req) {
  if (!ADMIN) return false;
  const given = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const want = Buffer.from(ADMIN);
  // compare digests so the length check leaks nothing either
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(want).digest()) && given.length === want.length;
}

// in-memory, per IP: enough to make guessing invite codes pointless
const redeemHits = new Map(); // ip → [timestamps]
function redeemAllowed(ip) {
  const now = Date.now();
  const hits = (redeemHits.get(ip) || []).filter((t) => now - t < REDEEM_WINDOW_MS);
  hits.push(now);
  redeemHits.set(ip, hits);
  if (redeemHits.size > 10_000) {
    for (const [k, v] of redeemHits) if (!v.some((t) => now - t < REDEEM_WINDOW_MS)) redeemHits.delete(k);
  }
  return hits.length <= REDEEM_LIMIT;
}

// live session id → owning account, persisted so a restart does not orphan
// a running Talk session. Attach is refused for anything not in here.
function liveOwners() {
  const now = Date.now();
  const all = load("live-sessions.json", {});
  let dirty = false;
  for (const [sid, e] of Object.entries(all)) {
    if (!e || now - Date.parse(e.created) > LIVE_TTL_MS) {
      delete all[sid];
      dirty = true;
    }
  }
  if (dirty) save("live-sessions.json", all);
  return all;
}
function rememberLive(sid, accountId) {
  const all = liveOwners();
  all[sid] = { account: accountId, created: new Date().toISOString() };
  save("live-sessions.json", all);
}

// Seconds of audio in a WAV upload (raw or inside a multipart body), read
// from the RIFF header — what the provider bills on. null when not a WAV.
function wavSeconds(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const riff = buf.indexOf("RIFF");
  if (riff < 0 || buf.toString("ascii", riff + 8, riff + 12) !== "WAVE") return null;
  let off = riff + 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === "fmt " && off + 16 <= buf.length) byteRate = buf.readUInt32LE(off + 16);
    if (id === "data") {
      // streaming writers leave the size unset; bound it by what arrived
      size = Math.min(size, buf.length - (off + 8));
      return byteRate > 0 ? size / byteRate : null;
    }
    off += 8 + size + (size % 2);
  }
  return null;
}
// Fallback: the last word's end time in the provider's reply.
function transcriptSeconds(text) {
  try {
    const words = JSON.parse(text).words || [];
    return words.reduce((m, w) => Math.max(m, Number(w.end) || 0), 0) || null;
  } catch {
    return null;
  }
}
function requireAccount(req, res) {
  const a = accountFor(bearer(req));
  if (!a) {
    res.status(401).json({ error: "sign in with Za3tar first" });
    return null;
  }
  return a;
}
function overCap(a, kind) {
  const caps = { ...DEFAULT_CAPS, ...(a.caps || {}) };
  return usageOf(a.id)[kind] >= caps[kind];
}

// ── app ────────────────────────────────────────────────────────────────
const app = express();
app.disable("x-powered-by");
// behind a reverse proxy on loopback: req.ip is the real client
app.set("trust proxy", "loopback");
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, month: month() }));

// invite → account. The name is what Za3tar calls the person.
app.post("/v1/auth/redeem", express.json({ limit: "16kb" }), (req, res) => {
  if (!redeemAllowed(req.ip || "?")) return res.status(429).json({ error: "too many attempts, try again later" });
  const code = String(req.body?.code || "").trim();
  const name = String(req.body?.name || "").trim().slice(0, 80);
  if (!code) return res.status(400).json({ error: "invite code required" });
  const inv = invites();
  const entry = inv[code];
  if (!entry) return res.status(404).json({ error: "that invite code is not valid" });
  if (entry.used_by) return res.status(409).json({ error: "that invite code was already used" });
  const id = `acc_${randomBytes(6).toString("hex")}`;
  const token = `za3_${randomBytes(24).toString("hex")}`;
  const acc = accounts();
  acc[id] = {
    name,
    created: new Date().toISOString(),
    token_hash: sha(token),
    caps: entry.caps || {},
    invite: code,
  };
  save("accounts.json", acc);
  inv[code].used_by = id;
  inv[code].used_at = new Date().toISOString();
  save("invites.json", inv);
  res.status(201).json({ token, account: { id, name, caps: { ...DEFAULT_CAPS, ...(entry.caps || {}) } } });
});

app.get("/v1/me", (req, res) => {
  const a = requireAccount(req, res);
  if (!a) return;
  res.json({
    account: { id: a.id, name: a.name, created: a.created },
    caps: { ...DEFAULT_CAPS, ...(a.caps || {}) },
    usage: usageOf(a.id),
    month: month(),
    providers: { anthropic: !!KEYS.anthropic, elevenlabs: !!KEYS.elevenlabs, openai: !!KEYS.openai, typesafe: !!KEYS.typesafe },
  });
});

// admin: mint invites. curl -H "X-Admin-Token: …" -d '{"note":"a friend"}' /v1/admin/invites
app.post("/v1/admin/invites", express.json({ limit: "16kb" }), (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "no" });
  const code = `za3tar-${randomBytes(10).toString("hex")}`; // 80 bits
  const inv = invites();
  inv[code] = { created: new Date().toISOString(), note: String(req.body?.note || ""), caps: req.body?.caps || {}, used_by: null };
  save("invites.json", inv);
  res.status(201).json({ code });
});
app.get("/v1/admin/accounts", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "no" });
  const out = Object.entries(accounts()).map(([id, a]) => ({
    id,
    name: a.name,
    created: a.created,
    revoked: a.revoked || null,
    usage: usageOf(id),
  }));
  res.json({ month: month(), accounts: out });
});
// admin: revoke an account. Its token stops working at once; the record and
// its usage stay for the books. curl -X POST -H "X-Admin-Token: …" /v1/admin/accounts/<id>/revoke
app.post("/v1/admin/accounts/:id/revoke", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "no" });
  const acc = accounts();
  const a = acc[req.params.id];
  if (!a) return res.status(404).json({ error: "no such account" });
  a.revoked = new Date().toISOString();
  save("accounts.json", acc);
  res.json({ id: req.params.id, revoked: a.revoked });
});

// ── providers ──────────────────────────────────────────────────────────
app.post("/v1/anthropic/messages", express.json({ limit: "4mb" }), async (req, res) => {
  const a = requireAccount(req, res);
  if (!a) return;
  if (!KEYS.anthropic) return res.status(503).json({ error: "notes are not available on this host" });
  if (overCap(a, "anthropic_tokens")) return res.status(402).json({ error: "monthly cap reached for notes and decisions" });
  const model = String(req.body?.model || "");
  if (!ANTHROPIC_MODELS.has(model)) return res.status(400).json({ error: `model not available on this host: ${model || "none"}` });
  const maxTokens = Number(req.body?.max_tokens);
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > ANTHROPIC_MAX_TOKENS)
    return res.status(400).json({ error: `max_tokens must be 1..${ANTHROPIC_MAX_TOKENS}` });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEYS.anthropic, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      const u = j.usage || {};
      addUsage(a.id, { anthropic_tokens: (u.input_tokens || 0) + (u.output_tokens || 0), requests: 1 });
    } catch {
      /* not json */
    }
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: `anthropic unreachable: ${e.message}` });
  }
});

// Jev (TypeSafe System One): typed judgments, no text. Metered on input tokens;
// output is free upstream.
app.post("/v1/typesafe/systemone", express.json({ limit: "1mb" }), async (req, res) => {
  const a = requireAccount(req, res);
  if (!a) return;
  if (!KEYS.typesafe) return res.status(503).json({ error: "fast reads are not available on this host" });
  if (overCap(a, "typesafe_tokens")) return res.status(402).json({ error: "monthly cap reached for fast reads" });
  try {
    const r = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${KEYS.typesafe}`, "content-type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await r.text();
    try {
      const u = JSON.parse(text).usage || {};
      addUsage(a.id, { typesafe_tokens: u.input_tokens || 0, requests: 1 });
    } catch {
      /* not json */
    }
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: `typesafe unreachable: ${e.message}` });
  }
});

app.post(
  "/v1/elevenlabs/speech-to-text",
  express.raw({ type: () => true, limit: "200mb" }),
  async (req, res) => {
    const a = requireAccount(req, res);
    if (!a) return;
    if (!KEYS.elevenlabs) return res.status(503).json({ error: "transcription is not available on this host" });
    if (overCap(a, "asr_seconds")) return res.status(402).json({ error: "monthly cap reached for transcription" });
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: { "xi-api-key": KEYS.elevenlabs, "content-type": req.headers["content-type"] || "application/octet-stream" },
        body: req.body,
        signal: AbortSignal.timeout(600_000),
      });
      const text = await r.text();
      // Meter on the real audio length: the WAV header first (what the
      // provider bills), then the transcript's last word, and only as a last
      // resort a 16 kHz mono 16-bit estimate (32 000 bytes per second).
      const secs = wavSeconds(req.body) ?? transcriptSeconds(text) ?? (req.body?.length || 0) / 32_000;
      addUsage(a.id, { asr_seconds: Math.ceil(secs), requests: 1 });
      res.status(r.status).type(r.headers.get("content-type") || "application/json").send(text);
    } catch (e) {
      res.status(502).json({ error: `elevenlabs unreachable: ${e.message}` });
    }
  },
);

app.post("/v1/live/sessions", express.json({ limit: "1mb" }), async (req, res) => {
  const a = requireAccount(req, res);
  if (!a) return;
  if (!KEYS.openai) return res.status(503).json({ error: "Talk is not available on this host" });
  if (overCap(a, "live_seconds")) return res.status(402).json({ error: "monthly cap reached for Talk" });
  try {
    const r = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEYS.openai}`, "content-type": "application/json" },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await r.text();
    try {
      const j = JSON.parse(text);
      if (j.session?.id) rememberLive(j.session.id, a.id);
    } catch {
      /* not json */
    }
    addUsage(a.id, { requests: 1 });
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: `voice service unreachable: ${e.message}` });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not found" }));

// ── live sideband relay ────────────────────────────────────────────────
// The app's WebSocket to /v1/live/sessions/:id/attach is relayed to OpenAI
// with the server key. Only the account that minted the session through
// this host may attach to it. Usage is metered from session.closed.
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  const m = /^\/v1\/live\/sessions\/([^/]+)\/attach$/.exec(url.pathname);
  const a = accountFor(bearer(req));
  if (!m || !a || !KEYS.openai) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  let sid = "";
  try {
    sid = decodeURIComponent(m[1]);
  } catch {
    /* malformed → refused below */
  }
  if (!sid || liveOwners()[sid]?.account !== a.id) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => {
    const upstream = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sid)}/attach`, {
      headers: { Authorization: `Bearer ${KEYS.openai}` },
    });
    const queue = [];
    upstream.on("open", () => {
      for (const q of queue) upstream.send(q);
      queue.length = 0;
    });
    client.on("message", (data) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data.toString());
      else queue.push(data.toString());
    });
    upstream.on("message", (data) => {
      const s = data.toString();
      try {
        const e = JSON.parse(s);
        if (e.type === "session.closed" && e.usage?.seconds) addUsage(a.id, { live_seconds: Number(e.usage.seconds) || 0 });
      } catch {
        /* passthrough */
      }
      if (client.readyState === WebSocket.OPEN) client.send(s);
    });
    const close = () => {
      try { client.close(); } catch { /* fine */ }
      try { upstream.close(); } catch { /* fine */ }
    };
    client.on("close", close);
    upstream.on("close", close);
    upstream.on("error", close);
    client.on("error", close);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`za3tar proxy on 127.0.0.1:${PORT} data=${DATA} providers=${Object.entries(KEYS).filter(([, v]) => v).map(([k]) => k).join(",") || "none"}`);
});
