# za3tar — business plan 🌿

*Draft, September 2026. Numbers marked (assumption) are placeholders to be replaced with measured data; nothing here is a forecast we have evidence for yet.*

## One line

za3tar is a private-by-default Mac meeting workspace for people who speak Arabic and English in the same sentence. It records without a bot, understands the conversation the way it was actually spoken, and turns it into decisions, owners, dates, and follow-through.

Why the name: زعتر is on every table in the region. Ordinary, everywhere, and nobody's meeting is complete without it.

## The problem

Three things are true of business meetings in the Gulf and the Levant that the incumbent meeting tools do not handle.

1. **Meetings happen in a mix.** "خلينا نأجّل الـ launch لـ Q4" is one sentence. English-first tools translate it, transliterate the Arabic into Latin gibberish, or drop it. Arabic-first tools mangle the English names and technical terms. Neither preserves the sentence.
2. **Follow-up happens on WhatsApp, not in the tool.** The recap that matters is the one sent to the group after the call, in the same mix it was spoken in. Notetakers produce an English summary that sits in a dashboard nobody opens.
3. **A bot in the call is a non-starter for many of these conversations.** Family businesses, government, legal, investors: a "Fireflies.ai has joined" line changes the meeting. And data leaving the country is increasingly a compliance question (Saudi PDPL, UAE PDPL, sector rules), not a preference.

The people who most need meeting memory are the ones least served by Otter, Fireflies, tl;dv, Fathom, Granola, Zoom AI Companion, and Copilot.

## What exists today

The repository is a v0.1.0 candidate: a native Tauri app (Rust + React) at roughly 3,400 lines, AGPL-3.0 with an Apache-2.0 agent protocol, one maintainer.

Working:

- No-bot capture of mic and system audio as separate me/them tracks, using macOS 14.4+ process taps (the sanctioned API, no virtual audio driver).
- ElevenLabs Scribe v2 transcription behind a pluggable ASR adapter.
- Claude-generated structured notes that keep Arabic in Arabic script and English terms natural.
- Decisions, action items with owners and resolved dates, and open questions. No invented commitments.
- Editable WhatsApp and email drafts in the meeting's own language mix; `.ics` Calendar export.
- Meeting library, people view, and cross-meeting follow-up tracking.
- A versioned agent bridge (ZA3TAR_PACKET v1) with a worked Hermes adapter, so any assistant can own the follow-through.
- Bring-your-own-keys. No account, no first-party cloud, no telemetry.

Not yet: signing and notarized distribution, Windows, offline ASR, team sync, managed processing.

## Who it is for

**Beachhead:** bilingual operators on Mac who run their day on WhatsApp. Founders, consultants, lawyers, real-estate and investment advisors, agency owners, family-office staff, in the UAE, Saudi Arabia, Jordan, Lebanon, Egypt, and the diaspora.

**Then:** their teams, who need one shared ledger of who owes what to whom.

**Then:** organisations with data-residency requirements, where "processing stays in-region" is the buying criterion and the price is annual.

## Market

We do not have a defensible top-down number yet. The order of magnitude, with the assumptions exposed:

| Layer | Estimate | Basis |
| --- | --- | --- |
| Arabic speakers worldwide | 400M+ | Public figure; not the market |
| Knowledge workers in GCC + Levant + Egypt who hold mixed-language business meetings | ~5M (assumption) | To be replaced with a bottom-up count by segment |
| Addressable Mac seats in that group today | ~1M (assumption) | Mac share is a minority overall but high in startup, consulting, and finance |
| Theoretical SAM at $15/seat/month | ~$180M/yr | Arithmetic on the row above |
| Three-year target | 20–30k paid seats, $4–7M ARR | See the financial sketch |

Windows support multiplies the seat count. The sovereign tier is a separate, smaller-count, larger-contract market: government and semi-government entities in Saudi Arabia and the UAE with mandates for Arabic-capable AI and local processing.

