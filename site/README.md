# za3tar.ai — website

The marketing site at https://za3tar.ai: static pages (`index.html`, `demo/`,
and the unlinked `talk/`), brand assets (`brand/`, `favicon.svg`, `og.png`) and
Vercel functions (`api/demo.js`, `api/try.js`, `api/live.js`, sharing
`api/_guard.js`). `/try` redirects to `/demo/`.

`/demo/` is the company demo, in checkpoints: the visitor taps Start (sound on,
or continues without sound), the voice (`api/live.js`) greets them and waits,
they type a company, and five parallel `api/demo.js` calls build the page (`core`
header, then team, tools, projects, customers, each with three recommendations
and one example workflow). Tiles fill in quietly; the voice presents the page
only once the visitor has answered a question and the conversation pauses (or
they ask to see it, or after 45 s), then tours one section at a time. Factual
questions the visitor asks out loud go to `api/demo.js` part `ask` (one search,
a short sourced answer) because the voice cannot browse. `/demo/?q=<company>`
only prefills the box.

## Licence

**Not licensed for reuse. All rights reserved.** The site copy, design, brand
marks, images and video in this directory are not covered by the repository's
AGPL-3.0 or Apache-2.0 licences. See [`../LICENSES/README.md`](../LICENSES/README.md).

## Deploy

Linked Vercel project: `za3tar`. Until that project's root directory points at
`site/`, deploys run from the design folder (`~/za3tar-design/landing-v11`), which
this directory mirrors. `.vercelignore` keeps tooling and docs out of the deploy.

Functions need `ANTHROPIC_API_KEY` (`/api/demo`, `/api/try`) and
`OPENAI_API_KEY` (`/api/live`) in the Vercel project environment. Optional:
`PERPLEXITY_API_KEY` makes `/api/demo` search with the Perplexity Search API;
without it, Claude's own web search tool does the search. Optional overrides for
the in-memory limits: `DEMO_LIMIT_PER_10MIN`, `DEMO_GLOBAL_PER_HOUR` (both
count demos; each demo is five part-requests, and each spoken question one more),
`TRY_LIMIT_PER_10MIN`, `TRY_PAGE_LIMIT_PER_10MIN`, `TRY_GLOBAL_PER_HOUR`,
`LIVE_LIMIT_PER_HOUR`, `LIVE_GLOBAL_PER_HOUR`.

## Abuse limits

Each function checks method, then origin (production domains; on previews only
the deployment's own `*.vercel.app` hosts), then a per-IP and per-instance rate
limit, then validates the body, and only then calls a model. The limits live in
memory per warm instance, so they are friction, not a global cap: the hard caps
are the spend limits on the Anthropic and OpenAI accounts.
