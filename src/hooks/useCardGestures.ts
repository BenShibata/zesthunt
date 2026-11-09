"use client";

import { useRef, useState, type PointerEvent } from "react";
import { haptic } from "@/lib/haptics";

/** Sideways distance that moves to the next or previous pick. */
const SWIPE_AT = 96;
/** How far to pull down before letting go launches (like drawing a bow). */
export const PULL_AT = 110;
/** Movement before a gesture picks a direction; less than this and it's a tap. */
const DECIDE_AT = 8;
const TAP_MS = 350;
/** Long enough for the card to fly at the target and the target to burst. */
const LAUNCH_MS = 380;
/** A committed swipe: the card flies off the side before the next one comes in. */
const FLY_MS = 180;

type Axis = "x" | "pull" | "up" | "none" | null;

/**
 * The pick card's gestures, one direction per gesture:
 * - swipe left: the next pick; swipe right: back to the previous one;
 * - on the photo only, pull down and let go to launch (go, or vote in a group): the photo
 *   stretches like a drawn bow, buzzes once when it's far enough, and flies off on release.
 *   Moving sideways while pulling aims (the card picks what's aimed at from `aim`);
 * - on the photo only, a tap flips to the next photo.
 * The details panel takes sideways swipes too, while its up-and-down scrolling stays native.
 * Presses that start on a button or link are left alone, so those keep working.
 */
export function useCardGestures({
  onNext,
  onBack,
  onPull,
  onRelease,
  onTap,
  panelFree,
  onSwipeUp,
  disabled,
}: {
  onNext: () => void;
  onBack: () => void;
  /** After the launch animation, with the sideways aim at release. */
  onPull?: (aim: number) => void;
  /**
   * The moment of release, with the aim: for anything the browser only allows straight from a
   * gesture (opening directions in a new tab, starting a call).
   */
  onRelease?: (aim: number) => void;
  onTap?: () => void;
  /** The details panel can be pulled down too: it's closed, or open and scrolled to its top. */
  panelFree?: boolean;
  /** Swipe up on the details panel (while it's closed, to open it). */
  onSwipeUp?: () => void;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [pullRaw, setPullRaw] = useState(0);
  const [aim, setAim] = useState(0);
  const [launching, setLaunching] = useState(false);
  /** How the card moves back to rest: flying off after a committed swipe, springing back otherwise, or not animating. */
  const [settle, setSettle] = useState<"none" | "spring" | "fly">("none");
  const g = useRef<{ x: number; y: number; t: number; axis: Axis; photo: boolean; dx: number; dy: number; armed: boolean } | null>(null);

  function begin(e: PointerEvent<HTMLElement>, photo: boolean) {
    if (disabled || launching || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, label, [role=switch]")) return;
    g.current = { x: e.clientX, y: e.clientY, t: Date.now(), axis: null, photo, dx: 0, dy: 0, armed: false };
    setSettle("none");
    // Only the photo holds on to the pointer: the details must keep native scrolling and clicks.
    if (photo) e.currentTarget.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent<HTMLElement>) {
    const s = g.current;
    if (!s) return;
    s.dx = e.clientX - s.x;
    s.dy = e.clientY - s.y;
    if (!s.axis && Math.hypot(s.dx, s.dy) > DECIDE_AT) {
      const canPullHere = s.photo || panelFree;
      s.axis = Math.abs(s.dx) > Math.abs(s.dy) ? "x" : canPullHere && s.dy > 0 && onPull ? "pull" : !s.photo && onSwipeUp && s.dy < 0 ? "up" : "none";
      // The details hold on to the pointer only once the gesture is clearly ours, so taps
      // and (when open) scrolling there stay native, and the gesture ends even off the panel.
      if (!s.photo && s.axis !== "none") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (s.axis === "x") setDx(s.dx);
    if (s.axis === "pull") {
      const d = Math.max(0, s.dy);
      setPullRaw(d);
      setAim(s.dx);
      const armed = d >= PULL_AT;
      if (armed !== s.armed) {
        s.armed = armed;
        if (armed) haptic(10);
      }
    }
  }

  function end(cancelled: boolean) {
    const s = g.current;
    if (!s) return;
    g.current = null;
    const launch = !cancelled && s.axis === "pull" && s.armed && Boolean(onPull);
    // A launch keeps its pull and aim until it lands, so the arrow and target stay put while the card flies.
    if (!launch) {
      setPullRaw(0);
      setAim(0);
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!cancelled && s.axis === "x" && Math.abs(s.dx) > SWIPE_AT) {
      // Committed: the card leaves the way it was thrown, then the next one comes in.
      const dir = s.dx < 0 ? -1 : 1;
      setSettle("fly");
      setDx(dir * (window.innerWidth + 120));
      setTimeout(
        () => {
          setSettle("none");
          setDx(0);
          if (dir < 0) onNext();
          else onBack();
        },
        still ? 0 : FLY_MS,
      );
      return;
    }
    setSettle("spring");
    setDx(0);
    if (cancelled) return;
    if (s.axis === "x") {
      // Not far enough: springs back.
    } else if (launch) {
      const aimed = s.dx;
      haptic(18);
      onRelease?.(aimed);
      setLaunching(true);
      setTimeout(
        () => {
          setLaunching(false);
          setPullRaw(0);
          setAim(0);
          onPull?.(aimed);
        },
        still ? 0 : LAUNCH_MS,
      );
    } else if (s.axis === "up" && s.dy < -48) {
      onSwipeUp?.();
    } else if (!s.axis && s.photo && Date.now() - s.t < TAP_MS) {
      onTap?.();
    }
  }

  return {
    dx,
    /** -1 (swiping left, next) … 1 (swiping right, back). */
    progress: Math.max(-1, Math.min(1, dx / SWIPE_AT)),
    /** How far the photo has moved down, with resistance past the launch point. */
    pull: pullRaw < PULL_AT ? pullRaw * 0.75 : Math.min(170, PULL_AT * 0.75 + (pullRaw - PULL_AT) * 0.25),
    /** 0 → 1 as the pull approaches the launch point. */
    tension: Math.min(1, pullRaw / PULL_AT),
    armed: pullRaw >= PULL_AT,
    /** Sideways offset while pulling: negative aims left, positive aims right. */
    aim,
    launching,
    settle,
    photoHandlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => begin(e, true),
      onPointerMove: (e: PointerEvent<HTMLElement>) => move(e),
      onPointerUp: () => end(false),
      onPointerCancel: () => end(true),
    },
    panelHandlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => begin(e, false),
      onPointerMove: (e: PointerEvent<HTMLElement>) => move(e),
      onPointerUp: () => end(false),
      onPointerCancel: () => end(true),
    },
  };
}

export type CardGestures = ReturnType<typeof useCardGestures>;
