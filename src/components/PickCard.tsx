"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import type { HealthLabel, Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, distanceText, formatClock, mealFrame, minutesUntil, priceText, ratingText } from "@/lib/time";
import { PickPhoto } from "./PickPhoto";
import { PaymentLine } from "./PaymentChips";
import { PlateRing } from "./PlateRing";
import { BagIcon, CarIcon, ChevronDownIcon, ChevronLeftIcon, ClockIcon, ExternalIcon, LeafIcon, MoreIcon, PartyIcon, PhoneIcon, PinIcon, SearchIcon, UtensilsIcon, WalkIcon } from "./Icons";
import { useCardGestures } from "@/hooks/useCardGestures";
import { directionsUrl, orderAhead } from "@/lib/links";
import { aimAt, aimTargets, type AimKey } from "@/lib/aim";

interface Props {
  pick: Pick;
  now: Date;
  /** Swipe left, or the right-hand arrow. */
  onNext: () => void;
  /** Swipe right, or the left-hand arrow. Called on the first pick too, to say there's nothing back there. */
  onBack: () => void;
  /** There's a pick to go back to (otherwise the BACK stamp stays hidden). */
  hasBack?: boolean;
  /**
   * Pull the photo down and let go (or tap the notch): "go" starts the journey solo, aimed at
   * directions, ordering, calling or (straight down) every choice; "vote" votes in a group;
   * "add" adds a searched place to the group's vote.
   */
  onPull?: (target: AimKey) => void;
  pullAction?: PullAction;
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
  /** In a group: your answer to this place (others' stay secret until the reveal). Null = not answered yet. */
  answer?: "love" | "ok" | "no" | null;
  /** In a group: the place suits the group's wishes (budget, distance, food words). */
  fitsGroup?: boolean;
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

export function PickCard({
  pick,
  now,
  quietBadge,
  onTangent,
  expanded = true,
  onExpand,
  answer,
  fitsGroup,
  hint,
  onHinted,
  onCantEat,
  onCantEatHere,
  returning,
  fitNote,
  onNext,
  onBack,
  hasBack,
  onPull,
  pullAction = "go",
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
  // Solo, a pull aims at what letting go does (see lib/aim).
  const aiming = pullAction === "go";
  const order = orderAhead(pick);
  const has = { order: order.kind !== "none", call: Boolean(pick.phoneDial) };
  const walking = pick.travelMode === "walk";
  const TARGETS: Record<AimKey, { label: string; icon: ReactNode }> = {
    order: { label: "Order to go", icon: <BagIcon size={24} /> },
    directions: { label: "Directions", icon: walking ? <WalkIcon size={24} /> : <CarIcon size={24} /> },
    journey: { label: "All options", icon: <MoreIcon size={24} /> },
    call: { label: pick.reservable ? "Call to reserve" : "Call", icon: <PhoneIcon size={24} /> },
  };
  // What the browser only allows straight from the gesture happens on release.
  const release = (aim: number) => {
    if (!aiming) return;
    const t = aimAt(aim, has);
    if (t === "directions") window.open(directionsUrl(pick), "_blank", "noopener");
    else if (t === "call" && pick.phoneDial) window.location.assign(`tel:${pick.phoneDial}`);
    else if (t === "order" && order.kind === "own") window.open(order.url, "_blank", "noopener");
  };
  const gestures = useCardGestures({
    onNext,
    onBack,
    onPull: !onPull ? undefined : (aim) => onPull(aiming ? aimAt(aim, has) : "journey"),
    onRelease: release,
    onTap: gallery.length > 1 ? () => setShot({ id: pick.id, i: at + 1 }) : undefined,
    disabled,
  });
  const { dx, progress, pull, tension, armed, launching, aim } = gestures;
  const aimed = aimAt(aim, has);
  const pulling = aiming && pull > 0;
  const targets = aimTargets(has);
  // A small tick each time the aim moves to another target, so it can be felt, not just seen.
  const lastAim = useRef<AimKey | null>(null);
  useEffect(() => {
    if (!pulling) {
      lastAim.current = null;
      return;
    }
    if (lastAim.current && lastAim.current !== aimed) haptic(6);
    lastAim.current = aimed;
  }, [pulling, aimed]);
  // The card's size, for drawing the arrow from the bow to the aimed target.
  const cardRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ w: 390, h: 700, photoH: 480 });
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const ph = el.querySelector<HTMLElement>("[data-photo]");
      setBox({ w: el.clientWidth, h: el.clientHeight, photoH: ph?.clientHeight ?? el.clientHeight * 0.6 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const targetX = (key: AimKey) => 12 + (targets.indexOf(key) + 0.5) * ((box.w - 24) / targets.length);
  const TARGET_Y = 64;
  const bow = { x: box.w / 2 + aim * 0.25, y: Math.max(TARGET_Y + 120, box.photoH - 40) };
  const tip = { x: targetX(aimed), y: TARGET_Y + 40 };
  // The arrow grows from the bow toward the target as the pull tightens.
  const reach = { x: bow.x + (tip.x - bow.x) * Math.max(0.15, tension), y: bow.y + (tip.y - bow.y) * Math.max(0.15, tension) };
  // Sideways swipes move the whole card (photo and details); pulling moves only the photo, like a bowstring.
  const photoTransform = launching
    ? `translate(${aim * 0.6}px, -115%) scale(0.9)`
    : pull
      ? `translate(${aim * 0.25}px, ${pull}px) rotate(${aim / 60}deg) scale(${1 - tension * 0.04})`
      : undefined;

  return (
    <article
      ref={cardRef}
      aria-labelledby="pick-title"
      aria-describedby="pick-reason"
      className="relative flex min-h-0 flex-1 flex-col"
      style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 50}deg)` : undefined, transition: dx ? "none" : "transform 220ms ease-out" }}
    >
      {/* While pulling (solo): the bow and arrow. The card dims, the targets light up, and an arrow
          grows from the pull toward whatever's aimed at, turning orange once letting go will fire it. */}
      {pulling && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30">
          <div className="absolute inset-0 bg-black/60" />
          <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${box.w} ${box.h}`}>
            <line x1={bow.x} y1={bow.y} x2={tip.x} y2={tip.y} stroke="white" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 6" />
            <line x1={bow.x} y1={bow.y} x2={reach.x} y2={reach.y} stroke={armed ? "var(--color-paprika-bright)" : "white"} strokeWidth="4" strokeLinecap="round" />
            <circle cx={reach.x} cy={reach.y} r={armed ? 9 : 6} fill={armed ? "var(--color-paprika-bright)" : "white"} />
            <circle cx={bow.x} cy={bow.y} r="14" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="2" />
          </svg>
          <div className="absolute inset-x-3 top-8 grid gap-1" style={{ gridTemplateColumns: `repeat(${targets.length}, minmax(0, 1fr))` }}>
            {targets.map((key) => {
              const on = key === aimed;
              return (
                <div key={key} className={`flex flex-col items-center gap-1.5 transition-all duration-150 ${on ? "scale-110" : "scale-90 opacity-55"}`}>
                  <span
                    className={`grid size-14 place-items-center rounded-full shadow-lg transition-colors ${
                      on ? (armed ? "bg-paprika text-white ring-4 ring-paprika-bright/50" : "bg-white text-ink ring-4 ring-white/30") : "bg-white/15 text-white"
                    }`}
                  >
                    {TARGETS[key].icon}
                  </span>
                  <span className={`text-center text-xs leading-tight font-semibold ${on ? "text-white" : "text-white/70"}`}>{TARGETS[key].label}</span>
                </div>
              );
            })}
          </div>
          <p className="absolute inset-x-0 top-40 text-center font-display text-2xl font-extrabold text-white drop-shadow-lg">
            {armed ? (
              <>
                Let go: <span className="text-paprika-bright">{TARGETS[aimed].label}</span>
              </>
            ) : (
              <span className="text-lg font-semibold text-white/80">Pull further · aim left or right</span>
            )}
          </p>
        </div>
      )}
      {/* Photo: swipe sideways for next / back, pull down and let go to launch, tap to flip. */}
      <div
        {...gestures.photoHandlers}
        data-photo
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${hint && !dx && !pull ? "animate-hint" : ""}`}
        onAnimationEnd={(e) => e.animationName === "hint" && onHinted?.()}
        style={{
          transform: photoTransform,
          opacity: launching ? 0 : 1,
          transition: launching ? "transform 260ms cubic-bezier(.55,-0.35,.75,.2), opacity 260ms ease-in" : pull ? "none" : "transform 260ms cubic-bezier(.2,1.6,.4,1)",
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
        {/* A quiet way back without swiping (Another, beside search, moves on). Always there:
            on the first pick it says there's nothing back there. */}
        {(
          <button
            type="button"
            onClick={onBack}
            aria-label="Previous pick"
            className="absolute top-1/2 left-2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/30 text-white/80 backdrop-blur-sm transition hover:bg-black/50 hover:text-white"
          >
            <ChevronLeftIcon size={22} />
          </button>
        )}
        {/* Swipe feedback */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-5 top-1/3 rotate-[-12deg] rounded-lg border-4 border-paprika-bright px-3 py-1 font-display text-3xl font-extrabold text-paprika-bright"
          style={{ opacity: hasBack ? Math.max(0, progress) : 0 }}
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

        {/* In a group: your own answer (others' stay secret). Tap another answer below to change it. */}
        {answer && (
          <div className="pointer-events-none absolute top-3 right-3">
            <span
              className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white backdrop-blur-md ${
                answer === "love" ? "bg-social/90" : answer === "ok" ? "bg-teal/90" : "bg-black/60"
              }`}
            >
              {answer === "love" ? "♥ You love it" : answer === "ok" ? "👍 You said OK" : "✕ Not for you"}
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
        {pick.secondLook && answer === undefined && !returning && (
          <div className={`pointer-events-none absolute right-3 top-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center rounded-full bg-black/55 px-3 text-sm font-medium text-white backdrop-blur-md">Second look</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pt-4 pb-8">
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

      {/* Details: their own panel. Swipe sideways here too; opened, they scroll up and down. */}
      <div
        key={pick.id}
        {...gestures.panelHandlers}
        className={`animate-rise relative flex touch-pan-y items-start gap-4 rounded-t-3xl bg-ink-2 px-4 pt-4 pb-2 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] -mt-4 ${expanded ? "max-h-[60%] shrink-0 overflow-y-auto overscroll-contain" : ""}`}
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
          {fitsGroup && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-social/20 px-2.5 py-1 text-sm font-semibold text-social-bright">
              <span aria-hidden="true">✓</span> Fits the group&apos;s wishes
            </p>
          )}
          {/* A sponsor's own deal: paid for by the restaurant, clearly labeled, and only ever on its own card. */}
          {pick.sponsored && (
            <p className="mt-2 flex items-center gap-2 text-sm text-white/90">
              <span className="shrink-0 rounded bg-star/20 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-star uppercase">Sponsored</span>
              {pick.sponsored.url ? (
                <a href={pick.sponsored.url} target="_blank" rel="noopener noreferrer sponsored" className="min-w-0 truncate font-semibold underline-offset-2 hover:underline">
                  {pick.sponsored.deal}
                </a>
              ) : (
                <span className="min-w-0 truncate font-semibold">{pick.sponsored.deal}</span>
              )}
            </p>
          )}
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
              {answer === undefined && <PaymentLine payment={pick.payment} />}
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
