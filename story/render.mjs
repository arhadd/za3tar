// Renders index.html to site/media/za3tar-story.mp4 (+ .jpg poster) by seeking every frame.
//   node story/render.mjs                 → full render
//   node story/render.mjs --stills 3,14   → just those moments, as PNGs
// Needs playwright (set PLAYWRIGHT=/path/to/node_modules/playwright if it is
// not resolvable from here) and ffmpeg on PATH.
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const pw = await import(process.env.PLAYWRIGHT ? pathToFileURL(path.join(process.env.PLAYWRIGHT, "index.js")).href : "playwright");
const chromium = pw.chromium ?? pw.default.chromium;
const here = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, W = 1920, H = 1080;
const stillsArg = process.argv.indexOf("--stills");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto(pathToFileURL(path.join(here, "index.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const duration = await page.evaluate(() => window.DURATION);
// seek, then wait two frames so the paint matches the seek before we capture
const seek = t => page.evaluate(t => { window.seek(t); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
const shot = async t => { await seek(t); return page.screenshot({ type: "png" }); };

if (stillsArg > -1) {
  const out = process.env.OUT ?? here;
  for (const t of process.argv[stillsArg + 1].split(",").map(Number)) {
    await seek(t);
    await page.screenshot({ path: path.join(out, `still-${t}.png`) });
  }
} else {
  const media = process.env.OUTDIR ?? path.join(here, "..", "site", "media");
  const mp4 = path.join(media, "za3tar-story.mp4");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4],
    { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i++) {
    const buf = await shot(i / FPS);
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on("close", r));
  // poster = the "meet" title card, fully settled
  await seek(31.5);
  await page.screenshot({ path: path.join(media, "za3tar-story.jpg"), type: "jpeg", quality: 82 });
  console.log("wrote", mp4);
}
await browser.close();
