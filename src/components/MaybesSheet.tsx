"use client";

import type { Pick } from "@/lib/types";
import { formatClock, priceText } from "@/lib/time";
import { CarIcon, WalkIcon, XIcon } from "./Icons";

/**
 * Your maybes for this visit (kept in memory only). Tap one to go back to it and decide;
 * ✕ takes it off the list. New picks lean toward what's here.
 */
export function MaybesSheet({ maybes, onOpen, onRemove, onClose }: { maybes: Pick[]; onOpen: (p: Pick) => void; onRemove: (p: Pick) => void; onClose: () => void }) {
  return (
    <div className="relative z-40 h-0">
      <button type="button" aria-label="Close maybes" tabIndex={-1} onClick={onClose} className="fixed inset-0 -z-10 cursor-default bg-black/60" />
      <section role="dialog" aria-labelledby="maybes-title" className="animate-rise absolute inset-x-3 bottom-2 rounded-3xl bg-ink-3 p-2 shadow-2xl ring-1 ring-white/10">
        <div className="px-3 pt-2 pb-1">
          <h2 id="maybes-title" className="font-display text-lg font-bold">
            Your maybes
          </h2>
          <p className="text-sm text-white/60">Tap one to look again. New picks lean toward these. Only on this phone, until you close the page.</p>
        </div>
        <ul className="max-h-[50dvh] overflow-y-auto">
          {maybes.map((p) => (
            <li key={p.placeId} className="flex items-center gap-1">
              <button type="button" onClick={() => onOpen(p)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left transition hover:bg-white/8">
                <span className="text-star" aria-hidden="true">
                  ★
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="flex items-center gap-1 text-sm text-white/60">
                    {p.travelMode === "drive" ? <CarIcon size={13} /> : <WalkIcon size={13} />}
                    {p.walkMinutes} min
                    {p.rating ? ` · ★ ${p.rating.toFixed(1)}` : ""}
                    {p.priceLevel ? ` · ${priceText(p.priceLevel).visual}` : ""}
                    {p.closesAt ? ` · till ${formatClock(p.closesAt)}` : ""}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => onRemove(p)} aria-label={`Take ${p.name} off your maybes`} className="grid size-11 shrink-0 place-items-center rounded-full text-white/55 hover:text-white">
                <XIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
