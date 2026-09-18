// Setup. Not a card on a dashboard — the window, one thing at a time, until
// Za3tar knows enough to be useful. The arc: get in, say what you are working
// on, check what Za3tar understood, then feed it one real thing and watch it
// pull out the decisions and the actions. That last step is the whole point;
// a map of your work is a promise, the first extraction is the proof.
import { useEffect, useRef, useState } from "react";
import { Mark } from "../brand/Mark";
import { Button, Card, Chip, Eyebrow, Field } from "../ui";
import type { MeetingActions, Thread, Workspace } from "../types";

export type Step = "welcome" | "account" | "tell" | "review" | "first" | "done";

export type ChatBridge = {
  lines: { role: "you" | "za3tar" | "activity" | "error"; text: string }[];
  busy: boolean;
  send: (text: string) => void;
};

const OPENER =
  "Tell me what you are working on these days. Two or three things is plenty — a company, a project, something personal. Any language.";

export function Onboarding({
  step,
  setStep,
  caps,
  userName,
  onSignIn,
  onOpenSettings,
  chat,
  workspaces,
  threads,
  onRenameThread,
  onDeleteThread,
  onPaste,
  onRecord,
  onFinish,
  onSkip,
}: {
  step: Step;
  setStep: (s: Step) => void;
  caps: {
    transcription: boolean;
    notes: boolean;
    talk: boolean;
    hosted?: boolean;
  } | null;
  userName: string;
  onSignIn: (code: string, name: string) => Promise<void>;
  onOpenSettings: () => void;
  chat: ChatBridge;
  workspaces: Workspace[];
  threads: Thread[];
  onRenameThread: (t: Thread, title: string, summary: string) => Promise<void>;
  onDeleteThread: (t: Thread) => Promise<void>;
  onPaste: (
    workspace: string,
    title: string,
    text: string,
  ) => Promise<MeetingActions | null>;
  onRecord: () => void;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const ready = !!caps?.notes;

  return (
    <div className="flex h-full flex-col bg-limestone">
      <header className="flex items-center gap-2.5 px-8 pt-6 pb-2">
        <Mark size={20} className="text-ink" />
        <span className="wordmark text-[17px] leading-none">Za3tar</span>
        <span className="eyebrow ml-3 text-olive">Setting up</span>
        <button
          onClick={onSkip}
          className="ml-auto text-[12px] text-olive hover:text-ink"
        >
          skip setup
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-8 pb-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 pt-8">
          {step === "welcome" && (
            <Welcome onNext={() => setStep(ready ? "tell" : "account")} />
          )}
          {step === "account" && (
            <Account
              caps={caps}
              userName={userName}
              onSignIn={onSignIn}
              onOpenSettings={onOpenSettings}
              onNext={() => setStep("tell")}
            />
          )}
          {step === "tell" && (
            <Tell
              chat={chat}
              threads={threads}
              onNext={() => setStep("review")}
            />
          )}
          {step === "review" && (
            <Review
              workspaces={workspaces}
              threads={threads}
              onRename={onRenameThread}
              onDelete={onDeleteThread}
              onBack={() => setStep("tell")}
              onNext={() => setStep("first")}
            />
          )}
          {step === "first" && (
            <First
              workspaces={workspaces}
              caps={caps}
              onPaste={onPaste}
              onRecord={onRecord}
              onDone={() => setStep("done")}
            />
          )}
          {step === "done" && <Done userName={userName} onFinish={onFinish} />}
        </div>
      </main>

      <footer className="flex items-center gap-2 px-8 pb-6">
        {(["welcome", "account", "tell", "review", "first"] as Step[])
          .filter((s) => s !== "account" || !ready)
          .map((s) => (
            <span
              key={s}
              className={`h-1 flex-1 rounded-full ${
                order(step) >= order(s) ? "bg-ink" : "bg-ink/12"
              }`}
            />
          ))}
      </footer>
    </div>
  );
}

const order = (s: Step) =>
  ["welcome", "account", "tell", "review", "first", "done"].indexOf(s);

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <div className="flex flex-col gap-3">
        <h1 className="display text-[34px] leading-tight">
          Za3tar keeps up with the work you are already doing.
        </h1>
        <p className="max-w-xl text-[16px] leading-relaxed text-olive">
          Record a meeting or paste a thread. Za3tar writes the notes, pulls out
          what was decided and who owes what, and files it against the thing it
          belongs to. Then it helps you act on it: draft the message, chase the
          person, tell you where something stands.
        </p>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5">
        <Eyebrow>Three minutes from here</Eyebrow>
        <ol className="flex flex-col gap-1.5 text-[14px] text-ink">
          <li>1. Say what you are working on. Za3tar sets up the rest.</li>
          <li>2. Check it understood you.</li>
          <li>3. Give it one real thing and see what it pulls out.</li>
        </ol>
      </div>
      <div>
        <Button tone="primary" size="lg" onClick={onNext}>
          Start
        </Button>
      </div>
    </div>
  );
}

