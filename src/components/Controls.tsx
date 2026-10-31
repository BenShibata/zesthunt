"use client";

import { useRef } from "react";
import { DiceIcon, GoIcon, MicIcon, RewindIcon, SkipIcon } from "./Icons";

interface Props {
  canRewind: boolean;
  disabled: boolean;
  listening: boolean;
  /** 1 → 0, time left before picks clear. */
  timeLeft: number;
  minutesLeft: number;
  onRewind: () => void;
  onSkip: () => void;
  onGo: () => void;
  onWildcard: () => void;
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

  const side =
    "grid size-12 place-items-center rounded-full bg-white/10 text-white transition active:scale-95 disabled:opacity-35 hover:bg-white/15";
  const main =
    "grid size-15 place-items-center rounded-full text-white shadow-lg transition active:scale-95 disabled:opacity-40";

  return (
    <div className="flex items-center justify-center gap-2 px-4 pt-2 pb-1">
      <button type="button" className={side} onClick={p.onRewind} disabled={!p.canRewind} aria-label="Rewind: bring back the last pick">
        <RewindIcon size={20} />
      </button>
      <button type="button" className={`${main} bg-white/15 hover:bg-white/20`} onClick={p.onSkip} disabled={p.disabled} aria-label="Skip this pick">
        <SkipIcon size={26} />
      </button>

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
          aria-label={`Tell Zesthunt what you're craving. Tap to type, hold to speak. Picks clear in ${p.minutesLeft} minute${p.minutesLeft === 1 ? "" : "s"}.`}
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
          <MicIcon size={30} />
        </button>
      </div>

      <button
        type="button"
        className={`${main} bg-paprika hover:bg-paprika-deep`}
        onClick={p.onGo}
        disabled={p.disabled}
        aria-label="Go: lock in this pick"
      >
        <GoIcon size={28} />
      </button>
      <button type="button" className={side} onClick={p.onWildcard} aria-label="Wildcard: surprise me with something outside this mood (or shake your phone)">
        <DiceIcon size={20} />
      </button>
    </div>
  );
}
