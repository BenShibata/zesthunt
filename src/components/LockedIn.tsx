"use client";

import { useEffect, useRef, useState } from "react";
import { ALLERGIES } from "@/lib/dietary";
import type { Pick } from "@/lib/types";
import { CLOSING_SOON_MINUTES, formatClock, minutesUntil, priceText } from "@/lib/time";
import { directionsUrl, orderAhead } from "@/lib/links";
import { SplitCard } from "./SplitCard";
import { RouteMap } from "./RouteMap";
import { SheetPaymentChips } from "./PaymentChips";
import { CarIcon, ClockIcon, CloseIcon, ExternalIcon, LeafIcon, PartyIcon, TagIcon, WalkIcon } from "./Icons";

interface Props {
  pick: Pick;
  now: Date;
  /** Set when everyone in a hunt party swiped right on this pick. */
  partyMatch?: boolean;
  /** Members in the party, to prefill the split. */
  partySize?: number;
  /** The user has allergies set: remind them we can't verify ingredients. */
  allergyNote?: boolean;
  /**
   * Right before eating is when allergies matter, so if none are set we ask here, once,
   * with one-tap chips. Saved like the rest of "What I eat".
   */
  allergies?: string[];
  onAllergiesChange?: (allergies: string[]) => void;
  /** Solo only: turn this pick into a party for a group still deciding. */
  onDecideTogether?: () => void;
  onClose: () => void;
}

