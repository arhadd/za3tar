// Try Jev (TypeSafe "System One" model) on a Za3tar-shaped decision.
// Usage: TYPESAFE_API_KEY=... node try-jev.mjs ["your own message text"]
// Docs: https://docs.typesafe.ai/introduction/quickstart

const key = process.env.TYPESAFE_API_KEY;
if (!key) {
  console.error(
    "TYPESAFE_API_KEY not set. Get one at https://console.typesafe.ai/keys",
  );
  process.exit(1);
}

const message =
  process.argv[2] ??
  "Hey, Lina says the hotel still hasn't confirmed the room block for the gala. The venue wants an answer on the stage timing by Thursday or they release the second hall. Can you call them tomorrow?";

// A fictional events company, the same one the site demo uses.
const workspaces = {
  gala: "Madar Events: the annual gala (venue, hotel room block, stage, catering). People: Lina (producer), Sami (venue manager)",
  retreat: "Madar Events: the spring team retreat (travel, rooms, agenda)",
  sales: "Madar Events: new client pitches and proposals",
  finance: "Madar Events: invoices, budgets, supplier payments",
  hiring: "Madar Events: open roles and interviews",
  personal: "Personal: health, admin, appointments",
  unknown: null,
};

const body = {
  model: "jev-latest",
  state: {
    message,
    sender: "Sami (WhatsApp)",
    today: new Date().toISOString().slice(0, 10),
  },
  questions: {
    workspace: {
      type: "choice",
      instructions:
        "Which workspace does `message` belong to? Pick unknown if the message does not say enough to tell.",
      criteria: workspaces,
    },
    urgency: {
      type: "score",
      instructions: "How time-sensitive is `message` for the app user?",
      criteria: [
        "No deadline; informational",
        "Should be handled this week",
        "Needs action within a day",
        "Needs action right now",
      ],
    },
    asks_something_of_me: {
      type: "noul",
      instructions: "`message` asks the app user to do something",
    },
    contains_decision: {
      type: "noul",
      instructions: "`message` records a decision that has already been made",
    },
    waiting_on_others: {
      type: "noul",
      instructions:
        "`message` describes something blocked on a third party, not on the app user",
    },
  },
};

const t0 = performance.now();
const r = await fetch("https://api.typesafe.ai/v1/systemone", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});
const ms = Math.round(performance.now() - t0);
const json = await r.json().catch(() => ({}));

if (!r.ok) {
  console.error(`HTTP ${r.status} in ${ms} ms:`, JSON.stringify(json, null, 2));
  process.exit(1);
}

console.log(
  `model ${json.model} · ${ms} ms · ${json.usage?.input_tokens} in / ${json.usage?.output_tokens} out\n`,
);
console.log("message:", message, "\n");
for (const [name, a] of Object.entries(json.answers)) {
  if (a.type === "choice")
    console.log(`${name.padEnd(22)} ${a.choice}  (conf ${a.confidence})`);
  else if (a.type === "score") {
    const level = Math.round(a.score);
    console.log(
      `${name.padEnd(22)} ${a.score.toFixed(2)} ≈ ${level}: ${a.legend?.[level]}  (conf ${a.confidence})`,
    );
  } else console.log(`${name.padEnd(22)} ${(a.noul * 100).toFixed(0)}% yes`);
}
