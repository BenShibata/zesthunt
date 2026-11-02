import { PinIcon, XIcon } from "./Icons";

/**
 * The row under the moods: where we're looking (with a way to change it) and the
 * active craving (with a way to clear it). A wrong area is the most common reason a
 * pick feels wrong, so it's always visible.
 */
export function SearchContext({
  area,
  craving,
  onChangeArea,
  onClearCraving,
}: {
  area: { label: string; approx: boolean; drive: boolean } | null;
  craving: string | null;
  onChangeArea?: () => void;
  onClearCraving: () => void;
}) {
  if (!area && !craving) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 pb-2 text-sm">
      {area && (
        <button
          type="button"
          onClick={onChangeArea}
          disabled={!onChangeArea}
          aria-label={`Searching near ${area.label}${area.approx ? ", a rough guess" : ""}${area.drive ? ", within a short drive" : ""}. Change area`}
          className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-1 text-white/75 hover:text-white disabled:hover:text-white/75"
        >
          <PinIcon size={15} className="shrink-0 text-paprika-bright" />
          <span className="truncate">
            Near {area.label}
            {area.approx && <span className="text-white/55"> · rough guess</span>}
            {area.drive && <span className="text-white/55"> · short drive</span>}
          </span>
          {onChangeArea && <span className="shrink-0 font-semibold text-teal-bright">Change</span>}
        </button>
      )}
      {craving && (
        <span className="ml-auto inline-flex h-9 max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-white/12 pr-0.5 pl-3 font-semibold text-white">
          <span className="truncate">{craving}</span>
          <button
            type="button"
            onClick={onClearCraving}
            aria-label={`Clear craving: ${craving}`}
            className="-my-1 grid size-11 shrink-0 place-items-center rounded-full text-white/70 hover:text-white"
          >
            <XIcon size={15} />
          </button>
        </span>
      )}
    </div>
  );
}
