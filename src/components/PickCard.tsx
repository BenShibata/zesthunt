"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import type { HealthLabel, Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, distanceText, formatClock, mealFrame, minutesUntil, priceText, ratingText } from "@/lib/time";
import { PickPhoto } from "./PickPhoto";
import { PaymentLine } from "./PaymentChips";
import { PlateRing } from "./PlateRing";
import { BagIcon, CarIcon, ChevronDownIcon, ClockIcon, ExternalIcon, LeafIcon, MoreIcon, PartyIcon, PhoneIcon, PinIcon, SearchIcon, UtensilsIcon, WalkIcon } from "./Icons";
import { useCardGestures } from "@/hooks/useCardGestures";
import { directionsUrl, orderAhead } from "@/lib/links";
import { aimAt, aimTargets, type AimKey } from "@/lib/aim";
import { foodSymbol, placeHue } from "@/lib/look";

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
  /** Which side the card comes in from: right when moving on, left when going back. */
  enterFrom?: "right" | "left";
  /** Solo: this pick is on the Maybes list. */
  isMaybe?: boolean;
  /** The first pick of a visit: its photo loads straight away (later ones wait a beat, so quick skips cost nothing). */
  photoNow?: boolean;
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
  photoNow,
  isMaybe,
  enterFrom = "right",
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
  // Whether the open details are scrolled to their top: then a downward drag there pulls the card.
  const [scroll, setScroll] = useState({ id: pick.id, top: true });
  const detailsAtTop = scroll.id === pick.id ? scroll.top : true;
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
    // The details pull like the photo while closed, or open and scrolled to the top; swiping up opens them.
    panelFree: !expanded || detailsAtTop,
    onSwipeUp: expanded ? undefined : onExpand,
    disabled,
  });
  const { dx, progress, pull, tension, armed, launching, aim, settle } = gestures;
  // Each place looks different even before its photo arrives: its own color, and a symbol for its food.
  const symbol = foodSymbol(pick);
  const tint = { hue: placeHue(pick), symbol };
  const aimed = aimAt(aim, has);
  const pulling = aiming && (pull > 0 || launching);
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
  // The card's size, for drawing the bow, the arrow and the targets.
  const cardRef = useRef<HTMLDivElement>(null);
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
  }, [pick.id]);
  // Targets sit in a gentle arc across the top (the middle highest), like a range to aim at.
  const n = targets.length;
  const targetPos = (key: AimKey) => {
    const i = targets.indexOf(key);
    const off = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
    return { x: 16 + (i + 0.5) * ((box.w - 32) / n), y: 60 + off * off * 26 };
  };
  const tip = targetPos(aimed);
  // The bow sits near the bottom of the photo and follows the aim a little; its string draws back with the pull.
  const bow = { x: box.w / 2 + aim * 0.3, y: Math.min(box.photoH - 30, Math.max(tip.y + 190, box.photoH * 0.72)) };
  const nock = { x: bow.x, y: bow.y + 8 + tension * 30 };
  const arrowEnd = { x: tip.x, y: tip.y + 40 };
  // The arrow's flight path curves up toward the target.
  const flight = `M ${nock.x} ${nock.y} Q ${(nock.x + arrowEnd.x) / 2} ${Math.min(nock.y, arrowEnd.y) - 40} ${arrowEnd.x} ${arrowEnd.y}`;
  const RING = 2 * Math.PI * 35;
  // The whole card (photo and details) moves with the pull, then flies at the target.
  const cardTransform = launching
    ? `translate(${(tip.x - box.w / 2) * 0.7}px, -95%) scale(0.55) rotate(${(tip.x - box.w / 2) / 40}deg)`
    : dx
      ? `translateX(${dx}px) rotate(${dx / 50}deg)`
      : pull
        ? `translate(${aim * 0.2}px, ${pull}px) rotate(${aim / 80}deg) scale(${1 - tension * 0.03})`
        : undefined;

  return (
    <div ref={cardRef} className="relative flex min-h-0 flex-1 flex-col">
    <AimOverlay
      show={pulling}
      armed={armed}
      launching={launching}
      tension={tension}
      box={box}
      targets={targets.map((key) => ({ key, ...targetPos(key), ...TARGETS[key] }))}
      aimed={aimed}
      bow={bow}
      nock={nock}
      flight={flight}
      ring={RING}
      symbol={symbol}
    />
    <article
      // A new place is a new card: it slides in from the side, so moving on never looks like the same card springing back.
      key={pick.id}
      aria-labelledby="pick-title"
      aria-describedby="pick-reason"
      className={`relative flex min-h-0 flex-1 flex-col ${enterFrom === "left" ? "animate-enter-left" : "animate-enter-right"}`}
      style={{
        transform: cardTransform,
        opacity: settle === "fly" ? 0.4 : launching ? 0 : undefined,
        transition: launching
          ? "transform 360ms cubic-bezier(.5,-0.3,.7,.3), opacity 360ms ease-in"
          : settle === "fly"
            ? "transform 180ms ease-in, opacity 180ms ease-in"
            : dx || pull
              ? "none"
              : "transform 320ms cubic-bezier(.2,1.5,.4,1)",
      }}
    >
      {/* Photo: swipe sideways for next / back, pull down and let go to launch, tap to flip. */}
      <div
        {...gestures.photoHandlers}
        data-photo
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${hint && !dx && !pull ? "animate-hint" : ""}`}
        onAnimationEnd={(e) => e.animationName === "hint" && onHinted?.()}

      >
        <PickPhoto
          key={`${pick.id}-${at}`}
          photo={photo}
          tint={tint}
          instant={at > 0 || photoNow}
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
        {isMaybe && !answer && (
          <div className={`pointer-events-none absolute top-3 right-3 transition-opacity ${quietBadge ? "opacity-0" : ""}`}>
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-black/60 px-3 text-sm font-semibold text-star backdrop-blur-md">
              <span aria-hidden="true">★</span> Your maybe
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
        onScroll={(e) => {
          const top = e.currentTarget.scrollTop <= 0;
          if (top !== detailsAtTop) setScroll({ id: pick.id, top });
        }}
        // Closed: every drag is ours. Open at the top: the browser only scrolls the content down (finger
        // moving up), so a downward drag is a pull. (Safari lacks pan-down and keeps pan-y there.)
        style={{ touchAction: !expanded ? "none" : detailsAtTop ? "pan-down" : "pan-y" }}
        className={`animate-rise relative flex select-none items-start gap-4 rounded-t-3xl bg-ink-2 px-4 pt-4 pb-2 shadow-[0_-10px_30px_rgba(0,0,0,0.35)] -mt-4 ${expanded ? "max-h-[60%] shrink-0 overflow-y-auto overscroll-contain" : ""}`}
        {...(expanded ? { tabIndex: 0, "aria-label": `Details about ${pick.name}` } : {})}
      >
        <div className="min-w-0 flex-1">
          {expanded && <p className="mb-1 text-xs font-semibold tracking-wide text-white/60 uppercase">{mealFrame(now)}</p>}
          {/* The place leads: it's what people decide on. The dish line shows only when it's
              specific to the place; a guess from the place's type shows the type instead. */}
          <h1 id="pick-title" className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-tight text-white">
            {pick.name}
          </h1>
          <p id="pick-reason" className="mt-1 text-base text-white/80">
            <span aria-hidden="true" className="mr-1.5">
              {symbol}
            </span>
            {pick.guessed ? (pick.kind ?? pick.reason) : pick.suggestion}
          </p>
          {/* The decision-makers, up front: rating, price, and how long it's open. */}
          <p className="mt-1.5 line-clamp-2 text-sm text-white/65">
            {rating && (
              <>
                <span aria-hidden="true" className="text-white/90">
                  <span className="text-star">★</span> {rating.visual}
                </span>
                <span className="sr-only">{rating.spoken}, </span>
                <span aria-hidden="true"> · </span>
              </>
            )}
            {pick.priceLevel && (
              <>
                <span aria-hidden="true" className="text-white/90">
                  {price.visual}
                </span>
                <span className="sr-only">{price.spoken}, </span>
                <span aria-hidden="true"> · </span>
              </>
            )}
            {pick.closesAt && !closingSoon ? <span className="whitespace-nowrap">Open till {formatClock(pick.closesAt)}</span> : !pick.closesAt && <span>Open now</span>}
          </p>
          {expanded && !pick.guessed && pick.reason && <p className="mt-1.5 text-sm text-white/70">{pick.reason}</p>}
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
                More about this place
                <ChevronDownIcon size={15} />
              </button>
            )
          )}
        </div>
        {expanded && <PlateRing plate={pick.plate} />}
      </div>
    </article>
    </div>
  );
}

/**
 * The bow and arrow, drawn over the card while it's pulled (the card moves; this stays put).
 * Targets in an arc; a bow whose string draws back with the pull; an arrow curving toward the
 * aimed target; a ring around that target filling as the pull tightens (orange when letting go
 * will fire); and, on release, a little burst of the place's food at the target.
 */
function AimOverlay({
  show,
  armed,
  launching,
  tension,
  box,
  targets,
  aimed,
  bow,
  nock,
  flight,
  ring,
  symbol,
}: {
  show: boolean;
  armed: boolean;
  launching: boolean;
  tension: number;
  box: { w: number; h: number };
  targets: { key: AimKey; x: number; y: number; label: string; icon: ReactNode }[];
  aimed: AimKey;
  bow: { x: number; y: number };
  nock: { x: number; y: number };
  flight: string;
  ring: number;
  symbol: string;
}) {
  if (!show) return null;
  const hot = armed ? "var(--color-paprika-bright)" : "white";
  const t = targets.find((x) => x.key === aimed)!;
  return (
    <div aria-hidden="true" className="animate-fade pointer-events-none absolute inset-0 z-30">
      <div className="absolute inset-0 bg-ink/55" />
      <svg className="absolute inset-0 size-full overflow-visible" viewBox={`0 0 ${box.w} ${box.h}`}>
        <defs>
          <marker id="arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={hot} />
          </marker>
        </defs>
        {/* The flight path, faint; the arrow itself grows along it with the pull. */}
        {!launching && <path d={flight} fill="none" stroke="white" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="3 7" />}
        <path
          d={flight}
          fill="none"
          stroke={hot}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${Math.max(0.12, launching ? 1 : tension)} 1`}
          markerEnd={armed || launching ? "url(#arrowhead)" : undefined}
          className="transition-[stroke] duration-150"
        />
        {/* The bow: a curved limb, and a string drawn back to the nock. */}
        {!launching && (
          <g stroke="white" strokeLinecap="round" fill="none">
            <path d={`M ${bow.x - 44} ${bow.y + 14} Q ${bow.x} ${bow.y - 22} ${bow.x + 44} ${bow.y + 14}`} strokeWidth="5" strokeOpacity="0.9" />
            <path d={`M ${bow.x - 44} ${bow.y + 14} L ${nock.x} ${nock.y} L ${bow.x + 44} ${bow.y + 14}`} strokeWidth="1.5" strokeOpacity="0.7" />
          </g>
        )}
        {/* How far to pull: the aimed target's ring fills, and turns orange when it's ready to fire. */}
        <circle
          cx={t.x}
          cy={t.y}
          r="35"
          fill="none"
          stroke={hot}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${ring * (launching ? 1 : tension)} ${ring}`}
          transform={`rotate(-90 ${t.x} ${t.y})`}
        />
      </svg>
      {targets.map((x) => {
        const on = x.key === aimed;
        return (
          <div
            key={x.key}
            className={`absolute flex w-20 -translate-x-1/2 -translate-y-7 flex-col items-center gap-1.5 transition-all duration-150 ${on ? "scale-110" : "scale-90 opacity-50"} ${on && armed && !launching ? "animate-wiggle" : ""}`}
            style={{ left: x.x, top: x.y }}
          >
            <span
              className={`grid size-14 place-items-center rounded-full shadow-lg transition-colors ${
                on ? (armed || launching ? "bg-paprika text-white" : "bg-white text-ink") : "bg-white/15 text-white"
              }`}
            >
              {on && launching ? <span className="animate-pop text-2xl font-bold">✓</span> : x.icon}
            </span>
            <span className={`text-center text-xs leading-tight font-semibold ${on ? "text-white" : "text-white/70"}`}>{x.label}</span>
          </div>
        );
      })}
      {/* A little burst of the place's food at the target as it lands. */}
      {launching &&
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <span
              key={i}
              className="animate-burst absolute text-2xl"
              style={{ left: t.x - 12, top: t.y - 16, "--bx": `${Math.cos(a) * 70}px`, "--by": `${Math.sin(a) * 70}px` } as React.CSSProperties}
            >
              {symbol}
            </span>
          );
        })}
      {armed && !launching && (
        <p className="absolute inset-x-0 text-center" style={{ top: t.y + 64 }}>
          <span className="inline-flex h-9 items-center rounded-full bg-paprika px-4 text-sm font-bold text-white shadow-lg">Let go: {t.label}</span>
        </p>
      )}
    </div>
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
