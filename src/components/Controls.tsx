"use client";

import { useRef } from "react";
import { MicIcon, SearchIcon } from "./Icons";

/**
 * The bottom bar is just search: tap to type a craving, hold to speak, inside the idle
 * countdown ring. Moving between picks is swiping (or the card's arrows), and going is
 * pulling the photo down (or its handle), so there's nothing else to press here. In a
 * group, the same search finds a place to add to the vote.
 */
interface Props {
  listening: boolean;
  /** In a group the idle timer is paused: the ring stays full. */
  group?: boolean;
  /** 1 → 0, time left before picks clear. */
  timeLeft: number;
  minutesLeft: number;
  onType: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

const HOLD_MS = 350;

export function Controls(p: Props) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const ring = 2 * Math.PI * 41;
  const urgent = p.timeLeft < 0.1;

  return (
    <div className="flex items-center justify-center px-4 pt-2 pb-1">
      {/* Center: tap to type, hold to speak, wrapped in the countdown ring */}
      <div className="relative grid size-[88px] place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r="41" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="44"
            cy="44"
            r="41"
            fill="none"
            stroke={urgent ? "#ff7a57" : "rgba(255,255,255,0.75)"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={ring * (1 - p.timeLeft)}
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <button
          type="button"
          className={`relative grid size-[70px] place-items-center rounded-full shadow-xl transition active:scale-95 ${
            p.listening ? "scale-110 bg-paprika text-white" : "bg-white text-ink"
          }`}
          aria-pressed={p.listening}
          aria-label={
            p.group
              ? "Search for a place to add to the vote. Tap to type, or hold to speak."
              : `Search for a craving. Tap to type, or hold to speak. Picks clear in ${p.minutesLeft} minute${p.minutesLeft === 1 ? "" : "s"}.`
          }
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            held.current = false;
            holdTimer.current = setTimeout(() => {
              held.current = true;
              p.onHoldStart();
            }, HOLD_MS);
          }}
          onPointerUp={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            if (held.current) p.onHoldEnd();
          }}
          onPointerLeave={() => {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            if (held.current) {
              held.current = false;
              p.onHoldEnd();
            }
          }}
          onClick={() => {
            if (!held.current) p.onType();
            held.current = false;
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {p.listening ? <MicIcon size={30} /> : <SearchIcon size={30} />}
        </button>
      </div>

    </div>
  );
}
