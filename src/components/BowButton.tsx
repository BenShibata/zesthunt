"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { useBow, type Bow } from "@/lib/bow";

/** Holding this long (without moving) starts drawing the bow; a quicker tap opens the menu. */
const HOLD_MS = 180;
/** How long a hold takes to draw the bow all the way: long enough that it's never by accident. */
const DRAW_MS = 1100;
/** Sliding the finger sideways aims, a little further than the finger moves. */
const AIM_GAIN = 1.15;

/**
 * Let's go. A tap opens the menu of choices. Press and hold to draw the bow over the card
 * instead: slide left or right to aim, and let go once it's drawn (the button fills, and
 * buzzes) to shoot at that choice. Letting go early puts the bow down.
 */
export function BowButton({
  bow,
  label,
  aria,
  icon,
  disabled,
  onTap,
  onShoot,
}: {
  bow: Bow;
  label: string;
  aria: string;
  icon?: ReactNode;
  disabled?: boolean;
  onTap: () => void;
  onShoot: (aim: number) => void;
}) {
  const drawn = useBow(bow);
  const g = useRef<{ id: number; x: number; y: number; drawing: boolean; t0: number; aim: number; pullDown: number; armed: boolean; timer: ReturnType<typeof setTimeout> | null; raf: number } | null>(null);
  const skipClick = useRef(false);

  const stop = () => {
    const s = g.current;
    if (!s) return;
    if (s.timer) clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    g.current = null;
  };
  useEffect(() => stop, []);

  const tensionOf = (s: NonNullable<typeof g.current>, now: number) => Math.min(1, Math.max((now - s.t0) / DRAW_MS, s.pullDown / 170));
  const frame = (now: number) => {
    const s = g.current;
    if (!s?.drawing) return;
    if (s.t0 < 0) s.t0 = now;
    const tension = tensionOf(s, now);
    if (tension >= 1 && !s.armed) {
      s.armed = true;
      haptic(10);
    }
    bow.set({ tension: Math.max(0.04, tension), aim: s.aim, launching: false });
    s.raf = requestAnimationFrame(frame);
  };
  const startDrawing = () => {
    const s = g.current;
    if (!s || s.drawing) return;
    s.drawing = true;
    s.t0 = -1;
    skipClick.current = true;
    haptic(6);
    bow.set({ tension: 0.04, aim: s.aim, launching: false });
    s.raf = requestAnimationFrame(frame);
  };

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0 || drawn?.launching) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    skipClick.current = false;
    g.current = { id: e.pointerId, x: e.clientX, y: e.clientY, drawing: false, t0: 0, aim: 0, pullDown: 0, armed: false, timer: setTimeout(startDrawing, HOLD_MS), raf: 0 };
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Moving straight away means aiming: no need to wait for the hold.
    if (!s.drawing && Math.hypot(dx, dy) > 12) startDrawing();
    s.aim = dx * AIM_GAIN;
    s.pullDown = Math.max(0, dy);
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const s = g.current;
    if (!s || e.pointerId !== s.id) return;
    const { drawing, aim } = s;
    const armed = drawing && s.armed;
    stop();
    if (!drawing) return; // A tap: the click opens the menu.
    if (armed) onShoot(aim);
    else bow.set(null);
  };
  const cancel = () => {
    const wasDrawing = g.current?.drawing;
    stop();
    if (wasDrawing) bow.set(null);
  };

  const tension = drawn && !drawn.launching ? drawn.tension : 0;
  const ready = tension >= 1;
  return (
    <button
      type="button"
      aria-label={aria}
      disabled={disabled}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClick={() => {
        if (skipClick.current) {
          skipClick.current = false;
          return;
        }
        onTap();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitTouchCallout: "none" }}
      className={`relative inline-flex h-14 touch-none items-center gap-2 overflow-hidden rounded-full bg-paprika px-8 text-lg font-bold whitespace-nowrap text-white shadow-lg transition select-none hover:bg-paprika-deep active:scale-95 disabled:opacity-40 ${ready ? "ring-2 ring-white" : ""}`}
    >
      {/* Fills as the bow is drawn. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${tension * 100}%` }} />
      <span className="relative inline-flex items-center gap-1.5">
        {icon}
        {tension > 0 ? (ready ? "Let go!" : "Aim…") : label}
      </span>
    </button>
  );
}
