"use client";

import { KEPT_HERE } from "@/lib/copy";
import { useEffect } from "react";
import type { Dietary } from "@/lib/types";
import { ALLERGIES, DIETS } from "@/hooks/useDietary";
import { eatsLabel } from "@/lib/dietary";

function Chips({
  legend,
  options,
  selected,
  onToggle,
  labelFor = (v) => v,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  /** On-screen wording for a stored value. */
  labelFor?: (v: string) => string;
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
              {labelFor(o)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * "What do you eat?": inline panel under the top bar (no modal). Choices are worded as food
 * ("No meat or fish"), never as labels for people. Changes apply when it closes.
 */
export function DietPanel({
  dietary,
  remembered,
  onChange,
  onRemember,
  onForget,
  onClose,
  suggested,
}: {
  /** Opened from "Can't eat this": choices the pick on screen hints at, offered first. */
  suggested?: { diets: string[]; allergies: string[] };
  dietary: Dietary;
  remembered: boolean;
  onChange: (update: (d: Dietary) => Dietary) => void;
  onRemember: (on: boolean) => void;
  onForget: () => void;
  onClose: () => void;
}) {
  // Escape closes the sheet wherever focus is (often still on the top-bar button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const any = dietary.diets.length + dietary.allergies.length > 0;

  return (
    <section
      id="diet-panel"
      className="animate-rise mx-4 max-h-[calc(100dvh-5rem)] space-y-4 overflow-y-auto rounded-3xl bg-[#0f2724] p-4 shadow-2xl ring-1 ring-teal/30"
      aria-labelledby="diet-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="diet-title" className="font-display text-xl font-bold">
            What do you eat?
          </h2>
          <p className="text-sm text-white/75">Picks are filtered to suit you, but we can&apos;t check ingredients: always confirm with the restaurant, especially for allergies.</p>
        </div>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-ink">
          Done
        </button>
      </div>

      {suggested && suggested.diets.length + suggested.allergies.length > 0 && (
        <fieldset className="rounded-2xl bg-white/6 p-3">
          <legend className="sr-only">Based on this pick</legend>
          <p className="text-sm font-semibold text-white">Based on this pick, maybe:</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              ...suggested.diets.map((v) => ({ v, text: eatsLabel(v), on: dietary.diets.includes(v), flip: () => onChange((d) => ({ ...d, diets: toggle(d.diets, v) })) })),
              ...suggested.allergies.map((v) => ({
                v,
                text: `Keep away from ${v.toLowerCase()}`,
                on: dietary.allergies.includes(v),
                flip: () => onChange((d) => ({ ...d, allergies: toggle(d.allergies, v) })),
              })),
            ].map((c) => (
              <button
                key={c.v}
                type="button"
                aria-pressed={c.on}
                onClick={c.flip}
                className={`h-11 rounded-full px-3.5 text-sm font-semibold transition ${c.on ? "bg-teal text-white" : "bg-white/12 text-white ring-1 ring-teal-bright/50 hover:bg-white/18"}`}
              >
                {c.text}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <Chips
        legend="I'm looking for"
        options={DIETS}
        labelFor={eatsLabel}
        selected={dietary.diets}
        onToggle={(v) => onChange((d) => ({ ...d, diets: toggle(d.diets, v) }))}
      />
      <Chips
        legend="Keep away from (allergies)"
        options={ALLERGIES}
        selected={dietary.allergies}
        onToggle={(v) => onChange((d) => ({ ...d, allergies: toggle(d.allergies, v) }))}
      />
      {dietary.allergies.length > 0 && <p className="text-sm text-white/75">We can&apos;t verify ingredients. Always check allergens with the restaurant.</p>}

      <div className="space-y-2 border-t border-white/10 pt-3">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-sm">
            <span className="font-semibold">Remember this on this device</span>
            <span className="block text-white/65">{KEPT_HERE}</span>
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
