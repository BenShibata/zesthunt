"use client";

import { useRef, type ReactNode } from "react";
import { ArrowRightIcon, HeartIcon, MicIcon, SearchIcon, XIcon } from "./Icons";

/**
 * The bottom bar, beside the gestures rather than instead of them: a "move on" button on the
 * left, search in the middle (tap to type, hold to speak, inside the idle countdown ring),
 * and the main action on the right: Let's go solo, Vote in a group, Add while adding.
 */
interface Props {
  /** Left: move on ("Another" solo, "Next" in a group). */
  next?: { label: string; onClick: () => void };
  /** Right: the main action for the pick on screen. */
  primary?: { label: string; aria: string; onClick: () => void; tone: "go" | "vote" | "voted" | "add"; icon?: ReactNode };
  disabled?: boolean;
  /**
   * In a group: three answers for the place on screen, always visible. The current answer
   * stays highlighted; tapping another changes it.
   */
  answer?: { value: "love" | "ok" | "no" | null; onAnswer: (a: "love" | "ok" | "no") => void; place: string };
  /** Searching: the side buttons fade away, leaving just search. */
  searching?: boolean;
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
  // Labeled pills: words say what happens. Icons are a bonus; on the narrowest phones the words alone fit.
  const pill =
    "flex h-14 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-base font-semibold whitespace-nowrap text-white shadow-lg transition active:scale-95 disabled:opacity-40";
  const pillIcon = "hidden shrink-0 min-[360px]:block";
  if (p.answer) {
    const a = p.answer;
    const opt = (key: "no" | "ok" | "love", label: string, icon: ReactNode, on: string) => {
      const chosen = a.value === key;
      return (
        <button
          type="button"
          aria-pressed={chosen}
          aria-label={`${label}: ${a.place}`}
          onClick={() => a.onAnswer(key)}
          disabled={p.disabled}
          className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-2xl text-sm leading-tight font-semibold transition active:scale-95 disabled:opacity-40 ${
            chosen ? `${on} ring-2 ring-white` : a.value ? "bg-white/8 text-white/60" : "bg-white/12 text-white hover:bg-white/18"
          }`}
        >
          {icon}
          {label}
        </button>
      );
    };
    return (
      <div className="relative z-30 px-4 pt-2 pb-1" role="group" aria-label="Your answer for this place">
        <div className="flex gap-2">
          {opt("no", "Not for me", <XIcon size={18} />, "bg-white/25 text-white")}
          {opt("ok", "OK", <span aria-hidden="true" className="text-base">👍</span>, "bg-teal text-white")}
          {opt("love", "Love it", <HeartIcon size={18} />, "bg-social text-white")}
        </div>
        <p className="pt-1.5 text-center text-xs text-white/55" aria-live="polite">
          {a.value ? "Tap another to change your answer." : "Answers stay secret until the reveal."}
        </p>
      </div>
    );
  }

  const tones = { go: "bg-paprika hover:bg-paprika-deep", vote: "bg-social hover:brightness-110", voted: "bg-social/30 ring-2 ring-social", add: "bg-social hover:brightness-110" };
  const urgent = p.timeLeft < 0.1;

  return (
    <div className={`relative flex items-center gap-2 px-4 pt-2 pb-1 min-[360px]:gap-3 ${p.searching ? "z-50" : "z-30"}`}>
      {p.next ? (
        <button
          type="button"
          className={`${pill} bg-white/12 hover:bg-white/18 ${p.searching ? "pointer-events-none opacity-0" : ""}`}
          onClick={p.next.onClick}
          disabled={p.disabled}
          tabIndex={p.searching ? -1 : undefined}
        >
          {p.next.label}
          <ArrowRightIcon size={18} className={pillIcon} />
        </button>
      ) : (
        <span className="flex-1" />
      )}
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

      {p.primary ? (
        <button
          type="button"
          className={`${pill} ${tones[p.primary.tone]} ${p.searching ? "pointer-events-none opacity-0" : ""}`}
          onClick={p.primary.onClick}
          disabled={p.disabled}
          aria-label={p.primary.aria}
          tabIndex={p.searching ? -1 : undefined}
        >
          {p.primary.icon && <span className={pillIcon}>{p.primary.icon}</span>}
          {p.primary.label}
        </button>
      ) : (
        <span className="flex-1" />
      )}
    </div>
  );
}