## Why now

- **macOS 14.4 process taps** made no-bot system-audio capture legitimate. Before that it meant a virtual audio driver and a support nightmare.
- **Arabic dialect ASR crossed "usable" in 2025.** Scribe v2 and Whisper-class open models handle Gulf, Levantine, and Egyptian speech well enough that the remaining errors are fixable with prompting and evaluation, not research.
- **LLMs handle code-switching natively.** The structured-notes step needs no translation layer; it needs a good prompt and a good eval set.
- **Agent frameworks are real.** Hermes, OpenClaw, Claude agents. The "follow-through" step can be delegated, and an open protocol wins where a walled garden does not.
- **Regional AI push.** National AI strategies and sovereign compute in Saudi Arabia and the UAE create demand for tools that can run on regional infrastructure.
- **Incumbents will add Arabic**, but as a translation feature. Native-mix as the default mode is a positioning they cannot copy without rebuilding the pipeline.

## Business model: open core

- **Free, open source (AGPL), bring-your-own-keys.** The app as it is today. This is distribution and trust. It is never crippled.
- **Pro, $15–20/month or $150/year.** Signed builds with auto-update, managed processing with bundled minutes (no API keys to paste), better diarization, dialect tuning, priority support. At current provider prices a heavy user (20 hours/month) costs low single-digit dollars to serve; target gross margin above 70% (assumption).
- **Teams, ~$30/seat/month.** Shared follow-up ledger and people view, admin, SSO, end-to-end encrypted sync. Still local-first: the server holds ciphertext.
- **Sovereign, annual contract, $50k–250k.** Regional or on-premises processing with self-hosted ASR and LLM, audit logging, agent operations, and a commercial licence via AGPL dual-licensing.

The agent bridge is not a revenue line. It is the reason organisations with an existing assistant choose za3tar over a tool that wants to be the assistant.

## Go to market

1. **Founder-led and WhatsApp-native.** Every recap a user sends is a demo in the recipient's own language mix. An opt-in "drafted with za3tar 🌿" footer is the growth loop.
2. **Communities.** Founder and consultant groups in Dubai and Riyadh, lawyers, family offices. Content in Arabic: "here is what your notetaker did to your last meeting."
3. **Open source as wedge.** GitHub, the Hermes and OpenClaw communities, the protocol itself. Agent builders ship adapters; their users become ours.
4. **Partners for the sovereign tier.** Regional AI cloud providers and integrators who already sell into government.

## Competition

| | Bot in call | Native Arabic/English mix | Local-first | Follow-through beyond notes |
| --- | --- | --- | --- | --- |
| Otter, Fireflies, tl;dv | Yes | No, translation | No, cloud account | Summary and tasks in their dashboard |
| Fathom, Granola | No | No | No, cloud account | Summary, integrations |
| Zoom, Teams, Meet AI | Built in | Translation | No | Platform-locked |
| Arabic ASR APIs | n/a | Transcription only | n/a | None |
| **za3tar** | **No** | **Yes** | **Yes** | **WhatsApp, Calendar, ledger, any agent** |

The moat is not the model. It is, in order of durability:

- a consented, labelled corpus of real code-switched meetings and the evaluation set built from it;
- the follow-through ledger and people graph, which get more valuable every meeting;
- the protocol and the adapters other people write for it;
- trust, in a region where "your audio never left the country" is a feature customers will pay for;
- the operational know-how to deploy the pipeline on regional infrastructure.

## Roadmap

| Horizon | Deliverables | Proof |
| --- | --- | --- |
| Now to 3 months | Signed, notarized 0.1 → 0.3; managed-keys backend; dialect eval set (Gulf, Levantine, Egyptian) | 200 active users, week-4 retention measured |
| 3 to 9 months | Pro launch; Teams shared ledger; Windows; local ASR option for cost and offline | 2,000 paying Pro; 3 Teams accounts |
| 9 to 18 months | Sovereign tier with a regional provider; adapters for Claude, OpenClaw, n8n | 1 signed sovereign pilot; 2 enterprise pilots |

