import type { PlateBalance } from "@/lib/types";

const SEGMENTS: { key: keyof PlateBalance; label: string; color: string }[] = [
  { key: "protein", label: "protein", color: "#3fd0bd" },
  { key: "veg", label: "veg", color: "#7fd78a" },
  { key: "grain", label: "grain", color: "#e0b57a" },
];

/** Small donut of the estimated plate split. Never shows calories or weights. */
export function PlateRing({ plate, size = 52 }: { plate: PlateBalance; size?: number }) {
  const r = 15.9155; // circumference = 100
  const pct = (n: number) => Math.round(n * 100);
  const description = `Estimated plate balance, from the dish style: about ${pct(plate.protein)}% protein, ${pct(plate.veg)}% veg, ${pct(plate.grain)}% grain.`;

  return (
    <figure className="flex flex-col items-center gap-1" role="img" aria-label={description}>
      <svg width={size} height={size} viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#2a2a2e" strokeWidth="6" />
        {SEGMENTS.map(({ key, color }, i) => {
          const value = Math.max(0, plate[key] * 100 - 2); // small gap between segments
          // Start at 12 o'clock, after the segments before this one.
          const offset = 25 - SEGMENTS.slice(0, i).reduce((sum, s) => sum + plate[s.key] * 100, 0);
          return (
            <circle
              key={key}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeDasharray={`${value} ${100 - value}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </svg>
      {/* Visible, so the colors aren't a mystery: it's a guess from the dish style. */}
      <figcaption aria-hidden="true" className="text-center text-[10px] leading-tight text-white/55">
        Plate balance
        <br />
        (estimate)
      </figcaption>
    </figure>
  );
}

export function PlateLegend({ plate }: { plate: PlateBalance }) {
  return (
    <ul className="flex gap-3 text-xs text-white/70" aria-hidden="true">
      {SEGMENTS.map(({ key, label, color }) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: color }} />
          {label}
          <span className="sr-only">{Math.round(plate[key] * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