function Account({
  caps,
  userName,
  onSignIn,
  onOpenSettings,
  onNext,
}: {
  caps: { notes: boolean } | null;
  userName: string;
  onSignIn: (code: string, name: string) => Promise<void>;
  onOpenSettings: () => void;
  onNext: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState(userName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (caps?.notes) onNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps?.notes]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="display text-[26px] leading-tight">
        First, how should it run?
      </h1>
      <Card className="flex flex-col gap-3">
        <Eyebrow>Sign in with Za3tar</Eyebrow>
        <p className="text-[13px] leading-relaxed text-olive">
          An invite code and it works — transcription, notes and voice run
          through Za3tar. Nothing to configure.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!code.trim()) return;
            setBusy(true);
            setErr("");
            try {
              await onSignIn(code.trim(), name.trim());
            } catch (e2) {
              setErr(String(e2));
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-wrap gap-2"
        >
          <Field
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="invite code"
            className="w-52"
            mono
            autoFocus
          />
          <Field
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="your name"
            className="w-44"
          />
          <Button
            tone="primary"
            size="sm"
            type="submit"
            disabled={busy || !code.trim()}
          >
            {busy ? "signing in…" : "sign in"}
          </Button>
        </form>
        {err && <p className="text-[12px] text-alert">{err}</p>}
      </Card>
      <Card className="flex flex-col gap-3">
        <Eyebrow>Use your own keys</Eyebrow>
        <p className="text-[13px] leading-relaxed text-olive">
          An ElevenLabs key for transcription and an Anthropic key for notes.
          Nothing leaves this Mac except to those providers.
        </p>
        <Button
          tone="quiet"
          size="sm"
          className="self-start"
          onClick={onOpenSettings}
        >
          open Settings
        </Button>
      </Card>
    </div>
  );
}

function Tell({
  chat,
  threads,
  onNext,
}: {
  chat: ChatBridge;
  threads: Thread[];
  onNext: () => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [chat.lines.length, chat.busy]);
  const said = chat.lines.some((l) => l.role === "you");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[26px] leading-tight">
        What are you working on?
      </h1>
      <p className="text-[14px] leading-relaxed text-olive">
        Say it the way you would to a person. Two or three things is plenty.
        Za3tar will set up the rest as you talk.
      </p>

      <div className="flex min-h-[220px] flex-col gap-2 rounded-xl border border-line bg-paper p-4">
        {chat.lines.length === 0 && (
          <p className="text-[14px] leading-relaxed text-olive">{OPENER}</p>
        )}
        {chat.lines.map((l, i) =>
          l.role === "activity" || l.role === "error" ? (
            <span
              key={i}
              className={`px-1 text-[12px] ${l.role === "error" ? "text-alert" : "text-olive"}`}
            >
              {l.role === "error" ? "⚠ " : "→ "}
              {l.text}
            </span>
          ) : (
            <p
              key={i}
              dir="auto"
              className={`arabic selectable max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-start text-[14px] leading-relaxed ${
                l.role === "you"
                  ? "self-end bg-ink text-limestone"
                  : "self-start bg-ink/5"
              }`}
            >
              {l.text}
            </p>
          ),
        )}
        {chat.busy && (
          <span className="px-1 text-[12px] text-olive">thinking…</span>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || chat.busy) return;
          chat.send(text.trim());
          setText("");
        }}
        className="flex gap-2"
      >
        <textarea
          dir="auto"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !chat.busy) {
                chat.send(text.trim());
                setText("");
              }
            }
          }}
          rows={2}
          placeholder="e.g. I run a studio with two clients, I'm building a house, and I have a trip to plan"
          className="arabic flex-1 resize-none rounded-lg border border-line bg-white px-3 py-2 text-start text-[14px] outline-none focus:border-ink"
        />
        <Button
          tone="primary"
          size="sm"
          type="submit"
          disabled={chat.busy || !text.trim()}
        >
          send
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Button
          tone={threads.length ? "primary" : "quiet"}
          onClick={onNext}
          disabled={!said && !threads.length}
        >
          {threads.length ? "that's everything" : "skip this"}
        </Button>
        {threads.length > 0 && (
          <span className="text-[12px] text-olive">
            {threads.length} thing{threads.length === 1 ? "" : "s"} set up so
            far
          </span>
        )}
      </div>
    </div>
  );
}

