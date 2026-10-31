import { MOODS, MOOD_LABELS, type Mood } from "@/lib/types";
import { CompassMark, PartyIcon } from "./Icons";

export function TopBar({
  dietaryBadge,
  demo,
  onParty,
  partyActive,
  hideParty,
}: {
  dietaryBadge: string | null;
  demo?: boolean;
  onParty: () => void;
  partyActive?: boolean;
  hideParty?: boolean;
}) {
  return (
    <header className="flex h-14 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2">
        <CompassMark size={26} className="text-paprika-bright" />
        <span className="font-display text-xl font-extrabold tracking-tight">zesthunt</span>
        {demo && (
          <span className="ml-1 rounded-full border border-white/25 px-2 py-0.5 text-xs font-semibold text-white/70" title="No API keys set: showing fictional places">
            Demo
          </span>
        )}
        {dietaryBadge && (
          <span className="ml-1 rounded-full bg-teal/30 px-2 py-0.5 text-xs font-semibold text-teal-bright" aria-label={`Dietary filter on: ${dietaryBadge}`}>
            {dietaryBadge}
          </span>
        )}
      </div>
      {!hideParty && (
        <button
          type="button"
          onClick={onParty}
          aria-label={partyActive ? "Invite friends to this party" : "Start a hunt party"}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-social/25 px-4 text-sm font-semibold text-social-bright transition hover:bg-social/35"
        >
          <PartyIcon size={18} />
          {partyActive ? "Invite" : "Party"}
        </button>
      )}
    </header>
  );
}

export function MoodTabs({ mood, onChange }: { mood: Mood; onChange: (m: Mood) => void }) {
  return (
    <div role="tablist" aria-label="Mood" className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
      {MOODS.map((m) => {
        const selected = m === mood;
        return (
          <button
            key={m}
            role="tab"
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
            className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
              selected ? "bg-white text-ink" : "bg-white/8 text-white/75 hover:bg-white/14"
            }`}
          >
            {MOOD_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
