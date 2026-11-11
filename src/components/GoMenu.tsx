"use client";

import type { ReactNode } from "react";
import type { Pick } from "@/lib/types";
import type { AimKey } from "@/lib/aim";
import { bookTableUrl, directionsUrl, orderAhead, referralsOn } from "@/lib/links";
import { BagIcon, CarIcon, ClockIcon, ExternalIcon, MoreIcon, PhoneIcon, TagIcon, WalkIcon } from "./Icons";

/**
 * "Let's go": the same choices as aiming a pull, as a menu. Directions, ordering on the
 * restaurant's own site and calling open straight from the tap (links, so the browser allows
 * it); every choice also opens the journey screen behind, with everything else.
 */
export function GoMenu({ pick, onChoose, onClose }: { pick: Pick; onChoose: (target: AimKey) => void; onClose: () => void }) {
  const order = orderAhead(pick);
  const book = bookTableUrl(pick);
  const walking = pick.travelMode === "walk";
  const row =
    "flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-base font-semibold text-white transition hover:bg-white/8 active:scale-[0.99]";
  const icon = (node: ReactNode, tone = "bg-white/10") => <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone}`}>{node}</span>;
  const sub = (text: string) => <span className="block text-sm font-normal text-white/60">{text}</span>;

  return (
    <div className="relative z-40 h-0">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="fixed inset-0 -z-10 cursor-default bg-black/60" />
      <section
        role="dialog"
        aria-labelledby="go-menu-title"
        className="animate-rise absolute inset-x-3 bottom-2 rounded-3xl bg-ink-3 p-2 shadow-2xl ring-1 ring-white/10"
      >
        <h2 id="go-menu-title" className="px-3 pt-2 pb-1 text-sm font-semibold text-white/60">
          Let&apos;s go to {pick.name}
        </h2>
        <a
          href={directionsUrl(pick)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onChoose("directions")}
          className={row}
          aria-label={`Head there${pick.travelUnknown ? "" : `: ${pick.walkMinutes} min ${walking ? "walk" : "drive"}`}`}
        >
          {icon(walking ? <WalkIcon size={20} /> : <CarIcon size={20} />, "bg-paprika")}
          <span>
            Head there
            {!pick.travelUnknown && sub(`${pick.timeEstimated ? "~" : ""}${pick.walkMinutes} min ${walking ? "walk" : "drive"}`)}
          </span>
        </a>
        {order.kind === "own" && (
          // Places gives no ordering link: this is the restaurant's own website, so it says so.
          <a href={order.url} target="_blank" rel="noopener noreferrer" onClick={() => onChoose("order")} className={row} aria-label={`Website: ${pick.name}`}>
            {icon(<ExternalIcon size={20} />)}
            <span>
              Website
              {sub("Their own site, which may take orders")}
            </span>
          </a>
        )}
        {order.kind === "delivery" && (
          <button type="button" onClick={() => onChoose("order")} className={row} aria-label="Order to go: DoorDash or Uber Eats">
            {icon(<BagIcon size={20} />)}
            <span>
              Order to go
              {sub("DoorDash or Uber Eats")}
            </span>
          </button>
        )}
        {pick.phoneDial && (
          <a
            href={`tel:${pick.phoneDial}`}
            onClick={() => onChoose("call")}
            className={row}
            aria-label={`${pick.reservable ? "Call to reserve" : "Call"} ${pick.name}${pick.phone ? `, ${pick.phone}` : ""}`}
          >
            {icon(<PhoneIcon size={20} />)}
            <span>
              {pick.reservable ? "Call to reserve" : "Call"}
              {pick.phone && sub(pick.phone)}
            </span>
          </a>
        )}
        {book && (
          <a href={book} target="_blank" rel="noopener noreferrer" onClick={() => onChoose("journey")} className={row} aria-label="Book a table on OpenTable">
            {icon(<ClockIcon size={20} />)}
            <span>
              Book a table
              {sub("Find it on OpenTable")}
            </span>
          </a>
        )}
        {pick.sponsored && (
          <SponsoredRow deal={pick.sponsored.deal} url={pick.sponsored.url} className={row} icon={icon(<TagIcon size={20} />, "bg-star/20 text-star")} />
        )}
        <button type="button" onClick={() => onChoose("journey")} className={row} aria-label="All the details: hours, price, split the bill, send to a friend">
          {icon(<MoreIcon size={20} />)}
          <span>
            All the details
            {sub("Hours, price, split the bill, send to a friend")}
          </span>
        </button>
        {referralsOn && <p className="px-3 pt-1 pb-2 text-xs text-white/50">Zesthunt may earn a small fee from some of these links. Your price doesn&apos;t change.</p>}
      </section>
    </div>
  );
}

/** A sponsor's own deal, labeled as sponsored. Paid for by the restaurant; it never changes which places you see. */
function SponsoredRow({ deal, url, className, icon }: { deal: string; url?: string; className: string; icon: ReactNode }) {
  const body = (
    <>
      {icon}
      <span>
        <span className="mr-1.5 rounded bg-star/20 px-1.5 py-0.5 align-middle text-[11px] font-bold tracking-wide text-star uppercase">Sponsored</span>
        {deal}
      </span>
    </>
  );
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer sponsored" className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
