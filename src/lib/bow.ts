import { useSyncExternalStore } from "react";

/** The bow drawn from the Let's go button: how far (0 → 1), the sideways aim, and whether it's just been let go. */
export type BowDraw = { tension: number; aim: number; launching: boolean };

/**
 * A tiny store for the bow while Let's go is held. It changes every frame, so only the card
 * and the button listen; the rest of the screen doesn't redraw with it.
 */
export function createBow() {
  let value: BowDraw | null = null;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: BowDraw | null) {
      value = next;
      for (const f of subs) f();
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
  };
}
export type Bow = ReturnType<typeof createBow>;

const none = () => null;
const never = () => () => {};

export function useBow(bow?: Bow): BowDraw | null {
  return useSyncExternalStore(bow?.subscribe ?? never, bow?.get ?? none, none);
}
