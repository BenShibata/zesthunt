"use client";

import { useEffect, useRef } from "react";

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/** iOS Safari gates motion events behind a permission prompt; other browsers don't. */
export function motionNeedsPermission(): boolean {
  return typeof DeviceMotionEvent !== "undefined" && typeof (DeviceMotionEvent as unknown as MotionPermission).requestPermission === "function";
}

/** Must be called from a tap. Only prompts on iOS; resolves true elsewhere. */
export async function requestMotionPermission(): Promise<boolean> {
  if (!motionNeedsPermission()) return true;
  try {
    return (await (DeviceMotionEvent as unknown as MotionPermission).requestPermission!()) === "granted";
  } catch {
    return false;
  }
}

const JOLT = 18; // m/s² change between readings
const WINDOW_MS = 700;
const COOLDOWN_MS = 1500;

/** Calls onShake on two sharp jolts in quick succession. */
export function useShake(onShake: () => void, enabled: boolean) {
  const handler = useRef(onShake);
  useEffect(() => {
    handler.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    let last: { x: number; y: number; z: number } | null = null;
    let firstJolt = 0;
    let cooldownUntil = 0;

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const now = Date.now();
      if (last && now > cooldownUntil) {
        const delta = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
        if (delta > JOLT) {
          if (firstJolt && now - firstJolt < WINDOW_MS) {
            firstJolt = 0;
            cooldownUntil = now + COOLDOWN_MS;
            handler.current();
          } else {
            firstJolt = now;
          }
        }
      }
      last = { x: a.x, y: a.y, z: a.z };
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [enabled]);
}
