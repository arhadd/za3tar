// Small primitives so the views share one vocabulary: a button with three
// weights, a chip, a card, a section eyebrow, a text field.
import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
} from "react";

type Tone = "primary" | "accent" | "quiet" | "ghost" | "danger";

const tones: Record<Tone, string> = {
  primary:
    "bg-ink text-limestone hover:bg-panel disabled:hover:bg-ink border border-ink",
  accent:
    "bg-thyme text-ink hover:bg-thyme-deep hover:text-limestone border border-thyme hover:border-thyme-deep",
  quiet:
    "bg-paper text-ink border border-line hover:border-ink/40 hover:bg-white",
  ghost:
    "bg-transparent text-olive hover:text-ink hover:bg-ink/5 border border-transparent",
  danger:
    "bg-transparent text-alert hover:bg-alert/10 border border-transparent",
};

export function Button({
  tone = "quiet",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  const pad =
    size === "sm"
      ? "px-2.5 py-1 text-[12px] rounded-md"
      : size === "lg"
        ? "px-5 py-3 text-[15px] rounded-xl"
        : "px-3.5 py-2 text-[13px] rounded-lg";
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-default disabled:opacity-50 ${pad} ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Chip({
  tone = "neutral",
  children,
  title,
  className = "",
}: {
  tone?: "neutral" | "accent" | "alert" | "olive" | "outline";
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const t = {
    neutral: "bg-ink/6 text-ink",
    accent: "bg-thyme text-ink",
    alert: "bg-alert/12 text-alert",
    olive: "bg-olive/15 text-olive",
    outline: "border border-line text-olive",
  }[tone];
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ${t} ${className}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-paper ${pad ? "p-4" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h3 className={`eyebrow text-olive ${className}`}>{children}</h3>;
}

export function Field(
  props: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean },
) {
  const { className = "", mono, ...rest } = props;
  return (
    <input
      {...rest}
      className={`min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-[13px] text-ink outline-none placeholder:text-olive/70 focus:border-ink ${
        mono ? "font-mono" : ""
      } ${className}`}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-olive">
      {children}
    </p>
  );
}

/** owner chips: me / them / a name */
export function ownerTone(owner: string): "accent" | "olive" | "neutral" {
  if (owner === "me") return "accent";
  if (owner.startsWith("them")) return "olive";
  return "neutral";
}
