import "server-only";
import { z } from "zod";
import { MOODS, type Mood, type Pick, type PicksEvent } from "@/lib/types";
import { mealFrame } from "@/lib/time";
import { dishCategory } from "@/lib/categories";
import { buildMockQueue } from "@/lib/mockPicks";
import { env, isDemo } from "./env";
import { coarseFromHeaders, roundToArea, type LatLng } from "./geo";
import { geocodeArea, nearbyOpenPlaces, type Place } from "./places";
import { travelTimes, type Travel } from "./routes";
import { balanceScore, profileFor, toPlate, type Profile } from "./heuristics";
import { rankWithClaude } from "./rank";
import type { CandidateForPrompt, RankedPick } from "./prompts";

export const PicksRequestSchema = z.object({
  /** Device-local wall clock, "YYYY-MM-DDTHH:mm". Only the hour and minute are used. */
  localTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
  mood: z.enum(MOODS),
  /** Already rounded on the device; rounded again here regardless. */
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable(),
  areaQuery: z.string().max(80).nullable().optional(),
  dietary: z
    .object({ diets: z.array(z.string().max(30)).max(8), allergies: z.array(z.string().max(30)).max(12) })
    .nullable()
    .optional(),
  skipSignals: z.array(z.string().max(60)).max(12).optional(),
  /** What the user typed or said ("something with noodles"). Used for this response only. */
  craving: z.string().max(140).nullable().optional(),
  exclude: z.array(z.string().max(200)).max(100).optional(),
  firstOfSession: z.boolean().optional(),
});
export type PicksRequest = z.infer<typeof PicksRequestSchema>;

const WALK_RADIUS_M = 1500;
const DRIVE_RADIUS_M = 8000;
const MIN_WALKABLE = 5;
const MAX_CANDIDATES = 20;
const WANT_COUNT = 10;
/** If Claude hasn't produced pick #1 by now, show a rule-based first pick so the screen is never empty for long. */
const FIRST_PICK_DEADLINE_MS = 2500;

// Words that must never appear in pick copy (no calories, weights or moralizing).
const BANNED = /\b(calorie|calories|kcal|cal\b|grams?|ounces?|oz\b|lbs?|guilt|guilty|unhealthy|bad for|cheat|junk|diet)\b/i;

const VEG_DIETS = /veg/i;

export async function* runPipeline(req: PicksRequest, headers: Headers, signal: AbortSignal): AsyncGenerator<PicksEvent> {
  const [h, m] = req.localTime.slice(11, 16).split(":").map(Number);
  const frame = mealFrame(new Date(2000, 0, 1, h, m));
  const exclude = new Set(req.exclude ?? []);

  if (isDemo()) {
    yield* demoFeed(req, exclude);
    return;
  }

  // 1. Where: device location (rounded) → typed neighborhood/ZIP → IP city estimate → ask.
  let origin: LatLng | null = req.location ? roundToArea(req.location) : null;
  if (!origin && req.areaQuery) origin = await geocodeArea(req.areaQuery);
  if (!origin) origin = coarseFromHeaders(headers);
  if (!origin) {
    yield { type: "need_location" };
    return;
  }

  // 2. What's open: walkable first, widen to a short drive if that's thin.
  const diets = req.dietary?.diets ?? [];
  const allergies = req.dietary?.allergies ?? [];
  const fits = (p: Place) => !exclude.has(p.id) && !(diets.some((d) => VEG_DIETS.test(d)) && p.servesVegetarianFood === false);

  let mode: "walk" | "drive" = "walk";
  let places = (await nearbyOpenPlaces(origin, WALK_RADIUS_M)).filter(fits);
  if (places.length < MIN_WALKABLE) {
    const wider = (await nearbyOpenPlaces(origin, DRIVE_RADIUS_M)).filter(fits);
    if (wider.length > places.length) {
      places = wider;
      mode = "drive";
    }
  }
  if (places.length === 0) {
    yield {
      type: "empty",
      message: exclude.size > 0 ? "That's everything open nearby for now." : "Nothing's open near you right now.",
      suggestion: "order_in",
    };
    return;
  }

  // 3. How far: Routes matrix for the shortlist.
  const travel = await travelTimes(
    origin,
    places.map((p) => ({ id: p.id, location: p.location })),
    mode === "walk" ? "WALK" : "DRIVE",
  );
  const shortlist = [...places].sort((a, b) => travel.get(a.id)!.minutes - travel.get(b.id)!.minutes).slice(0, MAX_CANDIDATES);

  yield { type: "meta", mode, sparse: mode === "drive", areaLabel: null };

  // 4. Rank and describe.
  const byShortId = new Map<string, Place>();
  const candidates: CandidateForPrompt[] = shortlist.map((p, i) => {
    const id = `p${i + 1}`;
    byShortId.set(id, p);
    const t = travel.get(p.id)!;
    return {
      id,
      name: p.name,
      type: p.primaryType,
      other_types: p.types.filter((x) => x !== p.primaryType && !["point_of_interest", "establishment", "food"].includes(x)).slice(0, 4),
      summary: p.summary,
      travel: `${t.minutes} min ${mode}`,
      closes_in_minutes: p.nextCloseTime ? Math.round((Date.parse(p.nextCloseTime) - Date.now()) / 60000) : null,
      vegetarian_options: p.servesVegetarianFood,
    };
  });

  const emitted = new Set<string>();
  const firstOfSession = Boolean(req.firstOfSession);
  const heuristicOrder = rankHeuristically(shortlist, travel, req.mood, firstOfSession);
  const make = (p: Place, ranked?: RankedPick): Pick => buildPick(p, travel.get(p.id)!, mode, ranked);

  if (env.anthropicKey) {
    try {
      const ranked = rankWithClaude(
        {
          mealFrame: frame,
          mood: req.mood,
          firstOfSession,
          diets,
          allergies,
          skipSignals: req.skipSignals ?? [],
          craving: req.craving ?? null,
          wantCount: WANT_COUNT,
          candidates,
        },
        signal,
      );
      let next = ranked.next();
      const deadline = new Promise<"late">((r) => setTimeout(() => r("late"), FIRST_PICK_DEADLINE_MS));
      if ((await Promise.race([next, deadline])) === "late") {
        const fallback = heuristicOrder[0];
        emitted.add(fallback.id);
        yield { type: "pick", pick: make(fallback) };
      }
      while (true) {
        const r = await next;
        if (r.done) break;
        const place = byShortId.get(r.value.id);
        if (place && !emitted.has(place.id)) {
          emitted.add(place.id);
          yield { type: "pick", pick: make(place, r.value) };
        }
        next = ranked.next();
      }
    } catch (e) {
      if (signal.aborted) return;
      // Log the failure class only, never the request or response content.
      console.error("rank failed:", e instanceof Error ? e.name : "unknown");
    }
  }

  // 5. Top up with rule-based picks if Claude is off, failed, or returned fewer than we want.
  for (const p of heuristicOrder) {
    if (emitted.size >= WANT_COUNT) break;
    if (emitted.has(p.id)) continue;
    emitted.add(p.id);
    yield { type: "pick", pick: make(p) };
  }
  yield { type: "done" };
}

