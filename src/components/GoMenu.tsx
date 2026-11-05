"use client";

import type { ReactNode } from "react";
import type { Pick } from "@/lib/types";
import type { AimKey } from "@/lib/aim";
import { directionsUrl, orderAhead } from "@/lib/links";
import { BagIcon, CarIcon, MoreIcon, PhoneIcon, WalkIcon } from "./Icons";

/**
 * "Let's go": the same choices as aiming a pull, as a menu. Directions, ordering on the
 * restaurant's own site and calling open straight from the tap (links, so the browser allows
 * it); every choice also opens the journey screen behind, with everything else.
 */
export function GoMenu({ pick, onChoose, onClose }: { pick: Pick; onChoose: (target: AimKey) => void; onClose: () => void }) {
  const order = orderAhead(pick);
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
        <a href={directionsUrl(pick)} target="_blank" rel="noopener noreferrer" onClick={() => onChoose("directions")} className={row}>
          {icon(walking ? <WalkIcon size={20} /> : <CarIcon size={20} />, "bg-paprika")}
          <span>
            Head there
            {!pick.travelUnknown && sub(`${pick.timeEstimated ? "~" : ""}${pick.walkMinutes} min ${walking ? "walk" : "drive"}`)}
          </span>
        </a>
        {order.kind === "own" && (
          <a href={order.url} target="_blank" rel="noopener noreferrer" onClick={() => onChoose("order")} className={row}>
            {icon(<BagIcon size={20} />)}
            <span>
              Order to go
              {sub("On their own site")}
            </span>
          </a>
        )}
        {order.kind === "delivery" && (
          <button type="button" onClick={() => onChoose("order")} className={row}>
            {icon(<BagIcon size={20} />)}
            <span>
              Order to go
              {sub("DoorDash or Uber Eats")}
            </span>
          </button>
        )}
        {pick.phoneDial && (
          <a href={`tel:${pick.phoneDial}`} onClick={() => onChoose("call")} className={row}>
            {icon(<PhoneIcon size={20} />)}
            <span>
              {pick.reservable ? "Call to reserve" : "Call"}
              {pick.phone && sub(pick.phone)}
            </span>
          </a>
        )}
        <button type="button" onClick={() => onChoose("journey")} className={row}>
          {icon(<MoreIcon size={20} />)}
          <span>
            All the details
            {sub("Hours, price, split the bill, send to a friend")}
          </span>
        </button>
      </section>
    </div>
  );
}
