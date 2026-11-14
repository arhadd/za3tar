// The guided walk-through at za3tar.ai/app.
//
// It is not a video: it drives the real interface. Each beat moves a pointer
// to an element the app actually rendered, clicks it, and says one line about
// what just happened. So what a visitor watches is the app working, and the
// moment they touch anything it stops and hands over — no "exit demo" wall
// between watching and trying.
//
// Beats address elements by `data-tour`, never by class or position, so a
// restyle doesn't silently break the walk-through: a beat whose element never
// appears is skipped and the rest carries on.
import { useEffect, useRef, useState } from "react";

type Beat = {
  /** the one line said while this beat plays */
  say: string;
  /** data-tour value to click */
  click?: string;
  /** data-tour value to move the pointer to without clicking */
  point?: string;
  /** how long the line stays up, in ms */
  hold?: number;
};

const BEATS: Beat[] = [
  {
    say: "This is Za3tar: everything your company is doing, in one place.",
    hold: 3200,
  },
  {
    point: "needs-you",
    say: "You open it and the work is already done. What is left is what needs you.",
    hold: 4000,
  },
  {
    click: "ws-madar",
    say: "A workspace per part of the business — its own projects, people and decisions.",
    hold: 3800,
  },
  {
    say: "Every project carries one line on where it stands, so you can read the week in a minute.",
    hold: 4200,
  },
  {
    click: "nav-meetings",
    say: "Meetings are the main way work gets in.",
    hold: 2800,
  },
  {
    click: "meeting-first",
    say: "Talk normally. The decisions, the to-dos and who owns them come out the other side.",
    hold: 4400,
  },
  {
    click: "record",
    say: "Recording puts no bot in the call: your microphone and their side, both on this Mac.",
    hold: 3800,
  },
  {
    click: "record",
    say: "Stop, and the rest happens without you — in Arabic, English, or the mix you actually spoke.",
    hold: 5000,
  },
  {
    click: "nav-todos",
    say: "And everything still open, across every workspace, with who owes it.",
    hold: 4000,
  },
  {
    say: "Your turn — click anywhere. It is a made-up company, and nothing is saved.",
    hold: 6000,
  },
];

const find = (name: string) =>
  document.querySelector<HTMLElement>(`[data-tour="${name}"]`);

/** Wait for a beat's element, since the click before it may still be rendering. */
async function waitFor(name: string, ms = 2500) {
  const until = Date.now() + ms;
  for (;;) {
    const el = find(name);
    if (el) return el;
    if (Date.now() > until) return null;
    await new Promise((r) => setTimeout(r, 80));
  }
}

export function Tour({
  onEnd,
  quiet = false,
}: {
  onEnd: () => void;
  /** framed on another page: nobody can click "skip", so don't offer it */
  quiet?: boolean;
}) {
  const [say, setSay] = useState("");
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [down, setDown] = useState(false);
  const [step, setStep] = useState(0);
  const live = useRef(true);
  // App re-renders often (the live feed alone pings every few seconds), and a
  // fresh onEnd each time would otherwise tear this effect down mid-beat and
  // kill the walk-through. Hold it in a ref and run the effects once.
  const end = useRef(onEnd);
  end.current = onEnd;

  // the visitor touching anything ends the walk-through, mid-sentence if need be
  useEffect(() => {
    const stop = () => {
      if (!live.current) return;
      live.current = false;
      end.current();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") stop();
    };
    window.addEventListener("pointerdown", stop);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", keys);
    };
  }, []);

  useEffect(() => {
    const sleep = (ms: number) =>
      new Promise((r) => setTimeout(r, ms)) as Promise<void>;

    live.current = true;
    (async () => {
      await sleep(900);
      for (let i = 0; i < BEATS.length && live.current; i++) {
        const b = BEATS[i];
        setStep(i);
        const target = b.click ?? b.point;
        if (target) {
          const el = await waitFor(target);
          if (!live.current) return;
          if (!el) {
            // the app didn't render it: say the line anyway and move on
            setSay(b.say);
            await sleep(b.hold ?? 3000);
            continue;
          }
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          await sleep(320);
          const r = el.getBoundingClientRect();
          setAt({
            x: r.left + Math.min(r.width / 2, 120),
            y: r.top + r.height / 2,
          });
          await sleep(700);
          if (!live.current) return;
          if (b.click) {
            setDown(true);
            await sleep(140);
            setDown(false);
            el.click();
            await sleep(420);
          }
        }
        if (!live.current) return;
        setSay(b.say);
        await sleep(b.hold ?? 3000);
        setSay("");
        await sleep(220);
      }
      if (live.current) {
        live.current = false;
        end.current();
      }
    })();

    return () => {
      live.current = false;
    };
  }, []);

  return (
    <>
      {/* the pointer: it only ever sits where the app put something */}
      {at && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] transition-[left,top] duration-700 ease-out"
          style={{
            left: at.x,
            top: at.y,
            transform: down ? "scale(0.82)" : "scale(1)",
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path
              d="M5 3l14 8.5-6.2 1.3L9.5 20z"
              fill="#0b1710"
              stroke="#f2eee2"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* what is being said, and the way out */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4">
        <div
          className={`flex max-w-[min(640px,92vw)] items-center gap-3 rounded-xl bg-ink px-4 py-3 text-limestone shadow-lg transition-opacity duration-300 ${
            say ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="flex shrink-0 gap-1" aria-hidden>
            {BEATS.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-1 rounded-full ${
                  i <= step ? "bg-thyme" : "bg-limestone/25"
                }`}
              />
            ))}
          </span>
          <p dir="auto" className="text-[13px] leading-snug">
            {say}
          </p>
          {!quiet && (
            <button
              onClick={() => {
                live.current = false;
                end.current();
              }}
              className="pointer-events-auto ml-auto shrink-0 rounded-md px-2 py-1 text-[12px] text-limestone/60 hover:text-thyme"
            >
              skip
            </button>
          )}
        </div>
      </div>
    </>
  );
}
