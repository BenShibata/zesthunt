"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./Icons";

/**
 * One row, always in the same place just above the bottom buttons: "‹ Back" on the left
 * (faded when there's nothing to go back to), something in the middle, something on the
 * right. Solo: Let's go and the places you liked. In a group: where you are, and Skip.
 */
export function NavRow({
  canBack,
  onBack,
  center,
  right,
  hidden,
  compactBack,
}: {
  canBack: boolean;
  onBack: () => void;
  center?: ReactNode;
  right?: ReactNode;
  hidden?: boolean;
  /** Just the arrow on narrower phones, to leave room for a wide middle. */
  compactBack?: boolean;
}) {
  return (
    <div className={`relative z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-1 transition-opacity ${hidden ? "pointer-events-none opacity-0" : ""}`}>
      <div>
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          aria-label={canBack ? "Back to the previous pick" : "Back (this is the first pick)"}
          // Hidden (but still taking its space) on the first pick, where there's nothing to go back to.
          className={`inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 ${canBack ? "" : "invisible"}`}
        >
          <ChevronLeftIcon size={18} />
          <span className={compactBack ? "sr-only min-[420px]:not-sr-only" : ""}>Back</span>
        </button>
      </div>
      <div className="flex min-w-0 justify-center">{center}</div>
      <div className="flex justify-end">{right}</div>
    </div>
  );
}

export const navPill = "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition active:scale-95";
