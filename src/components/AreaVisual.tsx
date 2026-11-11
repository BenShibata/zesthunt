"use client";

import { useId } from "react";
import type { AreaSource } from "@/lib/types";

type LatLng = { lat: number; lng: number };

const W = 280;
const H = 150;
const CX = W / 2;
const CY = H / 2;
const PX_PER_KM = 64;
/** A 0.01° cell is ~1.1 km tall; a 0.75 km radius covers it. */
const AREA_R = 0.75 * PX_PER_KM;

/** Where the exact spot sits inside the sent circle, worked out on the device only. */
function offset(precise: LatLng, sent: LatLng) {
  const kmN = (precise.lat - sent.lat) * 111.32;
  const kmE = (precise.lng - sent.lng) * 111.32 * Math.cos((sent.lat * Math.PI) / 180);
  return { x: CX + kmE * PX_PER_KM, y: CY - kmN * PX_PER_KM };
}

/** A stylized street grid. No map tiles: nothing here is fetched. */
function Streets() {
  const lines = [];
  for (let x = -40; x <= W + 40; x += 34) lines.push(<line key={`v${x}`} x1={x} y1={-20} x2={x + 18} y2={H + 20} />);
  for (let y = -10; y <= H + 20; y += 30) lines.push(<line key={`h${y}`} x1={-20} y1={y} x2={W + 20} y2={y - 10} />);
  return (
    <g className="stroke-white/12" strokeWidth={6} strokeLinecap="round">
      {lines}
      <line x1={-20} y1={H} x2={W + 20} y2={10} className="stroke-white/18" strokeWidth={9} />
    </g>
  );
}

/**
 * Shows what leaves the phone: a soft ~1 km circle, never a pin.
 * With a precise fix, a dot marks the exact spot that stays on the device.
 */
export function AreaVisual({
  source,
  sent,
  precise,
  label,
  className = "",
}: {
  source: AreaSource | "preview";
  sent?: LatLng | null;
  precise?: LatLng | null;
  label?: string | null;
  className?: string;
}) {
  const blur = useId();
  const you = source === "preview" ? { x: CX + 22, y: CY - 15 } : source === "device" && precise && sent ? offset(precise, sent) : null;
  const radius = source === "ip" ? AREA_R * 2.4 : AREA_R;

  const caption =
    source === "demo"
      ? "Demo mode: no location is used."
      : source === "ip"
        ? `A city-level guess${label ? ` (${label})` : ""}. Nothing more precise.`
        : source === "typed"
          ? "Only the words you typed are sent."
          : "Only this ~1 km area leaves your device.";

  return (
    <figure className={className}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-hidden rounded-2xl bg-ink-2" aria-hidden="true">
        <defs>
          <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <Streets />
        {source !== "demo" && (
          <>
            <circle cx={CX} cy={CY} r={radius} className="fill-teal-bright/30" filter={`url(#${blur})`} />
            <circle cx={CX} cy={CY} r={radius} fill="none" className="stroke-teal-bright/80" strokeWidth={1.5} strokeDasharray="4 5" />
          </>
        )}
        {source === "typed" && label && (
          <text x={CX} y={CY + 5} textAnchor="middle" className="fill-white font-display text-[15px] font-bold">
            “{label.length > 24 ? `${label.slice(0, 23)}…` : label}”
          </text>
        )}
        {you && (
          <g>
            <circle cx={you.x} cy={you.y} r={9} className="fill-paprika-bright/30" />
            <circle cx={you.x} cy={you.y} r={4.5} className="fill-paprika-bright stroke-ink" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
        {source !== "demo" && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full border border-dashed border-teal-bright bg-teal-bright/30" />
            {caption}
          </span>
        )}
        {you && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-full bg-paprika-bright" />
            Your exact spot stays on this device.
          </span>
        )}
        {source === "demo" && caption}
      </figcaption>
    </figure>
  );
}
