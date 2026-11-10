"use client";

import type { ReactNode } from "react";
import { ChevronLeftIcon } from "./Icons";

/**
 * One row, always in the same place just above the bottom buttons: "‹ Back" on the left
 * (faded when there's nothing to go back to), something in the middle, something on the
 * right. Solo: Let's go and the places you liked. In a group: where you are, and Skip.
 */
export function NavRow({ canBack, onBack, center, right, hidden }: { canBack: boolean; onBack: () => void; center?: ReactNode; right?: ReactNode; hidden?: boolean }) {
  return (
    <div className={`relative z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-1 transition-opacity ${hidden ? "pointer-events-none opacity-0" : ""}`}>
      <div>
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          aria-label={canBack ? "Back to the previous pick" : "Back (this is the first pick)"}
          className="inline-flex h-11 items-center gap-0.5 rounded-full pr-3 pl-2 text-sm font-semibold text-white/85 transition hover:bg-white/10 disabled:text-white/30 disabled:hover:bg-transparent"
        >
          <ChevronLeftIcon size={18} />
          Back
        </button>
      </div>
      <div className="flex min-w-0 justify-center">{center}</div>
      <div className="flex justify-end">{right}</div>
    </div>
  );
}

export const navPill = "inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition active:scale-95";
