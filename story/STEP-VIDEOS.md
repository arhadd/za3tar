# Step videos — Set up · Connect · Maintain · Grow

Draft 2026-10-22. Scripts only, render after sign-off.
Four short films, ~25s each, one per step in "How it works". Same world as the Lina and Karim story (story/SCRIPT.md): drawn characters, one office, no real people, clients or agents named. They play silent with on-screen captions. A voiced cut can come later from the right-hand column.
On the page: a row of four tiles under the demo, each a poster with the step name. Tap to play.

Running thread: Lina (ops) and Karim (sales) at a small events company. Each film moves the same company one step forward, so the four together tell one story.

---

## 01 · Set up — "It joins your chat"

| Time | On screen | Voiceover |
|---|---|---|
| 0–5s | The team's WhatsApp group. A new member joins: Za3tar. | Day one. Your teammate joins the chat you already use. |
| 5–13s | Lina types "we always say 'guests', never 'customers'". Za3tar replies "Got it." A small "house rules" card fills in: tone, names, who signs off. | Your team tells it how the company talks and works, in their own words. |
| 13–20s | Karim asks "draft the reply to Noor's booking". The draft comes back in the house voice. | By the end of week one, it writes like you. |
| 20–25s | Caption: **Set up.** A teammate that knows your company. | |

## 02 · Connect — "Your tools, in one place"

| Time | On screen | Voiceover |
|---|---|---|
| 0–6s | Scattered tiles: a bookings sheet, the accounting tool, a calendar, an inbox. Each in its own corner. | Today your company lives in ten tools. |
| 6–14s | Lines draw from each tile into one place in the middle. The tiles stay where they are. | We connect them into one place. Nothing moves, nothing gets retyped. |
| 14–21s | Karim asks "what did we spend on the venue this month?" The answer comes back with a small source tag: "from Accounting". | Now anyone can ask, and every answer shows where it came from. |
| 21–25s | Caption: **Connect.** Your tools stay. Everything meets in one place. | |

## 03 · Maintain — "It stays current"

| Time | On screen | Voiceover |
|---|---|---|
| 0–6s | A month passes on a wall calendar. A booking moves in the sheet, a price changes in accounting. | Companies change every day. |
| 6–14s | The one place updates on its own: small pulses travel in from each tool. Nobody copies anything. | We keep every tool connected, so the picture is always current. |
| 14–21s | A tool's login expires and the line goes amber. A moment later it reconnects, green, with a note "fixed overnight". | When something breaks, we fix it before your team notices. |
| 21–25s | Caption: **Maintain.** Always current. Nobody copies anything by hand. | |

## 04 · Grow — "Your team adds the jobs"

| Time | On screen | Voiceover |
|---|---|---|
| 0–7s | Lina in the chat: "can you send me the guest list every Thursday?" Za3tar: "Every Thursday at 9, from bookings. Start this week?" Lina: "Yes." | Your team hands it new jobs, in plain words. |
| 7–15s | Karim connects a new tool himself, the ticketing app, and a new tile joins the one place. | New tools join as the company needs them. |
| 15–21s | The one place fills out: departments appear, then months of history. Pull back to the whole office, working calmly. | Month by month, the company runs from one place. |
| 21–25s | Caption: **Grow.** The system grows with your company. | |

---

## Build notes

- **Pipeline:** the same as story/: HTML scene with a seek(t) clock → Playwright frames → ffmpeg. One `story/steps/<n>.html` per film, sharing the story's character and office drawings.
- **Output:** `site/media/step-<name>.mp4` + `.jpg` poster, 1080p, under ~2MB each, muted, `playsinline`.
- **Page:** a "See each step" row under the demo section. On phones it scrolls sideways, one tile per screen width.
- **Open for you:** keep Lina and Karim as the thread, or a neutral company with no faces?
