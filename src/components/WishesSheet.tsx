"use client";

import { useState, type ReactNode } from "react";
import type { Wish } from "@/lib/wishes";

export const EMPTY_WISH: Wish = { price: null, reach: null, crave: [] };

/**
 * "What would work for you?": budget, distance and up to three food words from a fixed list
 * (no typing, so a room never holds typed text). The group sees only a nameless summary.
 * Used on its own (people joining) and inside the host's invite sheet.
 */
export function WishesForm({ value, onChange, cravings, compact }: { value: Wish; onChange: (w: Wish) => void; cravings: string[]; compact?: boolean }) {
  const chip = (on: boolean) =>
    `${compact ? "h-10 px-3.5" : "h-11 px-4"} rounded-full text-sm font-semibold transition active:scale-95 ${on ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/15"}`;
  const toggleCrave = (c: string) =>
    onChange({ ...value, crave: value.crave.includes(c) ? value.crave.filter((x) => x !== c) : value.crave.length >= 3 ? value.crave : [...value.crave, c] });
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-white/80">Budget</legend>
        <div className="flex flex-wrap gap-2">
          {([1, 2, 3] as const).map((p) => (
            <button key={p} type="button" aria-pressed={value.price === p} onClick={() => onChange({ ...value, price: value.price === p ? null : p })} className={chip(value.price === p)}>
              {"$".repeat(p)}
              <span className="sr-only"> or less</span>
            </button>
          ))}
          <button type="button" aria-pressed={value.price === null} onClick={() => onChange({ ...value, price: null })} className={chip(value.price === null)}>
            Any
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-white/80">How far</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={value.reach === "walk"} onClick={() => onChange({ ...value, reach: "walk" })} className={chip(value.reach === "walk")}>
            Walking distance
          </button>
          <button type="button" aria-pressed={value.reach === "drive"} onClick={() => onChange({ ...value, reach: "drive" })} className={chip(value.reach === "drive")}>
            A short drive is fine
          </button>
          <button type="button" aria-pressed={value.reach === null} onClick={() => onChange({ ...value, reach: null })} className={chip(value.reach === null)}>
            Either
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-white/80">
          In the mood for <span className="font-normal text-white/55">(up to 3)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {cravings.map((c) => (
            <button key={c} type="button" aria-pressed={value.crave.includes(c)} onClick={() => toggleCrave(c)} className={chip(value.crave.includes(c))}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * The same choices as a sheet, for people joining a group, and the one place in a group for
 * everything about what you want: wishes, plus (as `children`) what you eat and asking the
 * group for something different.
 */
export function WishesSheet({
  cravings,
  initial,
  onSave,
  onSkip,
  children,
}: {
  cravings: string[];
  initial?: Wish | null;
  onSave: (w: Wish) => void;
  onSkip: () => void;
  children?: ReactNode;
}) {
  const [wish, setWish] = useState<Wish>(initial ?? EMPTY_WISH);
  return (
    <div className="relative z-40 h-0">
      <button type="button" aria-label="Skip wishes" tabIndex={-1} onClick={onSkip} className="fixed inset-0 -z-10 cursor-default bg-black/60" />
      <section
        role="dialog"
        aria-labelledby="wishes-title"
        className="animate-rise absolute inset-x-3 top-2 max-h-[calc(100dvh-5rem)] space-y-4 overflow-y-auto rounded-3xl bg-ink-3 p-5 shadow-2xl ring-1 ring-white/10"
      >
        <div>
          <h2 id="wishes-title" className="font-display text-xl font-bold">
            What would work for you?
          </h2>
          <p className="text-sm text-white/70">A few taps. The group only sees everyone&apos;s wishes together, never whose.</p>
        </div>
        <WishesForm value={wish} onChange={setWish} cravings={cravings} />
        {children}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => onSave(wish)} className="h-12 flex-1 rounded-full bg-social font-semibold text-white">
            Done
          </button>
          <button type="button" onClick={onSkip} className="h-12 rounded-full px-5 font-semibold text-white/70 hover:text-white">
            Skip
          </button>
        </div>
      </section>
    </div>
  );
}
