"use client";

import { useEffect, useState } from "react";
import type { HealthLabel, Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, formatClock, mealFrame, minutesUntil, priceText, ratingText } from "@/lib/time";
import { PickPhoto } from "./PickPhoto";
import { PaymentLine } from "./PaymentChips";
import { PlateRing } from "./PlateRing";
import { CarIcon, ChevronDownIcon, ClockIcon, LeafIcon, PartyIcon, SearchIcon, UtensilsIcon, WalkIcon } from "./Icons";
import type { useSwipe } from "@/hooks/useSwipe";

interface Props {
  pick: Pick;
  now: Date;
  swipes: number;
  swipe: ReturnType<typeof useSwipe>;
  /** A notice is showing over the photo: hide the swipe-count badge so they don't collide. */
  quietBadge?: boolean;
  /** Tapping a chip searches for more of that ("noodles", "veggie"). Omitted where cravings don't apply (parties). */
  onTangent?: (query: string) => void;
  /**
   * Collapsed, the card shows only what it takes to say yes or no: the dish, the place and
   * how far. Details (rating, price, payment, chips, plate) open on request, or by themselves
   * when someone lingers on a pick, so detail arrives as they get close to choosing.
   */
  expanded?: boolean;
  onExpand?: () => void;
  /** In a party: you already voted for this card (others' votes stay secret). */
  voted?: boolean;
  /** In a party: remove this place for everyone (anonymously) because I can't eat there. */
  onCantEat?: () => void;
  /** In a party: a private heads-up for me only ("this looks meat-focused"). Never removes anything. */
  fitNote?: { kind: "food" | "time"; text: string } | null;
  /** A place you chose before and asked to remember: offered first, with a badge. */
  returning?: boolean;
  /** First card of the session: lean left and right once to show it can be swiped. */
  hint?: boolean;
  onHinted?: () => void;
}

/** What each health label searches for when tapped. */
const LABEL_QUERY: Record<HealthLabel, string> = {
  Protein: "high protein",
  Veg: "veggie",
  "Whole grain": "whole grain bowl",
};

