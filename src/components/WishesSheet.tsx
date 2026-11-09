"use client";

import { useState } from "react";
import type { Wish } from "@/lib/wishes";

/**
 * "What would work for you?": a few taps when joining a Hunt together. Budget, distance and
 * up to three food words from a fixed list (no typing, so a room never holds typed text).
 * The group sees only a nameless summary; the host's phone adds places that fit everyone.
 */
export function WishesSheet({ cravings, initial, onSave, onSkip }: { cravings: string[]; initial?: Wish | null; onSave: (w: Wish) => void; onSkip: () => void }) {
  const [price, setPrice] = useState<Wish["price"]>(initial?.price ?? null);
  const [reach, setReach] = useState<Wish["reach"]>(initial?.reach ?? null);
  const [crave, setCrave] = useState<string[]>(initial?.crave ?? []);
  const chip = (on: boolean) =>
    `h-11 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${on ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/15"}`;
  const toggleCrave = (c: string) => setCrave((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : cs.length >= 3 ? cs : [...cs, c]));

  return (
    <div className="relative z-40 h-0">
      <button type="button" aria-label="Skip wishes" tabIndex={-1} onClick={onSkip} className="fixed inset-0 -z-10 cursor-default bg-black/60" />
      <section role="dialog" aria-labelledby="wishes-title" className="animate-rise absolute inset-x-3 top-2 space-y-4 rounded-3xl bg-ink-3 p-5 shadow-2xl ring-1 ring-white/10">
        <div>
          <h2 id="wishes-title" className="font-display text-xl font-bold">
            What would work for you?
          </h2>
          <p className="text-sm text-white/70">A few taps. The group only sees everyone&apos;s wishes together, never whose.</p>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-white/80">Budget</legend>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3] as const).map((p) => (
              <button key={p} type="button" aria-pressed={price === p} onClick={() => setPrice(price === p ? null : p)} className={chip(price === p)}>
                {"$".repeat(p)}
                <span className="sr-only"> or less</span>
              </button>
            ))}
            <button type="button" aria-pressed={price === null} onClick={() => setPrice(null)} className={chip(price === null)}>
              Any
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-white/80">How far</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={reach === "walk"} onClick={() => setReach("walk")} className={chip(reach === "walk")}>
              Walking distance
            </button>
            <button type="button" aria-pressed={reach === "drive"} onClick={() => setReach("drive")} className={chip(reach === "drive")}>
              A short drive is fine
            </button>
            <button type="button" aria-pressed={reach === null} onClick={() => setReach(null)} className={chip(reach === null)}>
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
              <button key={c} type="button" aria-pressed={crave.includes(c)} onClick={() => toggleCrave(c)} className={chip(crave.includes(c))}>
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={() => onSave({ price, reach, crave })} className="h-12 flex-1 rounded-full bg-social font-semibold text-white">
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
