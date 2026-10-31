"use client";

import { useId, useState } from "react";
import { formatMoney, parseAmountToCents, splitCents, splitMessage } from "@/lib/split";

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 12;

/**
 * Type the total, pick how many people, share the result from your own phone.
 * Nothing here talks to a server, and Zesthunt never learns amounts or who paid.
 */
export function SplitCard({ placeName, defaultPeople, startOpen }: { placeName: string; defaultPeople: number; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [total, setTotal] = useState("");
  const [people, setPeople] = useState(Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, defaultPeople)));
  const [status, setStatus] = useState<string | null>(null);
  const id = useId();

  const cents = parseAmountToCents(total);
  // Everyone should owe at least a cent.
  const shares = cents && cents >= people ? splitCents(cents, people) : null;
  const message = cents && shares ? splitMessage(placeName, cents, shares) : "";

  const share = async () => {
    if (!message) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      setStatus("Copied. Paste it into Venmo, Cash App, Apple Cash or a text.");
    } catch (e) {
      // AbortError = the user closed the share sheet; nothing to report.
      if (!(e instanceof DOMException && e.name === "AbortError")) setStatus("Couldn't open sharing in this browser.");
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 h-11 w-full rounded-2xl border border-dashed border-sheet-ink/25 text-sm font-semibold text-sheet-muted dark:border-white/25 dark:text-white/70"
      >
        Splitting the bill?
      </button>
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mt-3 rounded-2xl bg-social/10 p-4 dark:bg-social/20">
      <div className="flex items-baseline justify-between">
        <h2 id={`${id}-title`} className="font-display text-lg font-bold">
          Split the bill
        </h2>
        <span className="text-xs text-sheet-muted dark:text-white/60">Stays on your phone</span>
      </div>

      <div className="mt-3 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${id}-total`} className="text-xs font-semibold text-sheet-muted dark:text-white/70">
            Total, with tax and tip
          </label>
          <input
            id={`${id}-total`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={total}
            onChange={(e) => {
              setTotal(e.target.value);
              setStatus(null);
            }}
            className="mt-1 h-12 w-full rounded-xl border border-sheet-ink/15 bg-white px-3 font-display text-xl font-bold text-sheet-ink tabular-nums dark:border-white/15 dark:bg-white/5 dark:text-white"
          />
        </div>
        <div>
          <span id={`${id}-people`} className="text-xs font-semibold text-sheet-muted dark:text-white/70">
            People
          </span>
          <div className="mt-1 flex h-12 items-center rounded-xl border border-sheet-ink/15 bg-white dark:border-white/15 dark:bg-white/5" role="group" aria-labelledby={`${id}-people`}>
            <button
              type="button"
              aria-label="One fewer person"
              disabled={people <= MIN_PEOPLE}
              onClick={() => setPeople((n) => Math.max(MIN_PEOPLE, n - 1))}
              className="grid h-full w-11 place-items-center text-xl font-bold disabled:opacity-30"
            >
              −
            </button>
            <output className="w-6 text-center font-display text-lg font-bold tabular-nums" aria-live="polite">
              {people}
            </output>
            <button
              type="button"
              aria-label="One more person"
              disabled={people >= MAX_PEOPLE}
              onClick={() => setPeople((n) => Math.min(MAX_PEOPLE, n + 1))}
              className="grid h-full w-11 place-items-center text-xl font-bold disabled:opacity-30"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3 min-h-7 font-display text-2xl font-extrabold tabular-nums" aria-live="polite">
        {shares ? (
          <>
            {formatMoney(shares[0])} <span className="text-base font-semibold text-sheet-muted dark:text-white/70">each</span>
            {shares.some((s) => s !== shares[0]) && (
              <span className="block text-xs font-normal text-sheet-muted dark:text-white/60">
                Doesn&apos;t divide evenly: {shares.filter((s) => s === shares[0]).length} pay {formatMoney(shares[0])}, the rest{" "}
                {formatMoney(shares[shares.length - 1])}.
              </span>
            )}
          </>
        ) : (
          <span className="text-base font-normal text-sheet-muted dark:text-white/60">Enter the total to see each share.</span>
        )}
      </p>

      <button
        type="button"
        disabled={!message}
        onClick={share}
        className="mt-3 h-12 w-full rounded-2xl bg-social font-semibold text-white transition disabled:opacity-40"
      >
        Send the split
      </button>
      {status && <p className="mt-2 text-xs text-sheet-muted dark:text-white/70">{status}</p>}
    </section>
  );
}
