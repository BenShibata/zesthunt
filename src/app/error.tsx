"use client";

import { CompassMark } from "@/components/Icons";

/** Never a blank screen: if rendering fails, offer a friendly retry. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col items-center justify-center gap-4 bg-ink px-8 text-center text-white">
      <CompassMark size={40} className="text-paprika-bright" />
      <h1 className="font-display text-2xl font-bold">Lost the trail for a second.</h1>
      <p className="text-white/75">Nothing was saved, so there&apos;s nothing to lose. Try again.</p>
      <button type="button" onClick={reset} className="h-12 rounded-full bg-paprika px-6 font-semibold text-white">
        Try again
      </button>
    </main>
  );
}
