"use client";

import { useRef } from "react";
import { ArrowRightIcon, CarIcon, HeartIcon, MicIcon, SearchIcon, WalkIcon } from "./Icons";

/**
 * The bottom bar, in words rather than symbols: "Another" (skip), search (tap to type a
 * craving, hold to speak, inside the idle countdown ring) and "Let's go" (lock in and head
 * there). Rewind lives in an Undo chip after a skip; Surprise sits on the area line.
 */
interface Props {
  disabled: boolean;
  /** How the current pick is reached, so "Let's go" shows walking or driving. */
  travelMode: "walk" | "drive";
  /**
   * In a party this is a vote, not a decision: "Pass" and "♥ Vote for it", with your progress
   * through the shared deck in the middle (cravings are solo-only, so no search there).
   */
  vote?: { done: number; total: number };
  listening: boolean;
  /** 1 → 0, time left before picks clear. */
  timeLeft: number;
  minutesLeft: number;
  onSkip: () => void;
  onGo: () => void;
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

  // Labeled pills: words say what happens ("close the app?" was what a bare ✕ suggested).
  const pill =
    "flex h-14 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-base font-semibold whitespace-nowrap text-white shadow-lg transition active:scale-95 disabled:opacity-40";
  // Icons are a bonus; on the narrowest phones the words alone have to fit.
  const pillIcon = "hidden shrink-0 min-[360px]:block";

  if (p.vote) {
    return (
      <div className="flex items-center gap-2 px-4 pt-2 pb-1 min-[360px]:gap-3">
        <button type="button" className={`${pill} bg-white/12 hover:bg-white/18`} onClick={p.onSkip} disabled={p.disabled} aria-label="Pass on this place">
          Pass
        </button>
        <div className="grid size-[88px] shrink-0 place-items-center rounded-full border-2 border-white/15 text-center" role="status" aria-label={`You've voted on ${p.vote.done} of ${p.vote.total} places`}>
          <span aria-hidden="true" className="leading-tight">
            <span className="block font-display text-xl font-bold tabular-nums">
              {p.vote.done}/{p.vote.total}
            </span>
            <span className="text-[11px] text-white/60">voted</span>
          </span>
        </div>
        <button type="button" className={`${pill} bg-social hover:brightness-110`} onClick={p.onGo} disabled={p.disabled} aria-label="Vote for this place">
          <HeartIcon size={20} className={pillIcon} />
          Vote for it
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 pt-2 pb-1 min-[360px]:gap-3">
      <button type="button" className={`${pill} bg-white/12 hover:bg-white/18`} onClick={p.onSkip} disabled={p.disabled} aria-label="Another pick">
        Another
        <ArrowRightIcon size={18} className={pillIcon} />
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
          aria-label={`Search for a craving. Tap to type, or hold to speak. Picks clear in ${p.minutesLeft} minute${p.minutesLeft === 1 ? "" : "s"}.`}
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

      <button
        type="button"
        className={`${pill} bg-paprika hover:bg-paprika-deep`}
        onClick={p.onGo}
        disabled={p.disabled}
        aria-label={`Let's go: ${p.travelMode === "drive" ? "drive" : "walk"} to this pick`}
      >
        {p.travelMode === "drive" ? <CarIcon size={20} className={pillIcon} /> : <WalkIcon size={20} className={pillIcon} />}
        Let&apos;s go
      </button>
    </div>
  );
}
