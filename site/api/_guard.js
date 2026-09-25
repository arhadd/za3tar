// Shared request guard for /api/demo, /api/try and /api/live. Files starting with "_" are
// not deployed as endpoints. Order: method -> origin -> rate limit, then the
// handler validates the body and only then calls a model.
//
// The rate limit is in-memory: it holds per warm function instance, not across
// instances or cold starts. It is friction plus a per-instance spend ceiling,
// not a hard global cap. The hard caps are the provider spend limits.

const PROD_ORIGINS = [
  "https://za3tar.ai",
  "https://www.za3tar.ai",
  "https://za3tarhq.vercel.app",
];

function allowedOrigins() {
  const env = process.env.VERCEL_ENV;
  if (env === "production") return PROD_ORIGINS;
  if (env === "preview") {
    // only this deployment's own *.vercel.app hosts (set by Vercel per deployment)
    return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
      .filter(
        (h) => typeof h === "string" && /^[a-z0-9-]+\.vercel\.app$/.test(h),
      )
      .map((h) => `https://${h}`);
  }
  if (env === "development")
    return [...PROD_ORIGINS, "http://localhost:3000", "http://127.0.0.1:3000"];
  return PROD_ORIGINS; // unknown environment: fail closed to production origins
}

export function clientIp(req) {
  const h = req.headers || {};
  const real = typeof h["x-real-ip"] === "string" ? h["x-real-ip"].trim() : "";
  if (real) return real;
  const fwd =
    typeof h["x-forwarded-for"] === "string"
      ? h["x-forwarded-for"].split(",")[0].trim()
      : "";
  return fwd || req.socket?.remoteAddress || "unknown";
}

// fixed-window counters: key -> { start, n }
const buckets = new Map();
const MAX_KEYS = 10000;

function hit(key, limit, windowMs, now) {
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    if (!b && buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets)
        if (now - v.start >= 60 * 60 * 1000) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value);
    }
    b = { start: now, n: 0 };
    buckets.set(key, b);
  }
  if (b.n >= limit) return false;
  b.n++;
  return true;
}

// Returns true when the request may proceed; otherwise it has already responded.
// opts: { name, globalName?, perIp: { limit, windowMs }, globalHourly }
export function guard(req, res, opts) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return false;
  }

  const origin = req.headers?.origin || "";
  if (!allowedOrigins().includes(origin)) {
    res.status(403).json({ error: "origin" });
    return false;
  }
  // extra friction: browsers send Sec-Fetch-Site; a same-origin fetch says so
  const site = req.headers?.["sec-fetch-site"];
  if (site && site !== "same-origin") {
    res.status(403).json({ error: "origin" });
    return false;
  }

  const now = Date.now();
  const ip = clientIp(req);
  if (
    !hit(`${opts.name}:ip:${ip}`, opts.perIp.limit, opts.perIp.windowMs, now)
  ) {
    res.setHeader?.(
      "Retry-After",
      String(Math.ceil(opts.perIp.windowMs / 1000)),
    );
    res
      .status(429)
      .json({ error: "That is a lot of requests. Try again a little later." });
    return false;
  }
  if (!hit(`${opts.globalName || opts.name}:global`, opts.globalHourly, 60 * 60 * 1000, now)) {
    res.setHeader?.("Retry-After", "600");
    res.status(429).json({ error: "Busy right now. Try again in a minute." });
    return false;
  }
  return true;
}

export function envInt(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// test hook
export function _resetGuard() {
  buckets.clear();
}
