"use client";

import { useState } from "react";
import { CompassMark } from "./Icons";
import { AreaVisual } from "./AreaVisual";

const primary = "h-12 rounded-full bg-paprika px-6 font-semibold text-white transition hover:bg-paprika-deep";
const secondary = "h-12 rounded-full bg-white/10 px-6 font-semibold text-white transition hover:bg-white/15";

/** No location and no IP estimate: one inline field, no modal. */
export function LocationPrompt({ onSubmit, onUseLocation }: { onSubmit: (q: string) => void; onUseLocation: () => void }) {
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

export function EmptyState({
  message,
  suggestion,
  onRetry,
}: {
  message: string;
  suggestion: "drive" | "order_in" | "other_mood";
  onRetry: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="font-display text-2xl font-bold">{message}</p>
      {suggestion === "order_in" ? (
        <a href="https://www.doordash.com/" target="_blank" rel="noopener noreferrer" className={`${primary} inline-flex items-center`}>
          Order in instead
        </a>
      ) : suggestion === "other_mood" ? (
        <p className="text-white/75">Try another mood above, or start this one over.</p>
      ) : null}
      <button type="button" onClick={onRetry} className={secondary}>
        Start over
      </button>
    </section>
  );
}
