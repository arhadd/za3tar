// A minimal markdown renderer for the notes subset we emit: H2 headings,
// bullet lists, and **bold**. Avoids pulling in a markdown dependency.
import { Fragment, type ReactNode } from "react";

function inline(text: string): ReactNode[] {
  // split on **bold** spans
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    return m ? (
      <strong key={i} className="font-semibold text-ink">
        {m[1]}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

export function MarkdownLite({ md }: { md: string }) {
  const lines = md.split("\n");
  const out: ReactNode[] = [];
  let bullets: ReactNode[] = [];

  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul-${out.length}`} className="mb-3 list-disc ps-5">
          {bullets}
        </ul>,
      );
      bullets = [];
    }
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      flush();
      out.push(
        <h3
          key={i}
          dir="auto"
          className="mb-1 mt-3 text-start text-[12px] font-semibold uppercase tracking-wide text-olive first:mt-0"
        >
          {inline(line.replace(/^##\s+/, ""))}
        </h3>,
      );
    } else if (/^[-*]\s+/.test(line)) {
      bullets.push(
        <li key={i} dir="auto" className="text-start">
          {inline(line.replace(/^[-*]\s+/, ""))}
        </li>,
      );
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      out.push(
        <p key={i} dir="auto" className="mb-2 text-start">
          {inline(line)}
        </p>,
      );
    }
  });
  flush();
  return <>{out}</>;
}
