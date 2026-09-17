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
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import http from "node:http";

const PORT = Number(process.env.PORT || 8791);
const DATA = process.env.DATA_DIR || "./data";
const KEYS = {
  anthropic: process.env.ANTHROPIC_API_KEY || "",
  elevenlabs: process.env.ELEVENLABS_API_KEY || "",
  openai: process.env.OPENAI_API_KEY || "",
};
const ADMIN = process.env.ADMIN_TOKEN || "";
const DEFAULT_CAPS = {
  anthropic_tokens: Number(process.env.CAP_ANTHROPIC_TOKENS || 2_000_000),
  asr_seconds: Number(process.env.CAP_ASR_SECONDS || 18_000), // 5 hours
  live_seconds: Number(process.env.CAP_LIVE_SECONDS || 3_600), // 1 hour
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
function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : (req.query?.token ? String(req.query.token) : "");
}
function accountFor(token) {
  if (!token) return null;
  const hash = sha(token);
  for (const [id, a] of Object.entries(accounts())) if (a.token_hash === hash) return { id, ...a };
  return null;
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
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, month: month() }));

// invite → account. The name is what Za3tar calls the person.
app.post("/v1/auth/redeem", express.json({ limit: "16kb" }), (req, res) => {
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
    providers: { anthropic: !!KEYS.anthropic, elevenlabs: !!KEYS.elevenlabs, openai: !!KEYS.openai },
  });
});

// admin: mint invites. curl -H "X-Admin-Token: …" -d '{"note":"yazan"}' /v1/admin/invites
app.post("/v1/admin/invites", express.json({ limit: "16kb" }), (req, res) => {
  if (!ADMIN || req.headers["x-admin-token"] !== ADMIN) return res.status(403).json({ error: "no" });
  const code = `za3tar-${randomBytes(4).toString("hex")}`;
  const inv = invites();
  inv[code] = { created: new Date().toISOString(), note: String(req.body?.note || ""), caps: req.body?.caps || {}, used_by: null };
  save("invites.json", inv);
  res.status(201).json({ code });
});
app.get("/v1/admin/accounts", (req, res) => {
  if (!ADMIN || req.headers["x-admin-token"] !== ADMIN) return res.status(403).json({ error: "no" });
  const out = Object.entries(accounts()).map(([id, a]) => ({ id, name: a.name, created: a.created, usage: usageOf(id) }));
  res.json({ month: month(), accounts: out });
});

// ── providers ──────────────────────────────────────────────────────────
app.post("/v1/anthropic/messages", express.json({ limit: "4mb" }), async (req, res) => {
  const a = requireAccount(req, res);
  if (!a) return;
  if (!KEYS.anthropic) return res.status(503).json({ error: "notes are not available on this host" });
  if (overCap(a, "anthropic_tokens")) return res.status(402).json({ error: "monthly cap reached for notes and decisions" });
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
      // 16 kHz mono 16-bit wav ≈ 32 000 bytes per second; good enough to meter
      addUsage(a.id, { asr_seconds: Math.round((req.body?.length || 0) / 32_000), requests: 1 });
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
      if (j.session?.id) liveOwners.set(j.session.id, a.id);
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
// with the server key. Usage is metered from session.closed.
const liveOwners = new Map(); // session id → account id
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  const m = /^\/v1\/live\/sessions\/([^/]+)\/attach$/.exec(url.pathname);
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  const a = accountFor(token);
  if (!m || !a || !KEYS.openai) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  const sid = decodeURIComponent(m[1]);
  if (liveOwners.get(sid) && liveOwners.get(sid) !== a.id) {
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
      liveOwners.delete(sid);
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
