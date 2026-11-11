import type { Metadata } from "next";
import Link from "next/link";
import { CompassMark } from "@/components/Icons";
import { AboutCopy } from "@/components/AboutCopy";

export const metadata: Metadata = {
  title: "About · Zesthunt",
  description: "One meal pick that's open near you, in seconds. No login, and nothing kept on our servers.",
};

const FEEDBACK_URL = process.env.NEXT_PUBLIC_FEEDBACK_URL?.trim();

export default function About() {
  return (
    <main className="mx-auto min-h-dvh max-w-md space-y-5 bg-ink px-5 py-8 text-white">
      <Link href="/" className="inline-flex items-center gap-2 font-display text-xl font-extrabold">
        <CompassMark size={26} className="text-paprika-bright" />
        zesthunt
      </Link>
      <h1 className="font-display text-3xl font-bold tracking-tight">What to eat, in seconds</h1>
      <AboutCopy />
      <section id="feedback" aria-labelledby="feedback-title" className="space-y-2 border-t border-white/10 pt-4">
        <h2 id="feedback-title" className="font-display text-xl font-bold">
          Feedback
        </h2>
        {FEEDBACK_URL ? (
          <a href={FEEDBACK_URL} className="inline-flex h-11 items-center rounded-full bg-white px-5 font-semibold text-ink">
            Send feedback
          </a>
        ) : (
          <p className="text-white/70">A feedback link isn&apos;t set up yet.</p>
        )}
      </section>
      <Link href="/" className="inline-flex h-12 items-center rounded-full bg-paprika px-6 font-semibold text-white">
        Find something to eat
      </Link>
    </main>
  );
}
