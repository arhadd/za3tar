# za3tar.ai — homepage copy v2

2026-10-21. One page, one pitch, no live voice on the homepage.
Built in PR feat/homepage-v2. Reworded after review: ask how the company should run instead of what eats the week; we enable the team (same setup for everyone, the team decides what it does) instead of prescribing a build.

---

## 1. Hero

**AI that runs inside your company.**

Every company gets the same start: one AI teammate in the chat your team already uses, connected to the tools you already run. Then your team teaches it how the work really runs, because nobody knows that better than them.

[ Tell us about your company → ]  (jumps to the box at the bottom)
[ Book a session ]  (WhatsApp)

> Other headlines, if the first one doesn't land:
> - "Your whole team, one AI teammate."
> - "The work your team repeats every week, done by an agent you trust."

---

## 2. How it works (the Z breaks into these four)

**The same start for every company. Your team takes it from there.**

1. **Set up.** We put your teammate in your chat and train it on how your company talks and works. You get a teammate that knows your company from day one.
2. **Connect.** We link the tools you already use, so it works from the real numbers and nobody copies information by hand. You get every fact with where it came from.
3. **Try.** Your team brings real jobs from a normal week. We try them together, see what works and keep improving them with the people doing the work. You get jobs chosen and shaped by your own team.
4. **Own.** Your team hands it new jobs themselves, and changes the old ones when the work changes. You get a monthly session on what worked and what to try next.

What we build is yours to keep: the agents, their instructions, your data.

---

## 3. What it is

**One teammate for the whole company.**

It lives in WhatsApp, Slack or Telegram, in English and Arabic. Anyone on the team can ask it something, teach it something or hand it a job.

What one person teaches it, the next person gets. Your house rules become everyone's defaults. Over a few months your team builds dozens of small systems with it, one real job at a time.

---

## 4. What it does in a normal week

Here's what teams are already doing with theirs. Yours will find its own.

**Writes like your company**
Proposals, updates and replies, written from your templates and the way your team actually speaks. Someone checks and sends.

**Answers from real numbers**
"What did we spend on events this month?" gets answered from your accounting or booking tool, with the source behind every number.

**Turns meetings into work**
Notes become tasks with owners and dates. The teammate follows up and keeps the work moving.

**Keeps projects clear**
One living page per project: status, people, files and what happens next, updated from your tools.

**Gets Sunday ready**
It pulls the numbers, drafts the weekly report and puts it in the chat for your team to approve.

**Checks before it acts**
Money, clients and anything hard to undo go to a person first. Everything it does stays in the log.

---

## 5. Proof

**Already running.**

- An operations and events company runs on a company workspace in their chat: projects, clients, team, calendar, reporting, with a few dozen connected workflows.
- A food-and-beverage group with many locations has a teammate keeping their operations tooling running.
- A consumer brand runs product imagery and content through it.

We share names and walk-throughs in a session.

---

## 6. Close

**How should your company run?**

Tell us your company and what a great week there looks like. We'll get back to you to explore it with your team.

[ Company name ]
[ On a great week, we… ]  (optional)
[ Send on WhatsApp → ]

WhatsApp opens with your message ready. You read it and press send yourself.

Rather talk now? **Book a session →**

---

## Footer

za3tar · Dubai · WhatsApp · llms.txt

---

## Build notes (for after sign-off)

What changes on the page:
- **Removed:** live voice demo as the main call to action, the "Hey, I'm Za3tar…" block, "turn your sound on", "Try it on your company" in the nav.
- **Removed:** the Learn / Connect / Build / Teach grid near the top. It moves down to section 5 and shrinks to three steps.
- **Video:** the Lina & Karim story video comes off the homepage. It can come back later as a link if you still want it.
- **/demo stays live but unlinked from the homepage.** Send it to warm leads by hand until the voice is tuned.
- **PR #29** (team-adoption hero) gets replaced by section 1. Close it, or keep its share-card render script.
- **PR #27** (www redirect + analytics) ships in the same deploy.

Closing box: opens WhatsApp with the message pre-filled ("Hi za3tar, I'm from <company>. On a great week, we <…>"). No backend, no API spend, and it lands where you already reply. A leads table with a ping (like byjello.com's site chats) can come later if needed.

Also to update in the same deploy: the tab title, meta description, share card (og.png), JSON-LD description and llms.txt summary, so they match the new hero.
