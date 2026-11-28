# CLAUDE.md

How to work in this repository. Written for coding agents, true for people too.
This repository is public: nothing in it, this file included, names a client,
an internal agent setup, a price or a secret.

## Two things live here

| part | what | how you see it |
|---|---|---|
| `src/`, `src-tauri/`, `capture/` | the za3tar app (Tauri v2: React + TS interface, Rust core, Swift capture helper) | `npm run dev` → http://localhost:1420, runs on made-up data from `src/devMock.ts`; `?fresh=1` shows first-run setup |
| `site/` | the za3tar.ai website: static pages + Vercel functions in `site/api/` | `python3 -m http.server 4310 --directory site` → http://localhost:4310 |

Both are in `.claude/launch.json` (`za3tar-web`, `za3tar-site`).
`CONTRIBUTING.md` has the full map of `src-tauri/src/`.

## Done means verified, not written

- Run what you changed before you call it done. Interface or site change:
  open it, click through the changed path, take screenshots at **375px wide
  and at laptop width**, and put them in the PR.
- Every site page must fit **one screen** on a phone and on a laptop, with
  no scrolling to reach the main button. Check it; don't assume it.
- App change: `npm run release:check` is the gate CI runs (versions, licence
  boundary, build, `cargo fmt`, `cargo clippy`, Rust tests, capture helper).
  Run it before opening a PR. CI runs it again on macOS.
- `site/api/*` changes: run them against a Vercel preview, not production.
  The functions are origin-gated, so a plain curl gets refused by design.

## Generated files: change the source, then rebuild

- `site/app/` is a build of `src/`. After any `src/` change that should show
  on za3tar.ai/app, run `npm run build:web` from the root and **commit the
  output**. The site has no build step.
- `site/llms.txt` and `site/llms-full.txt` are plain-text twins of the site
  copy. When the homepage words change, update them in the same PR.

## Deploying za3tar.ai

- The site deploys **only from `origin/main`**. Never deploy from a feature
  branch or an old local checkout: that rolls the live site back.
- Vercel project root is `site/`. Production deploys are run by the
  maintainer; an agent opens the PR, gets it merged, then checks the live
  page and reports what it saw.

## Words on the site

- Voice is "we". Plain, concrete verbs. No sales claims, no superlatives,
  no "revolutionize". Say what the setup does.
- **No prices, no dollar amounts** anywhere public.
- **No real client or person named** unless they said yes in writing. Demos
  use made-up companies (the agency, restaurant and construction examples).
- Our story: AI changed how we work. The setup is you and your team, chat,
  an assistant and your tools. The agent does the work, **you give the yes**.
  The app only shows things together; the setup is the point, not the app.
- No handwritten or script fonts.

## Git

- Branch from `origin/main`: `feat/`, `fix/`, `chore/`. One change per PR.
  Commit messages are imperative and say why. Sign off (`git commit -s`), as
  the PR template asks.
- Some old local branches still hold files scrubbed from public history.
  **Only push branches you created from `origin/main`.** Never force-push
  `main`.
- Never commit `.env`, keys, recordings or real meeting content. Every key
  goes in `.env` (see `.env.example`) or in the app's Settings.

## Dependencies

`.npmrc` sets `min-release-age=7`: no package published in the last 7 days.
Don't bypass it. Add a dependency only when the pain is real.
