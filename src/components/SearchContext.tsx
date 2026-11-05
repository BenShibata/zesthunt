import { PinIcon, XIcon } from "./Icons";

/**
 * A slim line that appears only when it matters: the area is a rough guess (or the search
 * reached a drive), so here's where we're looking and how to change it; or a craving is
 * narrowing the search, with a way to clear it.
 */
export function SearchContext({
  area,
  craving,
  onChangeArea,
  onClearCraving,
}: {
  /** `farther`: the ring being searched when it's beyond a walk ("a short drive"). */
  area: { label: string; approx: boolean; farther: string | null } | null;
  craving: string | null;
  onChangeArea: () => void;
  onClearCraving: () => void;
}) {
  const showArea = area && (area.approx || area.farther);
  if (!showArea && !craving) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 px-4 pb-1 text-sm">
      {showArea && (
        <button
          type="button"
          onClick={onChangeArea}
          aria-label={`Searching near ${area.label}${area.approx ? ", a rough guess" : ""}${area.farther ? `, within ${area.farther}` : ""}. Change area`}
          className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-full px-1 text-white/75 hover:text-white"
        >
          <PinIcon size={15} className="shrink-0 text-paprika-bright" />
          <span className="truncate">
            {area.approx ? area.label : `Near ${area.label}`}
            {area.approx && <span className="text-white/55"> (approx.)</span>}
            {area.farther && <span className="text-white/55"> · {area.farther.replace(/^a /, "")}</span>}
          </span>
          <span className="shrink-0 font-semibold text-teal-bright">Change</span>
        </button>
      )}
      {craving && (
        <span className="ml-auto inline-flex h-9 max-w-[50%] shrink-0 items-center gap-1 rounded-full bg-white/12 pr-0.5 pl-3 font-semibold text-white">
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