function Review({
  workspaces,
  threads,
  onRename,
  onDelete,
  onBack,
  onNext,
}: {
  workspaces: Workspace[];
  threads: Thread[];
  onRename: (t: Thread, title: string, summary: string) => Promise<void>;
  onDelete: (t: Thread) => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const used = workspaces.filter((w) =>
    threads.some((t) => t.workspace === w.id),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[26px] leading-tight">
        This is what I understood.
      </h1>
      <p className="text-[14px] leading-relaxed text-olive">
        Each of these is a thread: something in motion, with a line saying where
        it stands. Fix anything that is off — meetings and messages will file
        themselves against these.
      </p>

      {used.length === 0 && (
        <Card className="text-[14px] text-olive">
          Nothing set up yet. Go back and tell Za3tar what you are working on,
          or skip and do it later.
        </Card>
      )}

      {used.map((w) => (
        <div key={w.id} className="flex flex-col gap-2">
          <Eyebrow className="px-1">{w.name}</Eyebrow>
          {threads
            .filter((t) => t.workspace === w.id)
            .map((t) =>
              editing === t.id ? (
                <form
                  key={t.id}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await onRename(t, title, summary);
                    setEditing(null);
                  }}
                  className="flex flex-col gap-2 rounded-xl border border-ink/40 bg-paper p-4"
                >
                  <Field
                    dir="auto"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="arabic text-[15px] font-medium"
                    autoFocus
                  />
                  <textarea
                    dir="auto"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={2}
                    placeholder="where it stands today"
                    className="arabic resize-none rounded-lg border border-line bg-white px-3 py-2 text-start text-[13px] outline-none focus:border-ink"
                  />
                  <div className="flex gap-2">
                    <Button tone="primary" size="sm" type="submit">
                      save
                    </Button>
                    <Button
                      tone="ghost"
                      size="sm"
                      type="button"
                      onClick={() => setEditing(null)}
                    >
                      cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div
                  key={t.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-paper p-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span
                      dir="auto"
                      className="arabic text-start text-[15px] font-medium"
                    >
                      {t.title}
                    </span>
                    <span
                      dir="auto"
                      className={`arabic text-start text-[13px] ${t.summary ? "text-olive" : "text-olive/60"}`}
                    >
                      {t.summary || "no state line yet"}
                    </span>
                  </div>
                  {t.owner && <Chip tone="outline">{t.owner}</Chip>}
                  <Button
                    tone="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(t.id);
                      setTitle(t.title);
                      setSummary(t.summary);
                    }}
                  >
                    edit
                  </Button>
                  <Button tone="danger" size="sm" onClick={() => onDelete(t)}>
                    remove
                  </Button>
                </div>
              ),
            )}
        </div>
      ))}

      <div className="flex gap-2">
        <Button tone="primary" onClick={onNext}>
          looks right
        </Button>
        <Button tone="ghost" onClick={onBack}>
          tell it more
        </Button>
      </div>
    </div>
  );
}