export function PickCard({ pick, now, swipes, swipe, quietBadge, onTangent, expanded = true, onExpand, voted, hint, onHinted, onCantEat, returning, fitNote }: Props) {
  const closesIn = minutesUntil(pick.closesAt, now);
  const closingSoon = closesIn != null && closesIn <= CLOSING_SOON_MINUTES;
  const price = priceText(pick.priceLevel);
  const rating = ratingText(pick.rating, pick.ratingCount);
  const { dx, progress, handlers } = swipe;

  return (
    <article aria-labelledby="pick-title" aria-describedby="pick-reason" className="flex min-h-0 flex-1 flex-col">
      {/* Photo: swipe surface */}
      <div
        {...handlers}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${hint && !dx ? "animate-nudge" : ""}`}
        onAnimationEnd={(e) => e.animationName === "nudge" && onHinted?.()}
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
          {voted === undefined ? "GO" : "VOTE"}
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-1/3 rotate-[12deg] rounded-lg border-4 border-white px-3 py-1 font-display text-3xl font-extrabold text-white"
          style={{ opacity: Math.max(0, -progress) }}
        >
          {voted === undefined ? "SKIP" : "PASS"}
        </span>

        {/* In a party, only your own vote is shown (going Back to a card you're in on). */}
        {voted && (
          <div className="pointer-events-none absolute right-3 top-3">
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-social/85 px-3 text-sm font-semibold text-white backdrop-blur-md">
              <span aria-hidden="true">♥</span> You voted
            </span>
          </div>
        )}
        {returning && (
          <div className={`pointer-events-none absolute right-3 top-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-paprika/90 px-3 text-sm font-semibold text-white backdrop-blur-md">
              <span aria-hidden="true">♥</span> Your pick last time
            </span>
          </div>
        )}
        {expanded && voted === undefined && !returning && (
          <div className={`pointer-events-none absolute right-3 top-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur-md">
              {swipes === 0 ? "Found instantly" : `Found in ${swipes} swipe${swipes === 1 ? "" : "s"}`}
            </span>
          </div>
        )}

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
          {/* Google's terms: Places content shown without a Google map carries a "Google Maps"
              credit, and a Places photo carries its photographer's name. */}
          {!pick.placeId.startsWith("mock-") && (
            <span className="flex min-w-0 max-w-[40%] shrink flex-col items-end text-right text-[11px] leading-tight text-white/75 drop-shadow">
              {pick.photo.kind === "url" && pick.photo.attribution && <span className="max-w-full truncate">Photo: {pick.photo.attribution}</span>}
              {/* Never truncated: the "Google Maps" credit has to stay readable. */}
              <span className="whitespace-nowrap">Google Maps</span>
            </span>
          )}
        </div>
      </div>

      {/* Details */}
      <div key={pick.id} className="animate-rise flex items-start gap-4 px-4 pt-4 pb-2">
        <div className="min-w-0 flex-1">
          {expanded && <p className="mb-1 text-xs font-semibold tracking-wide text-white/60 uppercase">{mealFrame(now)}</p>}
          <h1 id="pick-title" className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-white">
            {pick.suggestion}
          </h1>
          <p id="pick-reason" className="mt-1 text-base text-white/80">
            {pick.reason}
          </p>
          <p className="mt-2 line-clamp-2 text-sm text-white/65">
            <span className="font-medium text-white/90">{pick.name}</span>
            {expanded && rating && (
              <>
                <span aria-hidden="true"> · </span>
                <span aria-hidden="true" className="text-white/85">
                  <span className="text-star">★</span> {rating.visual}
                </span>
                <span className="sr-only">, {rating.spoken}</span>
              </>
            )}
            {expanded && (
              <>
                <span aria-hidden="true"> · </span>
                <span aria-hidden="true">{price.visual}</span>
                <span className="sr-only">, {price.spoken}</span>
              </>
            )}
            {pick.closesAt && !closingSoon && (
              <>
                <span aria-hidden="true"> · </span>
                <span className="whitespace-nowrap">Open till {formatClock(pick.closesAt)}</span>
              </>
            )}
          </p>
          {onCantEat && fitNote ? (
            // A private heads-up with the choice right beside it: the person decides, not us.
            <div className="mt-2 rounded-2xl bg-star/12 px-3 py-2 text-sm text-white/90 ring-1 ring-star/30" role="note">
              <p>{fitNote.text}</p>
              <button type="button" onClick={onCantEat} className="-ml-1 mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-full px-1 font-semibold text-star hover:underline">
                {fitNote.kind === "food" ? <UtensilsIcon size={14} /> : <ClockIcon size={14} />}
                {fitNote.kind === "food" ? "Can't eat this? Remove it for everyone" : "Too tight? Remove it for everyone"}
              </button>
            </div>
          ) : (
            onCantEat && (
              <button
                type="button"
                onClick={onCantEat}
                className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-semibold text-teal-bright hover:underline"
              >
                <UtensilsIcon size={14} />
                Can&apos;t eat this
              </button>
            )
          )}
          {closingSoon && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-paprika/20 px-2.5 py-1 text-sm font-semibold text-paprika-bright">
              <ClockIcon size={15} />
              Closes in {closesIn} min
            </p>
          )}
          {expanded ? (
            <div className="animate-rise">
              {/* How to pay is a "getting there" detail: not shown while a group is voting. */}
              {voted === undefined && <PaymentLine payment={pick.payment} />}
              <TangentChips pick={pick} onTangent={onTangent} />
            </div>
          ) : (
            onExpand && (
              <button
                type="button"
                onClick={onExpand}
                aria-expanded={false}
                className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-semibold text-teal-bright hover:underline"
              >
                Details: rating, price, more like this
                <ChevronDownIcon size={15} />
              </button>
            )
          )}
        </div>
        {expanded && <PlateRing plate={pick.plate} />}
      </div>
    </article>
  );
}

/**
 * The dish type and health labels as chips. Each one is a way out of this pick toward a
 * better one: tapping "More noodles" or "Veg" searches for exactly that nearby.
 */
function TangentChips({ pick, onTangent }: { pick: Pick; onTangent?: (query: string) => void }) {
  const chips = [
    ...(pick.category ? [{ key: "dish", text: `More ${pick.category}`, query: pick.category, health: false }] : []),
    ...pick.labels.map((l) => ({ key: l, text: l, query: LABEL_QUERY[l], health: true })),
  ];
  if (chips.length === 0) return null;
  // Visually 32px tall; the ::after pad makes each tap target 44px.
  const chip = (health: boolean) =>
    `relative inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold after:absolute after:-inset-1.5 after:content-[''] ${
      health ? "bg-teal/25 text-teal-bright" : "bg-white/12 text-white"
    }`;
  return (
    <ul className="mt-2.5 flex flex-wrap gap-2" aria-label={onTangent ? "Find more like this" : "About this pick"}>
      {chips.map((c) => (
        <li key={c.key}>
          {onTangent ? (
            <button
              type="button"
              onClick={() => onTangent(c.query)}
              aria-label={c.health ? `Find more ${c.text.toLowerCase()} options nearby` : `Find ${c.query} nearby`}
              className={`${chip(c.health)} transition hover:brightness-125 active:scale-95`}
            >
              {c.health && <LeafIcon size={12} />}
              {c.text}
              <SearchIcon size={12} className="opacity-70" />
            </button>
          ) : (
            <span className={chip(c.health)}>
              {c.health && <LeafIcon size={12} />}
              {c.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const LOADING_LINES = ["Sniffing out what's open nearby…", "Checking who's still serving…", "Counting the steps to each door…", "Picking something worth the walk…"];

/** Skeleton shaped like the card so nothing jumps when the first pick lands, with a little company while it loads. */
export function PickSkeleton() {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine((i) => (i + 1) % LOADING_LINES.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Finding a pick near you">
      <div className="skeleton relative grid min-h-0 flex-1 place-items-center">
        <p key={line} aria-hidden="true" className="animate-rise px-6 text-center text-base font-medium text-white/70">
          {LOADING_LINES[line]}
        </p>
      </div>
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
