# Step videos — Set up · Connect · Maintain · Grow

Four short films, 24s each, one per step in "How it works". They play silent with captions on the homepage, under the demo.
The company is generic on purpose: it is "your company", and people are labelled only by role (ops, sales). No names, no industry, no real clients or agents. The Z mascot stands for za3tar. Nothing in the films is a chat: the work shows up as tools, notes, forms and the one place.
Source: `story/steps/<step>.html` → `site/media/step-<step>.mp4` + `.jpg`. Render with
`PLAYWRIGHT=/path/to/node_modules/playwright node story/steps/render.mjs [setup connect maintain grow]` (needs ffmpeg).
Single frame: open `story/steps/<step>.html?t=12`.

## 01 · Set up — "We see how the work moves, then build"

| Time | On screen | Caption |
|---|---|---|
| 0–7s | Three lanes (sales, ops, finance), each a chain of the tools the work passes through. The mascot moves along the top, watching. | Week one. We sit with your team and see how the work really moves. |
| 7–14s | "Seen" notes pop up where time goes: copied by hand every day, waits on the founder, "who's on shift?" asked 3×, same report every Monday · 3h. | We note where the time goes: the copying, the chasing, the weekly report. |
| 14–20s | The lanes fade back. A "Weekly report · built in week two" card assembles: a chart, its sources, ready every Monday, live. | Then we build the first piece around how you already work. |
| 20–24s | **Set up.** Built around how your team already works. | |

## 02 · Connect — "Your tools, in one place"

| Time | On screen | Caption |
|---|---|---|
| 0–6s | Six tool tiles pop up around the screen: bookings sheet, accounting, calendar, inbox, CRM, drive. | Today your company lives in ten tools. |
| 6–13s | "Your company, in one place" appears in the middle and wires draw from every tool into it. The tools stay where they are. | We connect them into one place. Nothing moves, nothing gets retyped. |
| 13–20s | The accounting tile lights up and a number lands in the middle: venue spend this month, tagged "from Accounting". | Your team works from the same numbers, each with its source. |
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
| 0–7s | Ops fills in a "New job" form: guest list, every Thursday 9:00, from bookings, to the ops team. Start. The job joins "Running jobs". | Your team adds new jobs as the work changes. |
| 7–13s | A new tool, ticketing, flies in and connects. Tag: "added by sales". | New tools join as the company needs them. |
| 13–20s | The jobs list fills up: weekly report, invoice reminders, new leads, month-end summary. | Month by month, the company runs from one place. |
| 20–24s | **Grow.** The system grows with your company. | |
