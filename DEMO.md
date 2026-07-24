# za3tar — the 3-minute live demo 🌿

The pitch is the product: **record the conversation you're already having.**
"The notes you just got? That's the product."

## Before you meet anyone (once)

```bash
cd ~/za3tar && npm run app     # boots in seconds (debug build is pre-warmed)
```

- `.env` already has the keys + `ZA3TAR_USER="Ala Haddad"`.
- In person you only need the mic — say yes to the mic prompt and you're live.
  (The system-audio grant only matters for calls; see capture/README.md.)

## The demo, beat by beat

1. **Title the meeting** — type who you're talking to ("coffee مع رانيا").
   Names help attribution.
2. **Hit record and just talk.** 2–3 minutes is enough. Mix Arabic and
   English naturally — that's the point. Make sure the conversation contains
   at least one real commitment with a day attached ("ببعتلك الـ proposal
   الخميس") — that's what lights up the actions panel.
3. **Hit stop and hand them the laptop.** Everything is automatic from here:
   transcript → notes → **what came out of it**. No clicks.
4. **Walk the outcome panel** (this is the part no notetaker does):
   - decisions ✅ — what was actually agreed
   - action items — owner chips (me / them / names), real dates resolved
     from "بكرا" and "الاثنين", tap-to-done
   - open questions ❓
5. **Execute in front of them:**
   - **💬 whatsapp follow-up** — a draft in *their* dialect mix appears;
     edit a word (shows it's editable), hit **open in WhatsApp** — it lands
     in WhatsApp ready to send to them. This is the wow moment.
   - **📅 add to Calendar** — the dated action items drop into Calendar.
   - Mention: recap email works the same; everything is saved locally,
     no bot joined anything, no cloud account.

## The one line that sells the ladder

> "Today it takes the notes and drafts the follow-up. The next rung is it
> *doing* the follow-up — opening the task, chasing the owner, inside your
> tools. Being in your meetings is how it earns that."

## If something's off

- **All one speaker in the transcript?** The other person spoke too little
  (diarization needs a few sentences per voice) — still fine, notes and
  actions don't depend on the split.
- **No actions extracted?** The chat had no commitments — that's honest
  behavior, it never invents tasks. Re-record with a real "I'll send you X
  by Y".
- **Notes/actions button instead of auto?** An API call failed (network) —
  the buttons retry the same step.
