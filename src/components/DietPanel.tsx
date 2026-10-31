"use client";

import type { Dietary } from "@/lib/types";
import { ALLERGIES, DIETS } from "@/hooks/useDietary";

function Chips({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-semibold tracking-wide text-white/70 uppercase">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o)}
              className={`h-11 rounded-full px-3.5 text-sm font-semibold transition ${on ? "bg-teal text-white" : "bg-white/8 text-white/80 hover:bg-white/14"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Inline panel under the top bar (no modal). Changes apply to the next picks straight away. */
export function DietPanel({
  dietary,
  remembered,
  onChange,
  onRemember,
  onForget,
  onClose,
}: {
  dietary: Dietary;
  remembered: boolean;
  onChange: (update: (d: Dietary) => Dietary) => void;
  onRemember: (on: boolean) => void;
  onForget: () => void;
  onClose: () => void;
}) {
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const any = dietary.diets.length + dietary.allergies.length > 0;

  return (
    <section className="animate-rise mx-4 mb-3 max-h-[55dvh] space-y-4 overflow-y-auto rounded-3xl bg-teal/15 p-4" aria-labelledby="diet-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="diet-title" className="font-display text-xl font-bold">
            Dietary needs
          </h2>
          <p className="text-sm text-white/75">Treated as hard rules for every pick.</p>
        </div>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-ink">
          Done
        </button>
      </div>

      <Chips legend="Diet" options={DIETS} selected={dietary.diets} onToggle={(v) => onChange((d) => ({ ...d, diets: toggle(d.diets, v) }))} />
      <Chips
        legend="Allergies"
        options={ALLERGIES}
        selected={dietary.allergies}
        onToggle={(v) => onChange((d) => ({ ...d, allergies: toggle(d.allergies, v) }))}
      />
      {dietary.allergies.length > 0 && <p className="text-sm text-white/75">We can&apos;t verify ingredients. Always check allergens with the restaurant.</p>}

      <div className="space-y-2 border-t border-white/10 pt-3">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">
            <span className="font-semibold">Remember my dietary needs on this device</span>
            <span className="block text-white/65">Saved only in this browser. We never store them.</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={remembered}
            onChange={(e) => onRemember(e.target.checked)}
            className="size-6 shrink-0 accent-teal"
          />
        </label>
        {(remembered || any) && (
          <button type="button" onClick={onForget} className="h-11 rounded-full px-1 text-sm font-semibold text-paprika-bright underline-offset-4 hover:underline">
            Forget me
          </button>
        )}
      </div>
    </section>
  );
}