export function LockedIn({ pick, now, partyMatch, partySize, allergyNote, allergies = [], onAllergiesChange, onDecideTogether, onClose }: Props) {
  const [askAllergies, setAskAllergies] = useState(() => allergies.length === 0);
  const heading = useRef<HTMLHeadingElement>(null);
  const closesIn = minutesUntil(pick.closesAt, now);
  const closingSoon = closesIn != null && closesIn <= CLOSING_SOON_MINUTES;
  const price = priceText(pick.priceLevel);
  const order = orderAhead(pick);
  const walking = pick.travelMode === "walk";

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <main className="flex h-dvh flex-col bg-sheet text-sheet-ink dark:bg-[#1b1916] dark:text-white">
      <div className="relative h-[32dvh] shrink-0">
        <RouteMap walkMinutes={pick.walkMinutes} name={pick.name} />
        {partyMatch && <Confetti />}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 inline-flex h-11 items-center gap-1 rounded-full bg-white/90 pr-4 pl-2.5 text-sm font-semibold text-sheet-ink shadow-md backdrop-blur dark:bg-black/70 dark:text-white"
        >
          <CloseIcon size={20} />
          Back to picks
        </button>
      </div>

      <section
        aria-labelledby="locked-title"
        className="relative -mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-3xl bg-sheet px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] dark:bg-[#1b1916]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-sheet-ink/15 dark:bg-white/20" aria-hidden="true" />

        {partyMatch ? (
          <p className="font-display text-2xl font-extrabold text-social dark:text-social-bright" role="status">
            It&apos;s a match!
          </p>
        ) : (
          <p className="text-sm font-semibold text-teal dark:text-teal-bright">Locked in</p>
        )}
        <h1 id="locked-title" ref={heading} tabIndex={-1} className="mt-0.5 font-display text-3xl leading-tight font-bold tracking-tight outline-none">
          {pick.name}
        </h1>
        <p className="mt-1 text-base text-sheet-muted dark:text-white/70">{pick.suggestion}</p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sheet-2 px-2 py-3 dark:bg-white/5">
            <dt className="sr-only">{walking ? "Walk" : "Drive"}</dt>
            <dd className="flex flex-col items-center gap-1">
              {walking ? <WalkIcon size={20} className="text-paprika dark:text-paprika-bright" /> : <CarIcon size={20} className="text-paprika dark:text-paprika-bright" />}
              <span className="font-display text-xl font-bold">
                {pick.timeEstimated && <span className="sr-only">about </span>}
                {pick.timeEstimated && <span aria-hidden="true">~</span>}
                {pick.travelUnknown ? "—" : `${pick.walkMinutes} min`}
              </span>
              <span className="text-xs text-sheet-muted dark:text-white/60">{walking ? "walk" : "drive"}</span>
            </dd>
          </div>
          <div className={`rounded-2xl px-2 py-3 ${closingSoon ? "bg-paprika/12 dark:bg-paprika/25" : "bg-sheet-2 dark:bg-white/5"}`}>
            <dt className="sr-only">Closing time</dt>
            <dd className="flex flex-col items-center gap-1">
              <ClockIcon size={20} className={closingSoon ? "text-paprika dark:text-paprika-bright" : "text-sheet-muted dark:text-white/60"} />
              <span className="font-display text-xl font-bold">{pick.closesAt ? formatClock(pick.closesAt) : "—"}</span>
              <span className="text-xs text-sheet-muted dark:text-white/60">
                {closingSoon ? `closes in ${closesIn} min` : pick.closesAt ? "closes" : "hours not listed"}
              </span>
            </dd>
          </div>
          <div className="rounded-2xl bg-sheet-2 px-2 py-3 dark:bg-white/5">
            <dt className="sr-only">Price level</dt>
            <dd className="flex flex-col items-center gap-1">
              <TagIcon size={20} className="text-sheet-muted dark:text-white/60" />
              <span className="font-display text-xl font-bold" aria-hidden="true">
                {pick.priceLevel ? price.visual : "—"}
              </span>
              <span className="text-xs text-sheet-muted dark:text-white/60">{pick.priceLevel ? "price, roughly" : "price not listed"}</span>
              <span className="sr-only">{price.spoken}</span>
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <SheetPaymentChips payment={pick.payment} hasOnlineOrdering={Boolean(pick.orderUrl)} />
        </div>

        {pick.upgradeTip && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-teal/10 px-4 py-3 text-sm text-teal-deep dark:bg-teal/20 dark:text-teal-bright">
            <LeafIcon size={18} className="mt-0.5 shrink-0" />
            <span>
              <span className="font-semibold">Easy upgrade: </span>
              {pick.upgradeTip}
            </span>
          </p>
        )}

        {allergyNote && (
          <p className="mt-3 rounded-2xl border border-sheet-ink/15 px-4 py-3 text-sm font-semibold dark:border-white/15" role="note">
            Check allergens with the restaurant.
          </p>
        )}

        {askAllergies && onAllergiesChange && !partyMatch && (
          <section aria-labelledby="allergy-ask" className="mt-3 rounded-2xl bg-sheet-2 px-4 py-3 dark:bg-white/5">
            <h2 id="allergy-ask" className="text-base font-semibold">
              Anything to keep away from?
            </h2>
            <p className="text-sm text-sheet-muted dark:text-white/65">Optional. We&apos;ll remind you to check with the restaurant.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ALLERGIES.map((a) => {
                const on = allergies.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onAllergiesChange(on ? allergies.filter((x) => x !== a) : [...allergies, a])}
                    className={`h-11 rounded-full px-3.5 text-sm font-semibold transition ${
                      on ? "bg-teal text-white" : "border border-sheet-ink/20 hover:bg-sheet dark:border-white/20 dark:hover:bg-white/5"
                    }`}
                  >
                    {a}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setAskAllergies(false)}
              className="mt-2 h-11 rounded-full px-1 text-sm font-semibold text-teal underline-offset-4 hover:underline dark:text-teal-bright"
            >
              {allergies.length > 0 ? "Done" : "Nothing, thanks"}
            </button>
          </section>
        )}

        {onDecideTogether && !partyMatch && (
          <button type="button" onClick={onDecideTogether} className={`${secondaryBtn} mt-3 w-full`}>
            <PartyIcon size={18} />
            Eating with others? Decide together
          </button>
        )}

        <SplitCard placeName={pick.name} defaultPeople={partySize ?? 2} startOpen={Boolean(partyMatch)} />

        {/* Pinned so "Start walking" stays in thumb reach even when the split card is open. */}
        <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 bg-sheet px-5 pt-4 dark:bg-[#1b1916]">
          <a
            href={directionsUrl(pick)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-paprika text-lg font-semibold text-white shadow-md transition hover:bg-paprika-deep active:scale-[0.99]"
          >
            {walking ? <WalkIcon size={22} /> : <CarIcon size={22} />}
            {walking ? "Start walking" : "Get directions"}
          </a>
          {order.kind === "own" && (
            <a href={order.url} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
              Order ahead on their site
              <ExternalIcon size={16} />
            </a>
          )}
          {order.kind === "delivery" && (
            <div className="flex items-center gap-2" role="group" aria-labelledby="order-ahead-label">
              <span id="order-ahead-label" className="shrink-0 text-sm font-semibold text-sheet-muted dark:text-white/70">
                Order ahead on
              </span>
              {order.options.map((o) => (
                <a key={o.app} href={o.url} target="_blank" rel="noopener noreferrer" className={`${secondaryBtn} flex-1 px-2 text-sm`}>
                  {o.app}
                  <ExternalIcon size={14} />
                </a>
              ))}
            </div>
          )}
          {order.kind === "none" && (
            <p className="text-center text-sm text-sheet-muted dark:text-white/70">Dine-in only, per Google. Just walk on over.</p>
          )}
          {pick.mapsUrl && (
            <a href={pick.mapsUrl} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
              Menu, photos and reviews
              <ExternalIcon size={16} />
            </a>
          )}
          <p className="pt-2 text-center text-xs text-sheet-muted dark:text-white/60">
            We never see your card. You pay in your own wallet.
          </p>
        </div>
      </section>
    </main>
  );
}

const secondaryBtn =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-sheet-ink/20 text-base font-semibold transition hover:bg-sheet-2 dark:border-white/20 dark:hover:bg-white/5";

const CONFETTI_COLORS = ["#c8401f", "#ff7a57", "#0f766e", "#3fd0bd", "#2563eb", "#7aa7ff"];

/** A small one-shot burst for a party match. Hidden under prefers-reduced-motion. */
function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="confetti absolute top-0 block h-3 w-2 rounded-sm"
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDelay: `${(i % 7) * 70}ms`,
              "--drift": `${((i * 53) % 80) - 40}px`,
              "--spin": `${(i * 97) % 720}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
