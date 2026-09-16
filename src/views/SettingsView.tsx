import { Button, Card, Eyebrow, Field } from "../ui";
import type { Settings } from "../types";

export function SettingsView({
  form,
  onChange,
  onSave,
  onClose,
}: {
  form: Settings;
  onChange: (s: Settings) => void;
  onSave: () => void;
  onClose: () => void;
}) {
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
        <label className="flex flex-col gap-1 text-[12px] text-olive">
          your name (how the notes refer to you)
          <Field
            value={form.user_name}
            onChange={(e) => onChange({ ...form, user_name: e.target.value })}
            placeholder="e.g. Ala Haddad"
          />
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

      <div>
        <Button tone="primary" onClick={onSave}>
          save
        </Button>
      </div>
    </div>
  );
}
