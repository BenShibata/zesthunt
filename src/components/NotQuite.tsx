import type { Mood } from "@/lib/types";
import { DiceIcon, PinIcon, RewindIcon, UtensilsIcon, XIcon } from "./Icons";

/** The five moods, worded as a nudge relative to what's on screen. */
export const NUDGE_LABEL: Record<Mood, string> = {
  fresh: "Lighter",
  comfort: "Heartier",
  fast: "Quicker",
  cheap: "Cheaper",
  treat: "A treat",
};
const NUDGES = (Object.keys(NUDGE_LABEL) as Mood[]).map((mood) => ({ mood, label: NUDGE_LABEL[mood] }));

/**
 * "Not quite?": shown after a couple of skips (or from the menu), instead of asking for a
 * mood up front. One tap steers the next picks, says the pick can't work for what you eat,
 * or moves the search.
 */
export function NotQuite({
  mood,
  moodChosen,
  onMood,
  onSurprise,
  onCantEat,
  onElsewhere,
  onClose,
  onBack,
}: {
  /** The row covers the photo's Back button, so it carries its own. */
  onBack?: () => void;
  mood: Mood;
  /** Only highlight a nudge the person picked, not the default mood. */
  moodChosen: boolean;
  onMood: (m: Mood) => void;
  onSurprise: () => void;
  onCantEat?: () => void;
  onElsewhere: () => void;
  onClose: () => void;
}) {
  // Compact so the whole row fits over the photo even on small phones; ::after pads taps to 44px.
  const chip =
    "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition active:scale-95 after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] min-[380px]:text-sm";
  return (
    <section aria-labelledby="not-quite-title" className="animate-rise rounded-3xl bg-ink-3/95 p-3 shadow-2xl ring-1 ring-white/10 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <h2 id="not-quite-title" className="pl-1 text-[13px] font-semibold text-white min-[380px]:text-sm">
          Not quite? Steer the next picks
        </h2>
        <div className="-my-1.5 flex shrink-0 items-center">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to the previous pick"
              className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-[13px] font-semibold text-white/75 hover:text-white"
            >
              <RewindIcon size={14} />
              Back
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Hide" className="grid size-11 place-items-center rounded-full text-white/60 hover:text-white">
            <XIcon size={16} />
          </button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {NUDGES.map((n) => {
          const on = moodChosen && n.mood === mood;
          return (
            <button key={n.mood} type="button" aria-pressed={on} onClick={() => onMood(n.mood)} className={`${chip} ${on ? "bg-white text-ink" : "bg-white/10 text-white hover:bg-white/15"}`}>
              {n.label}
            </button>
          );
        })}
        <button type="button" onClick={onSurprise} className={`${chip} bg-white/10 text-white hover:bg-white/15`} aria-label="Surprise me: a pick from another mood (or shake your phone)">
          <DiceIcon size={15} />
          Surprise me
        </button>
        {onCantEat && (
          <button type="button" onClick={onCantEat} className={`${chip} bg-teal/25 text-teal-bright hover:bg-teal/35`}>
            <UtensilsIcon size={15} />
            Can&apos;t eat this
          </button>
        )}
        <button type="button" onClick={onElsewhere} className={`${chip} bg-white/10 text-white hover:bg-white/15`}>
          <PinIcon size={15} />
          Somewhere else
        </button>
      </div>
    </section>
  );
}
