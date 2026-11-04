import type { Metadata } from "next";
import Link from "next/link";
import { CompassMark } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Privacy · Zesthunt",
  description: "What Zesthunt processes, and what it doesn't keep.",
};

const sections: { title: string; body: string[] }[] = [
  {
    title: "Nothing is saved by us",
    body: [
      "No accounts, no login, no cookies, no analytics, no tracking scripts, no third-party pixels.",
      "Your picks, skips, mood, what you type or say, and your location live only in the page's memory. Refresh, close the tab, or leave it for 10 quiet minutes and they're gone.",
    ],
  },
  {
    title: "What our server sees",
    body: [
      "Each request carries the time (no date), your mood, your location rounded to about 1 km (or a neighborhood you typed), any dietary filter, and skip hints like “fewer noodles”. It's used for that response only, and never written to disk, a database or logs.",
      "Without a location, we use your city-level IP estimate once, then forget it.",
    ],
  },
  {
    title: "Who else is involved",
    body: [
      "Google Places and Routes get the rounded area to find open places and walking times. If you set a craving, Google also gets its words to search for places serving it; those results aren't cached. Photos come through our server, so your browser never talks to Google.",
      "Claude (Anthropic) ranks and describes the picks. It gets the place list, your mood and filters, and what you typed or said. It never gets coordinates, addresses or IP.",
    ],
  },
  {
    title: "Voice",
    body: ["Hold-to-speak runs on your phone's own speech recognition. Audio never leaves the device; only the words do. If your browser can't do that on-device, you type instead."],
  },
  {
    title: "Hunt parties",
    body: [
      "A party room holds only its code, nicknames, the shared restaurant cards and everyone's swipes. Never location or what anyone typed.",
      "Rooms vanish 10 minutes after they're created, no matter what.",
    ],
  },
  {
    title: "What you eat",
    body: [
      "Off by default and kept in memory. If you turn on “Remember this on this device” under What I eat, only those food and allergy choices are saved in this browser. “Forget me” deletes them instantly. We never store them.",
    ],
  },
  {
    title: "Through your AI assistant",
    body: [
      "If you add the Zesthunt connector to Claude, ChatGPT or another assistant, it can only send an area (rounded to about 1 km), the time, a mood and diet filters. There's no field for your name or address. We keep nothing, and your assistant does the ranking.",
    ],
  },
  {
    title: "See for yourself",
    body: ["Tap “What we sent” at the bottom of the app to see your last request exactly as it left your phone."],
  },
  {
    title: "Money",
    body: [
      "We never see your card. Bill splits are worked out on your phone and sent from your own share sheet. Ordering and paying happen on the restaurant's or delivery app's site.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-sheet text-sheet-ink dark:bg-[#1b1916] dark:text-white">
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/" className="inline-flex h-11 items-center gap-2 font-display text-lg font-extrabold">
          <CompassMark size={24} className="text-paprika" />
          zesthunt
        </Link>
        <h1 className="mt-6 font-display text-4xl leading-tight font-bold tracking-tight">Close the tab and it&apos;s gone.</h1>
        <div className="mt-6 space-y-6">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-xl font-bold">{s.title}</h2>
              {s.body.map((p) => (
                <p key={p} className="mt-2 text-base leading-relaxed text-sheet-muted dark:text-white/75">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-flex h-12 items-center rounded-full bg-paprika px-6 font-semibold text-white">
          Back to the hunt
        </Link>
      </div>
    </main>
  );
}
