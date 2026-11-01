"use client";

import type { ReactNode } from "react";
import { MOOD_LABELS, type PicksEvent } from "@/lib/types";
import type { SentRequest } from "@/lib/api";
import { AreaVisual } from "./AreaVisual";
import { LockIcon } from "./Icons";

type Meta = Extract<PicksEvent, { type: "meta" }>;
type LatLng = { lat: number; lng: number };

function clock(hhmm: string) {
  const [h, m] = hhmm.slice(-5).split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-24 shrink-0 text-white/60">{label}</dt>
      <dd className="min-w-0 flex-1 text-white">{children}</dd>
    </div>
  );
}

const NOT_SENT = ["Your exact location", "Your name or any account", "A device ID or cookie", "Your past searches"];

/**
 * "What we sent": built from the exact request body that went over the wire (and the
 * server's own account of how it found the area), so it can't drift from the truth.
 */
export function PrivacyReceipt({
  sent,
  meta,
  precise,
  inParty,
  onClose,
}: {
  sent: SentRequest | null;
  meta: Meta | null;
  precise: LatLng | null;
  inParty: boolean;
  onClose: () => void;
}) {
  const source = sent?.location ? "device" : sent?.areaQuery ? "typed" : (meta?.areaSource ?? "ip");
  const diet = sent?.dietary;

  return (
    <section
      className="animate-rise mx-4 mb-3 min-h-0 flex-1 space-y-4 overflow-y-auto rounded-3xl bg-white/[0.07] p-4"
      aria-labelledby="receipt-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="receipt-title" className="inline-flex items-center gap-2 font-display text-xl font-bold">
            <LockIcon size={18} className="text-teal-bright" />
            What we sent
          </h2>
          <p className="text-sm text-white/75">Your last request, exactly as it left this phone.</p>
        </div>
        <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-ink">
          Done
        </button>
      </div>

      {!sent ? (
        <p className="text-sm text-white/75">Nothing yet. The first pick hasn&apos;t been requested.</p>
      ) : (
        <>
          {meta?.areaSource !== "demo" && (
            <AreaVisual source={source} sent={sent.location} precise={precise} label={source === "typed" ? sent.areaQuery : meta?.areaLabel} />
          )}

          <dl className="divide-y divide-white/10 text-sm">
            <Row label="Area">
              {sent.location ? (
                <>
                  Rounded to ~1 km:{" "}
                  <span className="font-mono">
                    {sent.location.lat.toFixed(2)}, {sent.location.lng.toFixed(2)}
                  </span>
                </>
              ) : sent.areaQuery ? (
                <>“{sent.areaQuery}”, as you typed it</>
              ) : meta?.areaSource === "demo" ? (
                "None (demo mode)"
              ) : (
                <>
                  None sent. Our server made a city-level guess from your connection
                  {meta?.areaLabel ? ` (${meta.areaLabel})` : ""}.
                </>
              )}
            </Row>
            <Row label="Time">{clock(sent.localTime)}, no date</Row>
            <Row label="Mood">{MOOD_LABELS[sent.mood]}</Row>
            {diet && diet.diets.length > 0 && <Row label="Diet">{diet.diets.join(", ")}</Row>}
            {diet && diet.allergies.length > 0 && <Row label="Allergies">{diet.allergies.join(", ")}</Row>}
            {sent.craving && <Row label="Craving">“{sent.craving}”</Row>}
            {sent.skipSignals && sent.skipSignals.length > 0 && <Row label="Skip hints">{sent.skipSignals.join(", ")}</Row>}
            {sent.exclude && sent.exclude.length > 0 && (
              <Row label="Seen">
                {sent.exclude.length} place {sent.exclude.length === 1 ? "ID" : "IDs"} you&apos;ve already seen, so they aren&apos;t repeated
              </Row>
            )}
          </dl>

          <div>
            <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">Not sent</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {NOT_SENT.map((n) => (
                <li key={n} className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/80 line-through decoration-white/40">
                  {n}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5 text-sm text-white/80">
            <h3 className="text-xs font-semibold tracking-wide text-white/70 uppercase">Passed on</h3>
            {!meta || meta.sharedWith.length === 0 ? (
              <p>
                {meta?.mode === "demo"
                  ? "Nothing. Demo mode uses made-up places on our server."
                  : sent.areaQuery
                    ? "Google Maps may have received the words you typed, to look up the area. Nothing else."
                    : "Nothing for this request."}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {meta.sharedWith.includes("google") && (
                  <li>
                    <span className="font-semibold text-white">Google Maps</span>:{" "}
                    {source === "typed" ? "the words you typed, then the rounded area" : source === "ip" ? "the city-level area" : "the rounded area"}
                    , to find what&apos;s open and how far it is.
                  </li>
                )}
                {meta.sharedWith.includes("anthropic") && (
                  <li>
                    <span className="font-semibold text-white">Claude (Anthropic)</span>: the nearby places, meal time, mood
                    {diet ? ", diet" : ""}
                    {sent.skipSignals?.length ? ", skip hints" : ""}
                    {sent.craving ? " and your craving" : ""}, to rank them. Never your location.
                  </li>
                )}
              </ul>
            )}
          </div>

          <p className="rounded-2xl bg-teal/20 px-3 py-2.5 text-sm text-white">
            <span className="font-semibold">Kept by us: nothing.</span> The request is forgotten as soon as the answer finishes.
            {inParty && " In this party, the room holds nicknames and swipes until its 10 minutes are up."}
          </p>

          <p className="text-xs text-white/60">
            Like any website, our server sees your connection&apos;s IP address. It&apos;s only used to slow down abuse (scrambled, gone within a
            minute) and, when no area is set, for a city-level guess. It isn&apos;t stored.
          </p>

          <details className="text-xs text-white/70">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-white/80">Show the raw request</summary>
            <pre className="max-h-48 overflow-auto rounded-xl bg-ink-2 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-white/80">
              {JSON.stringify(sent, null, 2)}
            </pre>
          </details>
        </>
      )}

      <a
        href="/privacy"
        target="_blank"
        rel="noopener"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-bright underline-offset-4 hover:underline"
      >
        Read the full privacy page
      </a>
    </section>
  );
}
