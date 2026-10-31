"use client";

import type { Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, formatClock, mealFrame, minutesUntil, priceText } from "@/lib/time";
import { PickPhoto } from "./PickPhoto";
import { OverlayPaymentChip } from "./PaymentChips";
import { PlateRing } from "./PlateRing";
import { CarIcon, ClockIcon, LeafIcon, PartyIcon, WalkIcon } from "./Icons";
import type { useSwipe } from "@/hooks/useSwipe";

interface Props {
  pick: Pick;
  now: Date;
  swipes: number;
  swipe: ReturnType<typeof useSwipe>;
}

export function PickCard({ pick, now, swipes, swipe }: Props) {
  const closesIn = minutesUntil(pick.closesAt, now);
  const closingSoon = closesIn != null && closesIn <= CLOSING_SOON_MINUTES;
  const price = priceText(pick.priceLevel);
  const { dx, progress, handlers } = swipe;

  return (
    <article aria-labelledby="pick-title" aria-describedby="pick-reason" className="flex min-h-0 flex-1 flex-col">
      {/* Photo: swipe surface */}
      <div
        {...handlers}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden"
        style={{
          transform: dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined,
          transition: dx ? "none" : "transform 220ms ease-out",
        }}
      >
        <PickPhoto key={pick.id} photo={pick.photo} alt={`Photo of the food style at ${pick.name}`} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />

        {/* Swipe feedback */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-5 top-1/3 rotate-[-12deg] rounded-lg border-4 border-paprika-bright px-3 py-1 font-display text-3xl font-extrabold text-paprika-bright"
          style={{ opacity: Math.max(0, progress) }}
        >
          GO
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-1/3 rotate-[12deg] rounded-lg border-4 border-white px-3 py-1 font-display text-3xl font-extrabold text-white"
          style={{ opacity: Math.max(0, -progress) }}
        >
          SKIP
        </span>

        <div className="pointer-events-none absolute right-3 top-3">
          <span className="inline-flex h-8 items-center rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur-md">
            {swipes === 0 ? "Found instantly" : `Found in ${swipes} swipe${swipes === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
          {pick.travelUnknown ? (
            <p className="flex items-center gap-2 font-display text-[1.75rem] leading-none font-extrabold tracking-tight whitespace-nowrap text-white drop-shadow-lg">
              <PartyIcon size={26} className="shrink-0" />
              Group pick
            </p>
          ) : (
            <p className="flex items-center gap-1.5 font-display text-[2.25rem] leading-none font-extrabold tracking-tight whitespace-nowrap text-white drop-shadow-lg">
              {pick.travelMode === "walk" ? <WalkIcon size={30} className="shrink-0" /> : <CarIcon size={30} className="shrink-0" />}
              <span>
                {pick.timeEstimated && <span className="sr-only">about </span>}
                {pick.timeEstimated && <span aria-hidden="true">~</span>}
                {pick.walkMinutes} min <span className="font-semibold">{pick.travelMode === "drive" ? "drive" : "walk"}</span>
              </span>
            </p>
          )}
          <OverlayPaymentChip payment={pick.payment} />
        </div>
      </div>

      {/* Details */}
      <div key={pick.id} className="animate-rise flex items-start gap-4 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">{mealFrame(now)}</p>
          <h1 id="pick-title" className="mt-1 font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-white">
            {pick.suggestion}
          </h1>
          <p id="pick-reason" className="mt-1 text-base text-white/80">
            {pick.reason}
          </p>
          <p className="mt-2 truncate text-sm text-white/65">
            <span className="font-medium text-white/90">{pick.name}</span>
            <span aria-hidden="true"> · </span>
            <span aria-hidden="true">{price.visual}</span>
            <span className="sr-only">, {price.spoken}</span>
            {pick.closesAt && !closingSoon && (
              <>
                <span aria-hidden="true"> · </span>
                Open till {formatClock(pick.closesAt)}
              </>
            )}
          </p>
          {closingSoon && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-paprika/20 px-2.5 py-1 text-sm font-semibold text-paprika-bright">
              <ClockIcon size={15} />
              Closes in {closesIn} min
            </p>
          )}
          {pick.labels.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Good stuff in this pick">
              {pick.labels.map((l) => (
                <li
                  key={l}
                  className="inline-flex items-center gap-1 rounded-full bg-teal/25 px-2 py-0.5 text-xs font-semibold text-teal-bright"
                >
                  <LeafIcon size={12} />
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
        <PlateRing plate={pick.plate} />
      </div>
    </article>
  );
}

/** Skeleton shaped like the card so nothing jumps when the first pick lands. */
export function PickSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Finding a pick near you">
      <div className="skeleton min-h-0 flex-1" />
      <div className="flex items-start gap-4 px-4 pt-4 pb-2">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-7 w-4/5 rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-4 w-1/2 rounded" />
        </div>
        <div className="skeleton size-[52px] rounded-full" />
      </div>
    </div>
  );
}
