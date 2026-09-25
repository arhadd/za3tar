// The Za3tar mark — geometry verbatim from BRAND.md (round 10b, heavy 44).
// Bars follow `currentColor` so the same component sits on limestone (ink)
// and on the dark panel (limestone); the leaf and dot stay fresh thyme.
// Scale only: never restroke, rotate, or separate the dot from the top bar.

export function Mark({
  size = 24,
  leaf = "#C6DE3E",
  className,
}: {
  size?: number;
  leaf?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="56 14 134 134"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id="za-ct">
          <path d="M0 0H190V14C147.2 88 102 128 56 148L0 200Z" />
        </clipPath>
        <clipPath id="za-cb">
          <path d="M56 148C150 140 195.4 96 190 14H200V200H56Z" />
        </clipPath>
      </defs>
      <rect
        x="56"
        y="14"
        width="134"
        height="44"
        fill="currentColor"
        clipPath="url(#za-ct)"
      />
      <rect
        x="56"
        y="104"
        width="134"
        height="44"
        fill="currentColor"
        clipPath="url(#za-cb)"
      />
      <path
        d="M190 14C195.4 96 150 140 56 148C102 128 147.2 88 190 14Z"
        fill={leaf}
      />
      <circle cx="126" cy="36" r="11" fill={leaf} />
    </svg>
  );
}
