"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Dietary } from "@/lib/types";

/*
 * The one thing Zesthunt may persist, and only if the user opts in:
 * "Remember this on this device." Off by default. It stores ONLY
 * diet and allergy selections in this browser's localStorage. The server gets
 * them as a filter on each request and never stores or logs them.
 * "Forget me" deletes the key immediately.
 */

const KEY = "zesthunt:dietary:v1";
const CHANGE = "zesthunt:dietary-change";
const EMPTY: Dietary = { diets: [], allergies: [] };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // private mode or blocked storage: behave as "not remembered"
  }
}

function parse(raw: string | null): Dietary | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Dietary>;
    const clean = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").slice(0, 12) : []);
    return { diets: clean(v.diets), allergies: clean(v.allergies) };
  } catch {
    return null;
  }
}

/** For the very first request, before React state has settled. */
export function readStoredDietary(): Dietary | null {
  return typeof window === "undefined" ? null : parse(readRaw());
}

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(CHANGE, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHANGE, cb);
  };
};

function write(d: Dietary | null) {
  try {
    if (d) window.localStorage.setItem(KEY, JSON.stringify({ diets: d.diets, allergies: d.allergies }));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the setting simply lasts for this session.
  }
  window.dispatchEvent(new Event(CHANGE));
}

export { ALLERGIES, DIETS } from "@/lib/dietary";
import { eatsLabel } from "@/lib/dietary";

/** Everything set, in words, for screen readers ("No meat or fish; keeping away from peanuts"). */
export function dietaryBadge(d: Dietary): string | null {
  const parts = d.diets.map(eatsLabel);
  if (d.allergies.length > 0) parts.push(`keeping away from ${d.allergies.map((a) => a.toLowerCase()).join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

export function useDietary() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const stored = parse(raw);
  const [session, setSession] = useState<Dietary>(EMPTY);

  const remembered = stored !== null;
  const dietary = stored ?? session;

  // Latest value for request builders that live outside render.
  const current = useRef<Dietary>(dietary);
  useEffect(() => {
    current.current = dietary;
  });

  /** Accepts a value or an updater, applied to the latest selections (safe for rapid taps). */
  const update = useCallback(
    (change: Dietary | ((d: Dietary) => Dietary)) => {
      const next = typeof change === "function" ? change(current.current) : change;
      current.current = next;
      if (remembered) write(next);
      else setSession(next);
    },
    [remembered],
  );

  const setRemember = useCallback(
    (on: boolean) => {
      if (on) {
        write(current.current);
      } else {
        setSession(current.current);
        write(null);
      }
    },
    [],
  );

  /** Deletes the stored setting and clears the selections. */
  const forget = useCallback(() => {
    current.current = EMPTY;
    setSession(EMPTY);
    write(null);
  }, []);

  return { dietary, current, remembered, update, setRemember, forget };
}
