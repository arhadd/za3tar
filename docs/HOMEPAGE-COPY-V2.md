# za3tar.ai — homepage copy v2

2026-10-21. One page, one pitch, no live voice on the homepage.
Built in PR feat/homepage-v2. Close reworded after review: ask how the company should run instead of what eats the week.

---

## 1. Hero

**AI that runs inside your company.**

We put one AI teammate in the chat your team already uses. It learns your tools, your people and your rules, and it takes the repeat work off everyone's week. A person approves anything that matters before it goes out.

[ Tell us about your company → ]  (jumps to the box at the bottom)
[ Book a session ]  (WhatsApp)

> Other headlines, if the first one doesn't land:
> - "Your whole team, one AI teammate."
> - "The work your team repeats every week, done by an agent you trust."

---

## 2. What it is

**One teammate for the whole company.**

It lives in WhatsApp, Slack or Telegram, in English and Arabic. Anyone on the team can ask it something or hand it a job.

What one person teaches it, the next person gets. Your house rules become everyone's defaults. After a few months the company has dozens of small systems that nobody had to scope, hire for or wait on.

---

## 3. What it does in a normal week

Six cards. Each one is work we already run for clients today.

**Drafts in your house style**
Proposals, updates and replies, written from your own templates. Someone checks and sends.

**Numbers from the real system**
"What did we spend on events this month?" gets answered from your accounting or booking tool, with where each number came from.

**Meetings that turn into work**
Notes become tasks with owners and dates, and the teammate follows up when something slips.

**One page per project**
Every project gets a living page: status, people, files and what's next, updated from your tools.

**The weekly report, ready on Sunday**
It pulls the numbers, drafts the report and posts it once you say yes.

**Asks before the big stuff**
Money, clients, anything hard to undo: a person approves. Everything it does goes in a log.

---

## 4. Proof

**Already running.**

- An operations and events company runs on a company workspace in their chat: projects, clients, team, calendar, reporting, with a few dozen connected workflows.
- A food-and-beverage group with many locations has a teammate keeping their operations tooling running.
- A consumer brand runs product imagery and content through it.

We share names and walk-throughs in a session.

---

## 5. How we start

**A few weeks to the first job, then it grows.**

1. **Learn.** About two weeks with your team, mapping how the work really runs. You get one page of your business and a shortlist of what to fix first.
2. **Connect and build.** We link the tools you already use and set up the first jobs. You see a log of what each one did.
3. **Teach.** We work beside your team until they hand the teammate new jobs themselves, with a monthly review of what worked.

What we build is yours to keep: the agents, their instructions, your data.

---

## 6. Close

**How should your company run?**

Tell us your company and what a great week there looks like. We'll reply with what we'd build first.

[ Company name ]
[ On a great week, we… ]  (optional)
[ Send on WhatsApp → ]

Opens WhatsApp with your message ready. Nothing goes out until you press send.

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
