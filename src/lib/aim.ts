/**
 * Pulling a pick down and moving sideways aims at what letting go does. Straight down is
 * the safe default (the journey screen with every choice); a little to the left is
 * directions, further left is ordering to go; to the right is calling. Targets that don't
 * apply to a place (no phone number, dine-in only) fall back to the default.
 */
export type AimKey = "journey" | "directions" | "order" | "call";

/** Sideways pixels before a pull counts as aimed. */
export const AIM_AT = 35;
/** Sideways pixels for the far-left target. */
export const AIM_FAR = 110;

export function aimAt(aim: number, has: { order: boolean; call: boolean }): AimKey {
  if (aim <= -AIM_FAR && has.order) return "order";
  if (aim < -AIM_AT) return "directions";
  if (aim > AIM_AT && has.call) return "call";
  return "journey";
}

/** Left to right, as they're shown while pulling. */
export function aimTargets(has: { order: boolean; call: boolean }): AimKey[] {
  return [...(has.order ? (["order"] as const) : []), "directions", "journey", ...(has.call ? (["call"] as const) : [])];
}
