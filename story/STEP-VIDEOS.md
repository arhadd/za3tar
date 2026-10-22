# Step videos — Set up · Connect · Maintain · Grow

Four short films, 24s each, one per step in "How it works". They play silent with captions on the homepage, under the demo.
The company is generic on purpose: it is "your company", and people are labelled only by role (ops, sales). No names, no industry, no real clients or agents. The teammate is the Z mascot.
Source: `story/steps/<step>.html` → `site/media/step-<step>.mp4` + `.jpg`. Render with
`PLAYWRIGHT=/path/to/node_modules/playwright node story/steps/render.mjs [setup connect maintain grow]` (needs ffmpeg).
Single frame: open `story/steps/<step>.html?t=12`.

## 01 · Set up — "It joins your chat"

| Time | On screen | Caption |
|---|---|---|
| 0–7s | The team chat. "Za3tar joined the chat", and the mascot pops in. | Day one. Your teammate joins the chat you already use. |
| 7–14s | Ops: "We call them guests, never customers." Sales: "Anything over 5k goes to the founder first." A "House rules" card fills in beside the chat. | Your team tells it how the company works, in their own words. |
| 14–20s | Sales: "Draft the reply to the new booking." The draft comes back in the house voice, with Send / Edit. Send lights up. | By the end of week one, it writes like you. |
| 20–24s | **Set up.** A teammate that knows your company. | |

## 02 · Connect — "Your tools, in one place"

| Time | On screen | Caption |
|---|---|---|
| 0–6s | Six tool tiles pop up around the screen: bookings sheet, accounting, calendar, inbox, CRM, drive. | Today your company lives in ten tools. |
| 6–13s | "Your company, in one place" appears in the middle and wires draw from every tool into it. The tools stay where they are. | We connect them into one place. Nothing moves, nothing gets retyped. |
| 13–20s | Sales asks "What did we spend on venues this month?" The answer comes back with a source tag: "from Accounting". | Now anyone can ask, and every answer shows where it came from. |
| 20–24s | **Connect.** Your tools stay. Everything meets in one place. | |

## 03 · Maintain — "It stays current"

| Time | On screen | Caption |
|---|---|---|
| 0–6s | The same picture, all connected. Week 1 flips to week 6. New bookings and a price change land in the tools. | Companies change every day. |
| 6–13s | Pulses travel from each tool into the middle, and its rows read "updated just now". | We keep every tool connected, so everything stays current. |
| 13–20s | The calendar's line turns amber: "login expired". Then it goes green again: "fixed overnight". | When something breaks, we fix it before your team notices. |
| 20–24s | **Maintain.** Always current. Nobody copies anything by hand. | |

## 04 · Grow — "Your team adds the jobs"

| Time | On screen | Caption |
|---|---|---|
| 0–7s | Ops: "Can you send me the guest list every Thursday?" Za3tar: "Every Thursday at 9, from bookings. Start this week?" Ops: "Yes." The job joins a "Running jobs" list. | Your team hands it new jobs, in plain words. |
| 7–13s | A new tool, ticketing, flies in and connects. Tag: "added by sales". | New tools join as the company needs them. |
| 13–20s | The jobs list fills up: weekly report, invoice reminders, new leads, month-end summary. | Month by month, the company runs from one place. |
| 20–24s | **Grow.** The system grows with your company. | |
