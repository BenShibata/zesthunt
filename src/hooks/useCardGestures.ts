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
const LAUNCH_MS = 260;

type Axis = "x" | "pull" | "none" | null;

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
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [pullRaw, setPullRaw] = useState(0);
  const [aim, setAim] = useState(0);
  const [launching, setLaunching] = useState(false);
  const g = useRef<{ x: number; y: number; t: number; axis: Axis; photo: boolean; dx: number; dy: number; armed: boolean } | null>(null);

  function begin(e: PointerEvent<HTMLElement>, photo: boolean) {
    if (disabled || launching || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, label, [role=switch]")) return;
    g.current = { x: e.clientX, y: e.clientY, t: Date.now(), axis: null, photo, dx: 0, dy: 0, armed: false };
    // Only the photo holds on to the pointer: the details must keep native scrolling and clicks.
    if (photo) e.currentTarget.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent<HTMLElement>) {
    const s = g.current;
    if (!s) return;
    s.dx = e.clientX - s.x;
    s.dy = e.clientY - s.y;
    if (!s.axis && Math.hypot(s.dx, s.dy) > DECIDE_AT) {
      s.axis = Math.abs(s.dx) > Math.abs(s.dy) ? "x" : s.photo && s.dy > 0 && onPull ? "pull" : "none";
      // The details hold on to the pointer only once it's clearly a sideways swipe, so taps
      // and scrolling there stay native, and a swipe still ends if the finger leaves the panel.
      if (s.axis === "x" && !s.photo) e.currentTarget.setPointerCapture(e.pointerId);
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
    setDx(0);
    setPullRaw(0);
    setAim(0);
    if (cancelled) return;
    if (s.axis === "x") {
      if (s.dx < -SWIPE_AT) onNext();
      else if (s.dx > SWIPE_AT) onBack();
    } else if (s.axis === "pull" && s.armed && onPull) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const aimed = s.dx;
      haptic(18);
      onRelease?.(aimed);
      setLaunching(true);
      setTimeout(
        () => {
          setLaunching(false);
          onPull(aimed);
        },
        still ? 0 : LAUNCH_MS,
      );
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