function First({
  workspaces,
  caps,
  onPaste,
  onRecord,
  onDone,
}: {
  workspaces: Workspace[];
  caps: { transcription: boolean } | null;
  onPaste: (
    workspace: string,
    title: string,
    text: string,
  ) => Promise<MeetingActions | null>;
  onRecord: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [ws, setWs] = useState(workspaces[0]?.id ?? "personal");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<MeetingActions | null>(null);

  if (out) {
    const open = out.actions.filter((a) => !a.done);
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display text-[26px] leading-tight">That's the loop.</h1>
        <p className="text-[14px] leading-relaxed text-olive">
          Za3tar read it and pulled this out. It is filed, and anything owed is
          now on your Home. A recorded meeting does the same thing, without the
          pasting.
        </p>
        {out.decisions.length > 0 && (
          <Card pad={false} className="p-3">
            <Eyebrow className="px-1 pb-1">Decisions</Eyebrow>
            {out.decisions.map((d) => (
              <p
                key={d.id}
                dir="auto"
                className="arabic px-1 py-1 text-start text-[14px]"
              >
                {d.text}
              </p>
            ))}
          </Card>
        )}
        {open.length > 0 && (
          <Card pad={false} className="p-3">
            <Eyebrow className="px-1 pb-1">Who owes what</Eyebrow>
            {open.map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-1 py-1">
                <span
                  dir="auto"
                  className="arabic min-w-0 flex-1 text-start text-[14px]"
                >
                  {a.title}
                </span>
                {(a.due_label || a.due_date) && (
                  <Chip tone="outline">{a.due_label || a.due_date}</Chip>
                )}
                <Chip tone="accent">{a.owner}</Chip>
              </div>
            ))}
          </Card>
        )}
        {out.questions.length > 0 && (
          <Card pad={false} className="p-3">
            <Eyebrow className="px-1 pb-1">Still open</Eyebrow>
            {out.questions.map((q, i) => (
              <p
                key={i}
                dir="auto"
                className="arabic px-1 py-1 text-start text-[14px]"
              >
                {q}
              </p>
            ))}
          </Card>
        )}
        {out.decisions.length === 0 && open.length === 0 && (
          <Card className="text-[14px] text-olive">
            Nothing definite in that one — no decisions, nothing owed. It is
            filed either way.
          </Card>
        )}
        <div>
          <Button tone="primary" size="lg" onClick={onDone}>
            done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-[26px] leading-tight">
        Now give it one real thing.
      </h1>
      <p className="text-[14px] leading-relaxed text-olive">
        Paste a WhatsApp thread, an email, or your own notes from a recent
        conversation. Za3tar will read it and show you what it found.
      </p>

      <div className="flex flex-wrap gap-2">
        <Field
          dir="auto"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="what was it about?"
          className="arabic flex-1"
        />
        <select
          value={ws}
          onChange={(e) => setWs(e.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        dir="auto"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={9}
        placeholder="paste it here"
        className="arabic resize-none rounded-lg border border-line bg-white p-3 text-start text-[14px] leading-relaxed outline-none focus:border-ink"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          disabled={busy || !text.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await onPaste(
                ws,
                title.trim() || "First thing",
                text.trim(),
              );
              setOut(r ?? { decisions: [], actions: [], questions: [] });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "reading it…" : "see what it finds"}
        </Button>
        {caps?.transcription && (
          <Button
            tone="quiet"
            onClick={() => {
              onRecord();
              onDone();
            }}
          >
            record a meeting instead
          </Button>
        )}
        <Button tone="ghost" onClick={onDone}>
          later
        </Button>
      </div>
    </div>
  );
}

function Done({
  userName,
  onFinish,
}: {
  userName: string;
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 pt-6">
      <h1 className="display text-[30px] leading-tight">
        You're set{userName ? `, ${userName.split(" ")[0]}` : ""}.
      </h1>
      <p className="max-w-xl text-[15px] leading-relaxed text-olive">
        Home shows what is in motion and what needs you. Ask it anything in the
        box at the top — where something stands, what is on you, or to write a
        message. Record a meeting and it lands in the right place on its own.
      </p>
      <div>
        <Button tone="primary" size="lg" onClick={onFinish}>
          open Za3tar
        </Button>
      </div>
    </div>
  );
}
