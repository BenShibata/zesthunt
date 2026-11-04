import { useEffect, useRef, useState, type ReactNode } from "react";
import { CompassMark, MoreIcon } from "./Icons";

export interface MenuItem {
  label: string;
  /** Extra words for screen readers, e.g. what's currently set. */
  detail?: string;
  /** A small count shown next to the label (choices on). */
  count?: number;
  icon: ReactNode;
  onSelect: () => void;
}

/**
 * Just the brand and one ⋯ menu. Everything that used to sit up here (what you eat,
 * Party, privacy) is one tap away in the menu, or comes to the person when it's relevant.
 */
export function TopBar({ demo, items, badge = 0, action }: { demo?: boolean; items: MenuItem[]; badge?: number; action?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="relative z-40 flex h-14 items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-0 items-center gap-2">
        <CompassMark size={26} className="shrink-0 text-paprika-bright" />
        {/* The mark alone under 400 px, so the action button keeps its words. */}
        <span className="hidden font-display text-xl font-extrabold tracking-tight min-[400px]:inline">zesthunt</span>
        {demo && (
          <span className="rounded-full border border-white/25 px-2 py-0.5 text-xs font-semibold text-white/70" title="No API keys set: showing fictional places">
            Demo
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
      {action}
      {items.length > 0 && (
      <div ref={wrap} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="app-menu"
          aria-label={`Menu${badge > 0 ? ` (${badge} food choice${badge === 1 ? "" : "s"} on)` : ""}`}
          className="relative grid size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/15"
        >
          <MoreIcon size={22} />
          {badge > 0 && (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-teal-bright text-[11px] font-bold text-ink">
              {badge}
            </span>
          )}
        </button>
        {open && (
          <ul id="app-menu" className="animate-rise absolute top-12 right-0 w-64 overflow-hidden rounded-2xl bg-ink-3 py-1.5 shadow-2xl ring-1 ring-white/10">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  aria-label={item.detail ? `${item.label}: ${item.detail}` : undefined}
                  className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-base font-medium text-white hover:bg-white/8"
                >
                  <span className="shrink-0 text-white/70">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.count ? (
                    <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-teal-bright text-[11px] font-bold text-ink">
                      {item.count}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}
      </div>
    </header>
  );
}
