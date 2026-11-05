"use client";

import { useEffect, useState } from "react";
import type { HealthLabel, Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, distanceText, formatClock, mealFrame, minutesUntil, priceText, ratingText } from "@/lib/time";
import { PickPhoto } from "./PickPhoto";
import { PaymentLine } from "./PaymentChips";
import { PlateRing } from "./PlateRing";
import { BagIcon, CarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, ExternalIcon, LeafIcon, PartyIcon, PinIcon, SearchIcon, UtensilsIcon, WalkIcon } from "./Icons";
import { useCardGestures } from "@/hooks/useCardGestures";
import { directionsUrl } from "@/lib/links";

interface Props {
  pick: Pick;
  now: Date;
  /** Swipe left, or the right-hand arrow. */
  onNext: () => void;
  /** Swipe right, or the left-hand arrow. Omitted when there's nothing to go back to. */
  onBack?: () => void;
  /**
   * Pull the photo down and let go (or tap the handle): "go" starts the journey solo, "vote"
   * votes in a group, "add" adds a searched place to the group's vote.
   */
  onPull?: () => void;
  pullAction?: PullAction;
  /** In a group, on a card you voted for: the handle offers to take the vote back. */
  onUnvote?: () => void;
  disabled?: boolean;
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
  /** In a party: you voted for this card (others' votes stay secret). */
  voted?: boolean;
  /** In a party: remove this place for everyone (anonymously) because I can't eat there. */
  onCantEat?: () => void;
  /** In a party: a private heads-up for me only ("this looks meat-focused"). Never removes anything. */
  fitNote?: { kind: "food" | "time"; text: string } | null;
  /** Solo: this place won't work for what I eat. Offered in the details, then asks what you eat. */
  onCantEatHere?: () => void;
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

type PullAction = "go" | "vote" | "add";
const PULL_TEXT: Record<PullAction, { idle: string; armed: string; aria: (name: string) => string }> = {
  go: { idle: "Pull down to go", armed: "Let go to go!", aria: (n) => `Go to ${n}: start the journey` },
  vote: { idle: "Pull down to vote", armed: "Let go to vote!", aria: (n) => `Vote for ${n}` },
  add: { idle: "Pull down to add it", armed: "Let go to add!", aria: (n) => `Add ${n} to the group's vote` },
};

export function PickCard({
  pick,
  now,
  quietBadge,
  onTangent,
  expanded = true,
  onExpand,
  voted,
  hint,
  onHinted,
  onCantEat,
  onCantEatHere,
  returning,
  fitNote,
  onNext,
  onBack,
  onPull,
  pullAction = "go",
  onUnvote,
  disabled,
}: Props) {
  const closesIn = minutesUntil(pick.closesAt, now);
  const closingSoon = closesIn != null && closesIn <= CLOSING_SOON_MINUTES;
  const price = priceText(pick.priceLevel);
  const rating = ratingText(pick.rating, pick.ratingCount);
  // Tap the photo to flip through the place's photos (food-first); back to the first on a new pick.
  const [shot, setShot] = useState({ id: pick.id, i: 0 });
  const gallery = pick.photos && pick.photos.length > 1 ? pick.photos : [pick.photo];
  const at = shot.id === pick.id ? shot.i % gallery.length : 0;
  const photo = gallery[at];
  const gestures = useCardGestures({
    onNext,
    onBack: onBack ?? (() => {}),
    onPull: voted ? undefined : onPull,
    onTap: gallery.length > 1 ? () => setShot({ id: pick.id, i: at + 1 }) : undefined,
    disabled,
  });
  const { dx, progress, pull, tension, armed, launching } = gestures;
  const text = PULL_TEXT[pullAction];
  const transform = launching
    ? "translateY(-115%) scale(0.9)"
    : dx
      ? `translateX(${dx}px) rotate(${dx / 40}deg)`
      : pull
        ? `translateY(${pull}px) scale(${1 - tension * 0.04})`
        : undefined;

  return (
    <article aria-labelledby="pick-title" aria-describedby="pick-reason" className="flex min-h-0 flex-1 flex-col">
      {/* Photo: swipe sideways for next / back, pull down and let go to launch, tap to flip. */}
      <div
        {...gestures.photoHandlers}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${hint && !dx && !pull ? "animate-nudge" : ""}`}
        onAnimationEnd={(e) => e.animationName === "nudge" && onHinted?.()}
        style={{
          transform,
          opacity: launching ? 0 : 1,
          transition: launching ? "transform 260ms cubic-bezier(.55,-0.35,.75,.2), opacity 260ms ease-in" : dx || pull ? "none" : "transform 260ms cubic-bezier(.2,1.6,.4,1)",
        }}
      >
        <PickPhoto
          key={`${pick.id}-${at}`}
          photo={photo}
          instant={at > 0}
          alt={`Photo ${gallery.length > 1 ? `${at + 1} of ${gallery.length} ` : ""}at ${pick.name}${gallery.length > 1 ? ". Tap for the next photo" : ""}`}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />
        {gallery.length > 1 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center gap-1">
            {gallery.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === at ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
          </div>
        )}
        {/* While pulling: the string draws back, then says to let go. */}
        {pull > 0 && (
          <p
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-1/3 text-center font-display text-3xl font-extrabold drop-shadow-lg transition-transform ${armed ? "scale-110 text-paprika-bright" : "text-white/85"}`}
          >
            {armed ? text.armed : text.idle}
          </p>
        )}
        {/* Quiet arrows for moving on without swiping. */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Previous pick"
            className="absolute top-1/2 left-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
          >
            <ChevronLeftIcon size={22} />
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          aria-label="Next pick"
          className="absolute top-1/2 right-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
        >
          <ChevronRightIcon size={22} />
        </button>
        {/* Swipe feedback */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-5 top-1/3 rotate-[-12deg] rounded-lg border-4 border-paprika-bright px-3 py-1 font-display text-3xl font-extrabold text-paprika-bright"
          style={{ opacity: onBack ? Math.max(0, progress) : 0 }}
        >
          BACK
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-5 top-1/3 rotate-[12deg] rounded-lg border-4 border-white px-3 py-1 font-display text-3xl font-extrabold text-white"
          style={{ opacity: Math.max(0, -progress) }}
        >
          NEXT
        </span>

        {returning && (
          <div className={`pointer-events-none absolute right-3 top-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-paprika/90 px-3 text-sm font-semibold text-white backdrop-blur-md">
              <span aria-hidden="true">♥</span> Your pick last time
            </span>
          </div>
        )}
        {pick.secondLook && voted === undefined && !returning && (
          <div className={`pointer-events-none absolute right-3 top-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur-md">Second look</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pt-4 pb-11">
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
              {photo.kind === "url" && photo.attribution && <span className="max-w-full truncate">Photo: {photo.attribution}</span>}
              {/* Never truncated: the "Google Maps" credit has to stay readable. */}
              <span className="whitespace-nowrap">Google Maps</span>
            </span>
          )}
        </div>
      </div>

      {/* The bowstring: where photo meets details. Pull the photo down from here, or just tap it. */}
      {(onPull || voted) && (
        <div className="relative z-20 h-0">
          <div className="absolute inset-x-0 -top-9 flex justify-center" style={{ transform: pull ? `translateY(${pull * 0.15}px)` : undefined }}>
            {voted ? (
              <button
                type="button"
                onClick={onUnvote}
                aria-label={`You voted for ${pick.name}. Take your vote back`}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-social px-4 text-sm font-semibold text-white shadow-lg ring-4 ring-ink-2 transition active:scale-95"
              >
                <span aria-hidden="true">♥</span> You voted
                <span className="font-medium text-white/75">· Take back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onPull}
                disabled={disabled}
                aria-label={text.aria(pick.name)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white shadow-lg ring-4 ring-ink-2 transition active:scale-95 disabled:opacity-50 ${
                  armed ? "bg-paprika-bright" : "bg-paprika"
                } ${hint ? "animate-tug" : ""}`}
              >
                <ChevronDownIcon size={16} />
                {text.idle}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Details: their own panel. Swipe sideways here too; opened, they scroll up and down. */}
      <div
        key={pick.id}
        {...gestures.panelHandlers}
        className={`animate-rise relative flex touch-pan-y items-start gap-4 rounded-t-3xl bg-ink-2 px-4 pt-8 pb-2 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] -mt-4 ${expanded ? "max-h-[60%] shrink-0 overflow-y-auto overscroll-contain" : ""}`}
        {...(expanded ? { tabIndex: 0, "aria-label": `Details about ${pick.name}` } : {})}
      >
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
              <AboutPlace pick={pick} closesIn={closesIn} />
              {onCantEatHere && (
                <button type="button" onClick={onCantEatHere} className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-semibold text-teal-bright hover:underline">
                  <UtensilsIcon size={14} />
                  Can&apos;t eat here? Tell us what you eat
                </button>
              )}
              {/* A soft fade at the bottom edge says there's more to scroll to. */}
              <div aria-hidden="true" className="pointer-events-none sticky -bottom-2 -mt-6 h-6 bg-gradient-to-t from-ink-2 to-transparent" />
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
 * Everything else worth knowing before you go, for anyone curious: Google's description,
 * the storefront and where it is (to find the door), hours, what it offers, and links out
 * to the menu, photos and reviews. Only what's known is shown; nothing is guessed.
 */
function AboutPlace({ pick, closesIn }: { pick: Pick; closesIn: number | null }) {
  const offers = [pick.takeout && "Takeout", pick.delivery && "Delivery", pick.vegetarianOptions && "Vegetarian options"].filter(Boolean) as string[];
  const row = "flex items-start gap-2";
  const link = "inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-semibold text-white hover:bg-white/15";
  return (
    <section aria-labelledby={`about-${pick.id}`} className="mt-4 border-t border-white/10 pt-3 pb-3 text-sm text-white/80">
      <h2 id={`about-${pick.id}`} className="text-xs font-semibold tracking-wide text-white/60 uppercase">
        About {pick.name}
      </h2>
      {pick.about && <p className="mt-1.5 text-white/85">{pick.about}</p>}
      {pick.storefront?.kind === "url" && (
        <figure className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- proxied per request, like the card photo */}
          <img
            src={pick.storefront.url}
            alt={`The storefront of ${pick.name}`}
            loading="lazy"
            referrerPolicy="no-referrer"
            draggable={false}
            className="h-40 w-full rounded-2xl bg-white/5 object-cover"
          />
          <figcaption className="mt-1 text-right text-[11px] text-white/50">
            {pick.storefront.attribution ? `Photo: ${pick.storefront.attribution} · ` : ""}Google Maps
          </figcaption>
        </figure>
      )}
      <ul className="mt-2 space-y-1.5">
        {pick.address && (
          <li className={row}>
            <PinIcon size={15} className="mt-0.5 shrink-0 text-white/55" />
            <span>
              {pick.address}
              {!pick.travelUnknown && pick.distanceMeters > 0 && <span className="text-white/55"> · {distanceText(pick.distanceMeters)} away</span>}
              <a href={directionsUrl(pick)} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex min-h-11 items-center gap-1 align-middle font-semibold text-teal-bright hover:underline">
                Map
                <ExternalIcon size={12} />
              </a>
            </span>
          </li>
        )}
        {pick.closesAt && (
          <li className={row}>
            <ClockIcon size={15} className="mt-0.5 shrink-0 text-white/55" />
            <span>
              Open now, till {formatClock(pick.closesAt)}
              {closesIn != null && closesIn < 120 && <span className="text-white/55"> · {closesIn} min left</span>}
            </span>
          </li>
        )}
        {offers.length > 0 && (
          <li className={row}>
            <BagIcon size={15} className="mt-0.5 shrink-0 text-white/55" />
            <span>{offers.join(" · ")}</span>
          </li>
        )}
      </ul>
      {(pick.mapsUrl || pick.websiteUrl) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pick.mapsUrl && (
            <a href={pick.mapsUrl} target="_blank" rel="noopener noreferrer" className={link}>
              Menu, photos &amp; reviews
              <ExternalIcon size={13} className="opacity-70" />
            </a>
          )}
          {pick.websiteUrl && (
            <a href={pick.websiteUrl} target="_blank" rel="noopener noreferrer" className={link}>
              Website
              <ExternalIcon size={13} className="opacity-70" />
            </a>
          )}
        </div>
      )}
    </section>
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
