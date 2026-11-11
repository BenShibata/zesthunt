import { ZestApp } from "@/components/ZestApp";
import { AboutCopy } from "@/components/AboutCopy";

export default function Home() {
  return (
    <>
      <ZestApp />
      {/* Without JavaScript, the app can't run: say what it is instead of a lone loading line. */}
      <noscript>
        <section className="mx-auto max-w-md space-y-3 bg-ink px-5 py-8 text-white">
          <h1 className="font-display text-2xl font-bold">Zesthunt: what to eat, in seconds</h1>
          <AboutCopy />
          <p className="text-white/70">Zesthunt needs JavaScript to find places near you.</p>
        </section>
      </noscript>
    </>
  );
}