## Why raise money (the honest version)

Start with the uncomfortable part: we do not have to. A single maintainer with bring-your-own-keys and an open-source app can reach a few thousand dollars of monthly revenue on nobody's money. The question is whether the window and the shape of the opportunity reward speed.

**Reasons to raise:**

1. **The window is 12 to 24 months.** Granola and Fathom will ship "Arabic". Apple and Microsoft will bundle something. Being the default in the region before that means shipping Pro, Teams, and Windows in a year, not three.
2. **Managed processing has a float problem.** Bundled minutes mean paying ElevenLabs and Anthropic monthly before annual customers pay us. Small, but it is cash.
3. **The sovereign tier is capital-heavy up front.** Regional hosting, self-hosted ASR and LLM, security review, procurement cycles. It is the largest revenue line and the one that cannot be bootstrapped.
4. **Dialect quality is a data problem.** A consented, labelled corpus of code-switched meetings costs money: participants, annotators, legal.
5. **Hiring.** One Rust and audio engineer, one ML and evaluation engineer, one go-to-market person in region. Three people for eighteen months is most of a pre-seed.
6. **Signal.** In the Gulf, an institutional cap table opens government and enterprise doors that a solo open-source project does not.

**Reasons not to raise, said out loud:**

- Local-first with no cloud is at odds with the growth loop investors want. We would be pushed toward accounts, cloud, and telemetry, which is exactly what users trust us not to do.
- AGPL plus bring-your-own-keys means we cannot show usage metrics. Investors will ask for numbers we have deliberately chosen not to collect.
- A $1M pre-seed at an $8M post-money valuation implies aiming at $50M+ ARR. If the honest ceiling is a $5M-a-year profitable niche, that is a great business and a bad venture.

**Recommendation.** Raise a small pre-seed only after the first milestone (signed build, 200 users, retention data), from angels and regional funds aligned with sovereign AI, or do not raise at all and charge for Pro from day one. Do not raise to find out whether people want it. Raise once they do, to get there first.

## The ask, if we raise

**$1.0–1.5M pre-seed for 18 months of runway.**

| Use of funds | Share |
| --- | --- |
| Team (3 hires) | 60% |
| Managed processing and provider costs | 10% |
| Dialect corpus and evaluation | 10% |
| Sovereign pilots and compliance | 10% |
| Go-to-market | 10% |

Milestones the round buys: 2,000 paying Pro seats, 3 Teams accounts, 1 signed sovereign pilot, monthly churn under 5%, and a published word-error rate on our own dialect eval set.

## Financial sketch

All rows are assumptions to be replaced by measured data.

| | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- |
| Pro seats × $15/month | 1,500 → $270k | 8,000 → $1.4M | 25,000 → $4.5M |
| Teams seats × $30/month | — | 500 → $180k | 3,000 → $1.1M |
| Sovereign contracts × $150k | — | 2 → $300k | 6 → $900k |
| **Exit ARR** | **~$270k** | **~$1.9M** | **~$6.5M** |

## Risks

- **Provider dependency.** ElevenLabs and Anthropic pricing, terms, and regional availability. Mitigation: the ASR adapter is already pluggable; a local-model path is on the roadmap.
- **Apple platform risk.** Changes to the system-audio permission model. Mitigation: we use the sanctioned API; Windows diversifies.
- **Consent and recording law.** Rules vary across the region. Mitigation: in-app consent prompts, never default-record, no bundled cloud storage of audio.
- **Solo founder.** Mitigation: the hires are the round.
- **Bundled AI from platforms.** Mitigation: the loop after the notes, and the language mix, are what the bundles do not do.

## Team

One founder and maintainer today, with the codebase, protocol, and positioning shipped. The round funds three hires: Rust/audio, ML/evaluation, and go-to-market in region.
