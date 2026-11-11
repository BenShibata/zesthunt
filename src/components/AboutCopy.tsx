import Link from "next/link";
import { KEPT_HERE } from "@/lib/copy";

/**
 * What Zesthunt is, in plain HTML (no JavaScript needed): on the About page, and under the
 * app for anyone (or any crawler) without JavaScript.
 */
export function AboutCopy() {
  return (
    <div className="space-y-3 text-white/80">
      <p>
        Zesthunt opens straight onto one meal pick that&apos;s open near you right now: the place, what to try, how far it is and how long it&apos;s open.
        No login, nothing to set up.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Swipe (or tap) for less like this, more like this, or maybe later; tap Let&apos;s go for directions, ordering or a call.</li>
        <li>Search a craving by typing or holding to speak, and steer the picks: lighter, heartier, quicker, cheaper or a treat.</li>
        <li>Hunt together: friends join from a link and vote on the same places, and the group&apos;s pick is revealed when everyone&apos;s done.</li>
        <li>{KEPT_HERE} Your location is rounded before it leaves your device.</li>
      </ul>
      <p>
        <Link href="/privacy" className="font-semibold text-teal-bright underline-offset-4 hover:underline">
          Privacy: what we process, and what we don&apos;t keep
        </Link>
      </p>
    </div>
  );
}
