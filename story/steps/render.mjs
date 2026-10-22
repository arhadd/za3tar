// Renders the step films to site/media/step-<name>.mp4 (+ .jpg poster) by seeking every frame.
//   node story/steps/render.mjs                       → all four
//   node story/steps/render.mjs setup grow            → just those
//   node story/steps/render.mjs setup --stills 3,14   → PNGs of those moments (into $OUT or here)
// Needs playwright (set PLAYWRIGHT=/path/to/node_modules/playwright if it is
// not resolvable from here) and ffmpeg on PATH.
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const pw = await import(process.env.PLAYWRIGHT ? pathToFileURL(path.join(process.env.PLAYWRIGHT, "index.js")).href : "playwright");
const chromium = pw.chromium ?? pw.default.chromium;
const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, W = 1920, H = 1080, POSTER_AT = 23;
const args = process.argv.slice(2);
const stillsAt = args.indexOf("--stills");
const stills = stillsAt > -1 ? args.splice(stillsAt, 2)[1].split(",").map(Number) : null;
const names = args.length ? args : ["setup", "connect", "maintain", "grow"];

// CHROME=/path/to/chrome-headless-shell when the cached browser build differs from this playwright
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const name of names) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(pathToFileURL(path.join(here, `${name}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const duration = await page.evaluate(() => window.DURATION);
  // seek, then wait two frames so the paint matches the seek before we capture
  const seek = t => page.evaluate(t => { window.seek(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);

  if (stills) {
    const out = process.env.OUT ?? here;
    for (const t of stills) {
      await seek(t);
      await page.screenshot({ path: path.join(out, `${name}-${t}.png`) });
    }
  } else {
    const media = process.env.OUTDIR ?? path.join(here, "..", "..", "site", "media");
    const mp4 = path.join(media, `step-${name}.mp4`);
    const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
      { stdio: ["pipe", "inherit", "inherit"] });
    const frames = Math.round(duration * FPS);
    for (let i = 0; i < frames; i++) {
      await seek(i / FPS);
      const buf = await page.screenshot({ type: "png" });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    }
    ff.stdin.end();
    await new Promise(r => ff.on("close", r));
    // poster = the end card with the step's name, fully settled
    await seek(POSTER_AT);
    await page.screenshot({ path: path.join(media, `step-${name}.jpg`), type: "jpeg", quality: 82 });
    console.log("wrote", mp4);
  }
  await page.close();
}
await browser.close();