function rankHeuristically(places: Place[], travel: Map<string, Travel>, mood: Mood, firstOfSession: boolean): Place[] {
  const score = (p: Place) => {
    const prof = profileFor(p);
    const balance = balanceScore(prof.plate);
    const moodFit = prof.moods.includes(mood) ? 1 : 0;
    return moodFit * 2 + balance * (firstOfSession ? 2 : 1) - travel.get(p.id)!.minutes / 30;
  };
  return [...places].sort((a, b) => score(b) - score(a));
}

function clean(text: string, fallback: string): string {
  const t = text.trim();
  return !t || BANNED.test(t) ? fallback : t;
}

function buildPick(place: Place, travel: Travel, mode: "walk" | "drive", ranked?: RankedPick): Pick {
  const prof: Profile = profileFor(place);
  const suggestion = ranked && /^try\b/i.test(ranked.suggestion.trim()) ? clean(ranked.suggestion, prof.suggestion) : prof.suggestion;
  const reason = ranked ? clean(ranked.reason, prof.reason) : prof.reason;
  const rawPlate: [number, number, number] = ranked
    ? [ranked.plate.protein, ranked.plate.veg, ranked.plate.grain].map((n) => Math.max(0, n)) as [number, number, number]
    : prof.plate;
  const plate = toPlate(rawPlate);
  const tip = ranked ? (ranked.upgrade_tip ? clean(ranked.upgrade_tip, "") : "") : (prof.tip ?? "");

  return {
    id: place.id,
    placeId: place.id,
    name: place.name,
    suggestion,
    reason,
    moods: ranked?.moods.length ? ranked.moods : prof.moods,
    category: dishCategory(suggestion, [place.primaryType, ...place.types]),
    priceLevel: place.priceLevel,
    closesAt: place.nextCloseTime,
    walkMinutes: travel.minutes,
    travelMode: mode,
    timeEstimated: travel.estimated,
    distanceMeters: travel.meters,
    location: place.location,
    address: place.address,
    payment: place.payment,
    websiteUrl: place.websiteUri ?? undefined,
    // Places (New) has no dedicated ordering-URL field; a restaurant's own site is
    // used for order-ahead only when Places says it does takeout or delivery.
    orderUrl: place.websiteUri && (place.takeout || place.delivery) ? place.websiteUri : undefined,
    plate,
    labels: ranked?.labels ?? prof.labels,
    balance: balanceScore([plate.protein, plate.veg, plate.grain]),
    upgradeTip: tip || undefined,
    photo: place.photoName
      ? { kind: "url", url: `/api/photo?name=${encodeURIComponent(place.photoName)}` }
      : { kind: "mock", palette: ["#c8401f", "#3f8f6b", "#efe3c8"], motif: "plate" },
  };
}

/** Same stream shape on mock data, so the client path is identical without keys. */
async function* demoFeed(req: PicksRequest, exclude: Set<string>): AsyncGenerator<PicksEvent> {
  yield { type: "meta", mode: "demo", sparse: false, areaLabel: null };
  const picks = buildMockQueue(req.mood, new Date(), { firstOfSession: Boolean(req.firstOfSession) }).filter((p) => !exclude.has(p.id));
  if (picks.length === 0) {
    yield { type: "empty", message: "That's every demo pick for this mood.", suggestion: "other_mood" };
    return;
  }
  for (const [i, pick] of picks.entries()) {
    await new Promise((r) => setTimeout(r, i === 0 ? 250 : 60));
    yield { type: "pick", pick };
  }
  yield { type: "done" };
}
