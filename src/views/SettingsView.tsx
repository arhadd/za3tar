import { useState } from "react";
import { Button, Card, Eyebrow, Field } from "../ui";
import type { Settings } from "../types";
import type { Route } from "../routes";

export function SettingsView({
  form,
  onChange,
  onSave,
  onClose,
  routes,
  onRoutes,
  hosted,
  onSignIn,
  onSignOut,
  onRerunSetup,
}: {
  onRerunSetup: () => void;
  hosted: boolean;
  onSignIn: (code: string, name: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  form: Settings;
  onChange: (s: Settings) => void;
  onSave: () => void;
  onClose: () => void;
  routes: Route[];
  onRoutes: (r: Route[]) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const setRoute = (i: number, patch: Partial<Route>) =>
    onRoutes(routes.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <div className="flex items-baseline gap-2 px-1">
        <Eyebrow>Settings</Eyebrow>
        <span className="text-[12px] text-olive">
          stored on this Mac, applied immediately
        </span>
        <Button tone="ghost" size="sm" className="ml-auto" onClick={onClose}>
          close
        </Button>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Za3tar account</Eyebrow>
          <p className="text-[12px] leading-relaxed text-olive">
            {hosted
              ? "Signed in. Transcription, notes and Talk run through Za3tar's own keys and are metered monthly. Your own keys below are ignored while signed in."
              : "Not signed in. Sign in with an invite code to run through Za3tar's keys, or fill in your own keys below."}
          </p>
        </div>
        {hosted ? (
          <Button tone="quiet" size="sm" className="self-start" onClick={onSignOut}>
            sign out
          </Button>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!code.trim()) return;
              await onSignIn(code.trim(), name.trim() || form.user_name);
              setCode("");
            }}
            className="flex flex-wrap gap-2"
          >
            <Field value={code} onChange={(e) => setCode(e.target.value)} placeholder="invite code" className="w-48" mono />
            <Field value={name} onChange={(e) => setName(e.target.value)} placeholder="your name" className="w-40" />
            <Button tone="primary" size="sm" type="submit" disabled={!code.trim()}>
              sign in
            </Button>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          your name (how the notes refer to you)
          <Field
            value={form.user_name}
            onChange={(e) => onChange({ ...form, user_name: e.target.value })}
            placeholder="e.g. Ala Haddad"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          what Za3tar writes in (it understands Arabic, English and mixed either way)
          <select
            value={form.language || "english"}
            onChange={(e) => onChange({ ...form, language: e.target.value })}
            className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="english">English</option>
            <option value="match">Match the conversation</option>
            <option value="arabic">Arabic</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          ElevenLabs API key (transcription)
          <Field
            type="password"
            value={form.elevenlabs_api_key}
            onChange={(e) =>
              onChange({ ...form, elevenlabs_api_key: e.target.value })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          OpenAI API key (Talk — voice)
          <Field
            type="password"
            value={form.openai_api_key}
            onChange={(e) => onChange({ ...form, openai_api_key: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          Anthropic API key (notes, decisions, drafts)
          <Field
            type="password"
            value={form.anthropic_api_key}
            onChange={(e) =>
              onChange({ ...form, anthropic_api_key: e.target.value })
            }
          />
        </label>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Za3tar runtime</Eyebrow>
          <p className="text-[12px] leading-relaxed text-olive">
            Optional. A command Za3tar uses to do work outside this Mac: put
            dated items on your calendar, deliver a follow-up, and report back
            on what moved. Any command that takes the message as its final
            argument and prints the reply works. Nothing runs without a click in
            the app. See docs/AGENT-PROTOCOL.md.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          runtime command
          <Field
            mono
            value={form.agent_command}
            onChange={(e) =>
              onChange({ ...form, agent_command: e.target.value })
            }
            placeholder="e.g. ~/bin/za3tar-runtime"
          />
        </label>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Hands</Eyebrow>
          <p className="text-[12px] leading-relaxed text-olive">
            Other agents Za3tar can hand work to. An ACP route is a command that
            speaks the Agent Client Protocol on stdin/stdout (for example
            Hermes with <code className="font-mono">acp</code>); a oneshot route
            takes the message as its last argument and prints the reply.
          </p>
        </div>
        {routes.map((r, i) => (
          <div key={r.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) => setRoute(i, { enabled: e.target.checked })}
                />
                <Field
                  value={r.label}
                  onChange={(e) => setRoute(i, { label: e.target.value })}
                  className="w-36"
                />
              </label>
              <select
                value={r.kind}
                onChange={(e) => setRoute(i, { kind: e.target.value as Route["kind"] })}
                className="rounded-lg border border-line bg-white px-2 py-2 text-[12px] outline-none focus:border-ink"
              >
                <option value="acp">acp</option>
                <option value="oneshot">oneshot</option>
              </select>
              <span className="text-[11px] text-olive">id {r.id}</span>
              <Button
                tone="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => onRoutes(routes.filter((_, j) => j !== i))}
              >
                remove
              </Button>
            </div>
            <Field
              value={r.description}
              onChange={(e) => setRoute(i, { description: e.target.value })}
              placeholder="one line: when should Za3tar hand work to this?"
            />
            <Field
              mono
              value={r.command}
              onChange={(e) => setRoute(i, { command: e.target.value })}
              placeholder="command"
            />
            {r.kind === "acp" && (
              <Field
                mono
                value={r.cwd}
                onChange={(e) => setRoute(i, { cwd: e.target.value })}
                placeholder="working directory on the agent's side (optional)"
              />
            )}
          </div>
        ))}
        <Button
          tone="quiet"
          size="sm"
          className="self-start"
          onClick={() =>
            onRoutes([
              ...routes,
              {
                id: `route-${routes.length + 1}`,
                label: "New route",
                description: "",
                kind: "oneshot",
                command: "",
                cwd: "",
                enabled: false,
              },
            ])
          }
        >
          + route
        </Button>
      </Card>

      <div className="flex items-center gap-3">
        <Button tone="primary" onClick={onSave}>
          save
        </Button>
        <Button tone="ghost" size="sm" onClick={onRerunSetup}>
          run setup again
        </Button>
      </div>
    </div>
  );
}
