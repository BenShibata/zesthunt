import "server-only";
import { z } from "zod";

/**
 * First-party sponsored deals (revenue): restaurants pay Zesthunt directly to attach a deal
 * to their own card. Set in the SPONSORS environment variable as a JSON list:
 *
 *   [{ "placeId": "ChIJ…", "deal": "10% off with code ZEST", "url": "https://…", "until": "2026-12-31" }]
 *
 * A deal only appears when that place comes up on its own: it never moves a place up, adds
 * it to the picks, or changes the ranking (the ranker never sees it). No ad network, no
 * tracking: the deal is plain text shipped with the pick, labeled "Sponsored".
 */
const SponsorSchema = z.object({
  placeId: z.string().min(1).max(200),
  deal: z.string().trim().min(1).max(80),
  url: z.string().max(500).startsWith("https://").optional(),
  /** Last day the deal runs (inclusive, UTC). */
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type Sponsor = z.infer<typeof SponsorSchema>;

let cached: { raw: string | undefined; byPlace: Map<string, Sponsor> } | null = null;

export function parseSponsors(raw: string | undefined): Map<string, Sponsor> {
  const byPlace = new Map<string, Sponsor>();
  if (!raw?.trim()) return byPlace;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    console.error("SPONSORS is not valid JSON; no sponsored deals shown.");
    return byPlace;
  }
  if (!Array.isArray(list)) return byPlace;
  for (const item of list.slice(0, 500)) {
    const s = SponsorSchema.safeParse(item);
    if (s.success) byPlace.set(s.data.placeId, s.data);
  }
  return byPlace;
}

/** The live deal for a place, if it has one today. */
export function sponsorDeal(placeId: string, now = new Date()): { deal: string; url?: string } | undefined {
  const raw = process.env.SPONSORS;
  if (!cached || cached.raw !== raw) cached = { raw, byPlace: parseSponsors(raw) };
  const s = cached.byPlace.get(placeId);
  if (!s) return undefined;
  if (s.until && now.toISOString().slice(0, 10) > s.until) return undefined;
  return { deal: s.deal, ...(s.url ? { url: s.url } : {}) };
}

/** How many sponsors are set up, for /api/health. */
export function sponsorCount(): number {
  const raw = process.env.SPONSORS;
  if (!cached || cached.raw !== raw) cached = { raw, byPlace: parseSponsors(raw) };
  return cached.byPlace.size;
}
