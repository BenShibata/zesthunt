"use client";

import { useRef, useState, type PointerEvent } from "react";

const THRESHOLD = 96;

/** Horizontal swipe: right = onRight (Go), left = onLeft (Skip). Buttons remain the accessible path. */
export function useSwipe({ onLeft, onRight, disabled }: { onLeft: () => void; onRight: () => void; disabled?: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef(0);

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    if (disabled || e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    latest.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (!start.current) return;
    const next = e.clientX - start.current.x;
    latest.current = next;
    setDx(next);
  }

  function finish() {
    if (!start.current) return;
    start.current = null;
    const d = latest.current;
    latest.current = 0;
    setDx(0);
    if (d > THRESHOLD) onRight();
    else if (d < -THRESHOLD) onLeft();
  }

  return {
    dx,
    progress: Math.max(-1, Math.min(1, dx / THRESHOLD)),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
