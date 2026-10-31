"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts down from `ms` and resets on any touch, click or key press.
 * Returns the fraction of time remaining (1 → 0). Calls onExpire once at zero.
 */
export function useInactivityTimer(ms: number, onExpire: () => void, paused: boolean) {
  const [remaining, setRemaining] = useState(ms);
  const deadline = useRef(0);
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (paused) return;
    const reset = () => {
      deadline.current = Date.now() + ms;
      setRemaining(ms);
    };
    reset();
    const tick = setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) {
        expire.current();
        reset();
      } else {
        setRemaining(left);
      }
    }, 1000);

    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms, paused]);

  return { fraction: remaining / ms, remainingMs: remaining };
}
