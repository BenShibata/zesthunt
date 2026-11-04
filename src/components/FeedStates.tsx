"use client";

import { useState } from "react";
import { CompassMark } from "./Icons";
import { AreaVisual } from "./AreaVisual";

const primary = "h-12 rounded-full bg-paprika px-6 font-semibold text-white transition hover:bg-paprika-deep";
const secondary = "h-12 rounded-full bg-white/10 px-6 font-semibold text-white transition hover:bg-white/15";

/** No location and no IP estimate, or the user tapped "Change": one inline field, no modal. */
export function LocationPrompt({
  onSubmit,
  onUseLocation,
  onCancel,
}: {
  onSubmit: (q: string) => void;
  onUseLocation: () => void;
  /** Shown when changing an area that's already set. */
  onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  return (
    <section className="flex flex-1 flex-col justify-center gap-4 overflow-y-auto px-6" aria-labelledby="where-title">
      <CompassMark size={40} className="text-paprika-bright" />
      <h1 id="where-title" className="font-display text-3xl font-bold tracking-tight">
        Where are you hunting?
      </h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value);
        }}
      >
        <label htmlFor="area" className="sr-only">
          Neighborhood or ZIP
        </label>
        <input
          id="area"
          autoFocus={Boolean(onCancel)}
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Neighborhood or ZIP"
          autoComplete="postal-code"
          className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white placeholder:text-white/50"
        />
        <button type="submit" className="h-12 rounded-full bg-white px-5 font-semibold text-ink">
          Go
        </button>
      </form>
      <button type="button" onClick={onUseLocation} className={secondary}>
        Use my location instead
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="h-11 font-semibold text-white/70 hover:text-white">
          Keep the current area
        </button>
      )}
      <AreaVisual source="preview" />
      <p className="-mt-1 text-sm text-white/65">Your location is rounded on this phone before it&apos;s sent, used for this search only, and never saved.</p>
    </section>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center" role="alert">
      <p className="font-display text-2xl font-bold">Hmm, the hunt stalled.</p>
      <p className="text-white/75">{message}</p>
      <button type="button" onClick={onRetry} className={primary}>
        Try again
      </button>
    </section>
  );
}

export interface EmptyActions {
  /** Other moods worth trying, nearest first. */
  moods?: { label: string; onClick: () => void }[];
  /** Search a short drive away. Offered only while searching on foot. */
  onWiden?: () => void;
  /** Shown while a craving is narrowing the search. */
  onClearCraving?: () => void;
}

/** Nothing (more) to show: say so, then offer the next most useful search rather than a dead end. */
export function EmptyState({
  message,
  suggestion,
  onRetry,
  actions = {},
}: {
  message: string;
  suggestion: "drive" | "order_in" | "other_mood";
  onRetry: () => void;
  actions?: EmptyActions;
}) {
  const { moods = [], onWiden, onClearCraving } = actions;
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-8 text-center">
      <p className="font-display text-2xl font-bold">{message}</p>
      {onClearCraving && (
        <button type="button" onClick={onClearCraving} className={`${primary} w-full`}>
          Show everything open
        </button>
      )}
      {onWiden && (
        <button type="button" onClick={onWiden} className={`${onClearCraving ? secondary : primary} w-full`}>
          Try a short drive
        </button>
      )}
      {moods.length > 0 && (
        <div className="flex w-full flex-wrap justify-center gap-2" role="group" aria-label="Try another mood">
          {moods.map((m) => (
            <button key={m.label} type="button" onClick={m.onClick} className={`${secondary} flex-1 px-4`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      {(suggestion === "order_in" || suggestion === "drive") && (
        <a href="https://www.doordash.com/" target="_blank" rel="noopener noreferrer" className={`${onWiden || onClearCraving ? secondary : primary} inline-flex w-full items-center justify-center`}>
          Order in instead
        </a>
      )}
      <button type="button" onClick={onRetry} className="h-11 font-semibold text-white/70 hover:text-white">
        Start over
      </button>
    </section>
  );
}
