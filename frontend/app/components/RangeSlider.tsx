"use client";

/** Two native range inputs overlaid on one track: keyboard works, and the handles can't cross. */
export function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const [lo, hi] = value;
  const span = max - min || 1;
  const pct = (v: number) => ((v - min) / span) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="kalmus-text-muted">{label}</span>
        <span className="kalmus-text-secondary tabular-nums">
          {lo} – {hi}
        </span>
      </div>
      <div className="kalmus-input relative h-5">
        <div className="absolute top-1/2 h-px bg-[var(--input-text)] opacity-60" style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }} />
        <input
          type="range"
          className="kalmus-range"
          // Raised when both thumbs sit at the top, where the max input would cover it and nothing could move
          style={lo >= max - step ? { zIndex: 1 } : undefined}
          aria-label={`${label} minimum`}
          min={min}
          max={max}
          step={step}
          value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
        />
        <input
          type="range"
          className="kalmus-range"
          aria-label={`${label} maximum`}
          min={min}
          max={max}
          step={step}
          value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
        />
      </div>
    </div>
  );
}
