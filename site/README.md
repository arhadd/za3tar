# za3tar.ai — website

The marketing site at https://za3tar.ai: static pages (`index.html`, `try/`,
`talk/`, `demo/`), brand assets (`brand/`, `favicon.svg`, `og.png`) and two
Vercel functions (`api/try.js`, `api/live.js`, sharing `api/_guard.js`).

## Licence

**Not licensed for reuse. All rights reserved.** The site copy, design, brand
marks, images and video in this directory are not covered by the repository's
AGPL-3.0 or Apache-2.0 licences. See [`../LICENSES/README.md`](../LICENSES/README.md).

## Deploy

Linked Vercel project: `za3tar`. Until that project's root directory points at
`site/`, deploys run from the design folder (`~/za3tar-design/landing-v11`), which
this directory mirrors. `.vercelignore` keeps tooling and docs out of the deploy.

Functions need `ANTHROPIC_API_KEY` (`/api/try`) and `OPENAI_API_KEY` (`/api/live`)
in the Vercel project environment. Optional overrides for the in-memory limits:
`TRY_LIMIT_PER_10MIN`, `TRY_PAGE_LIMIT_PER_10MIN`, `TRY_GLOBAL_PER_HOUR`,
`LIVE_LIMIT_PER_HOUR`, `LIVE_GLOBAL_PER_HOUR`.

## Abuse limits

Each function checks method, then origin (production domains; on previews only
the deployment's own `*.vercel.app` hosts), then a per-IP and per-instance rate
limit, then validates the body, and only then calls a model. The limits live in
memory per warm instance, so they are friction, not a global cap: the hard caps
are the spend limits on the Anthropic and OpenAI accounts.
