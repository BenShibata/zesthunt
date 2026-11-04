import { MOODS, MOOD_LABELS, type Mood } from "@/lib/types";
import { ChevronDownIcon, CompassMark, PartyIcon, UtensilsIcon } from "./Icons";

/**
 * Brand on the left; the two things people look for on the right, as labeled buttons:
 * "What I eat" (food needs and allergies, worded as food rather than labels for people)
 * and Party. The demo notice lives on the area line.
 */
export function TopBar({
  dietaryBadge,
  dietaryCount = 0,
  dietOpen,
  onDiet,
  onParty,
  partyActive,
  hideParty,
}: {
  /** Everything set, for screen readers ("No meat or fish; keeping away from peanuts"). */
  dietaryBadge: string | null;
  /** How many choices are on, shown as a small count on the button (never the choices themselves). */
  dietaryCount?: number;
  dietOpen?: boolean;
  onDiet?: () => void;
  onParty: () => void;
  partyActive?: boolean;
  hideParty?: boolean;
}) {
  const pill = "inline-flex h-11 min-w-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition min-[360px]:px-3.5";
  // Icons are a bonus; on the narrowest phones the words have to fit.
  const pillIcon = "hidden shrink-0 min-[360px]:block";
  return (
    <header className="relative z-40 flex h-14 items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex shrink-0 items-center gap-2">
        <CompassMark size={26} className="text-paprika-bright" />
        {/* The mark alone under 400 px, so both buttons keep their full words (and the count). */}
        <span className="hidden font-display text-xl font-extrabold tracking-tight min-[400px]:inline">zesthunt</span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {onDiet && (
          <button
            type="button"
            onClick={onDiet}
            aria-expanded={dietOpen}
            aria-controls="diet-panel"
            aria-label={dietaryBadge ? `What you eat: ${dietaryBadge}. Change` : "What you eat"}
            className={`${pill} ${dietaryBadge ? "bg-teal/30 text-teal-bright hover:bg-teal/40" : "bg-white/10 text-white hover:bg-white/15"}`}
          >
            <UtensilsIcon size={17} className={pillIcon} />
            <span className="min-w-0 truncate">What I eat</span>
            {dietaryCount > 0 && (
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-bright text-xs font-bold text-ink">
                {dietaryCount}
              </span>
            )}
            <ChevronDownIcon size={15} className={`shrink-0 opacity-70 transition-transform ${dietOpen ? "rotate-180" : ""}`} />
          </button>
        )}
        {!hideParty && (
          <button
            type="button"
            onClick={onParty}
            aria-label={partyActive ? "Invite friends to this party" : "Start a hunt party"}
            className={`${pill} shrink-0 bg-social/25 text-social-bright hover:bg-social/35`}
          >
            <PartyIcon size={18} className={pillIcon} />
            {partyActive ? "Invite" : "Party"}
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * Mood picker: a segmented control where all five moods always fit on screen, so there's
 * nothing hidden off the edge to discover by scrolling.
 */
export function MoodTabs({ mood, onChange }: { mood: Mood; onChange: (m: Mood) => void }) {
  return (
    <div className="px-4 pb-2">
      <div role="tablist" aria-label="Mood" className="flex gap-0.5 rounded-full bg-white/8 p-1">
        {MOODS.map((m) => {
          const selected = m === mood;
          return (
            <button
              key={m}
              role="tab"
              id={`mood-${m}`}
              aria-controls="picks-panel"
              type="button"
              aria-selected={selected}
              onClick={() => onChange(m)}
              onKeyDown={(e) => {
                const i = MOODS.indexOf(m);
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = MOODS[(i + (e.key === "ArrowRight" ? 1 : MOODS.length - 1)) % MOODS.length];
                  onChange(next);
                  (e.currentTarget.parentElement?.children[MOODS.indexOf(next)] as HTMLElement | undefined)?.focus();
                }
              }}
              tabIndex={selected ? 0 : -1}
              className={`h-10 flex-auto rounded-full px-1.5 text-[13px] font-semibold whitespace-nowrap transition min-[380px]:text-sm ${
                selected ? "bg-white text-ink shadow" : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              {MOOD_LABELS[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
