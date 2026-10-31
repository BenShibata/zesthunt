/** Light haptic tick where supported (Android Chrome). Silent no-op elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Some browsers throw without a user gesture; haptics are optional.
    }
  }
}
