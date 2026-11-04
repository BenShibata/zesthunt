import "server-only";
import { z } from "zod";
import { MOODS, type AreaSource, type Mood, type Pick, type PicksEvent, type ThirdParty } from "@/lib/types";
import { mealFrame } from "@/lib/time";
import { dietSafeSuggestion, dishCategory } from "@/lib/categories";
import { buildMockQueue } from "@/lib/mockPicks";
import { env, isDemo } from "./env";
import { safeErrorLabel } from "./memory";
import { cityFromHeaders, coarseFromHeaders, haversineMeters, roundToArea, type LatLng } from "./geo";
import { geocodeArea, nearbyOpenPlaces, textSearchOpenPlaces, type Place } from "./places";
import { travelTimes, type Travel } from "./routes";
import { balanceScore, profileFor, toPlate, type Profile } from "./heuristics";
import { rankWithClaude } from "./rank";
import type { CandidateForPrompt, RankedPick } from "./prompts";

export const PicksRequestSchema = z.object({
  /** Device-local wall clock, "HH:mm" (older clients sent a date too; only the hour and minute are used). */
  localTime: z.string().regex(/^(\d{4}-\d{2}-\d{2}T)?\d{2}:\d{2}$/),
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
  /** Search a short drive away instead of a walk (the user asked for it). */
  widen: z.boolean().optional(),
});
export type PicksRequest = z.infer<typeof PicksRequestSchema>;

const WALK_RADIUS_M = 1500;
const DRIVE_RADIUS_M = 8000;
const MIN_WALKABLE = 5;
/** A pick has to stay open at least this long after you'd arrive. */
const ARRIVE_WITH_MINUTES = 20;
/** A craving is worth walking for with fewer options: two matching places beat five that don't. */
const MIN_CRAVING_WALKABLE = 2;
const MAX_CANDIDATES = 20;
const WANT_COUNT = 10;
/** If Claude hasn't produced pick #1 by now, show a rule-based first pick so the screen is never empty for long. */
const FIRST_PICK_DEADLINE_MS = 2500;

// Words that must never appear in pick copy (no calories, weights or moralizing).
const BANNED = /\b(calorie|calories|kcal|cal\b|grams?|ounces?|oz\b|lbs?|guilt|guilty|unhealthy|bad for|cheat|junk|diet)\b/i;

const VEG_DIETS = /veg/i;

export interface PipelineOptions {
  /** Rank with Claude when a key is set. The MCP connector turns this off: the user's own assistant ranks. */
  rankWithAI?: boolean;
}

export async function* runPipeline(
  req: PicksRequest,
  headers: Headers,
  signal: AbortSignal,
  opts: PipelineOptions = {},
): AsyncGenerator<PicksEvent> {
  const useAI = Boolean(env.anthropicKey) && opts.rankWithAI !== false;
  const [h, m] = req.localTime.slice(-5).split(":").map(Number);
  const frame = mealFrame(new Date(2000, 0, 1, h, m));
  const exclude = new Set(req.exclude ?? []);

  if (isDemo()) {
    yield* demoFeed(req, exclude);
    return;
  }

  // 1. Where: device location (rounded) → typed neighborhood/ZIP → IP city estimate → ask.
  let origin: LatLng | null = req.location ? roundToArea(req.location) : null;
  let areaSource: AreaSource = "device";
  let areaLabel: string | null = null;
  if (!origin && req.areaQuery) {
    origin = await geocodeArea(req.areaQuery);
    areaSource = "typed";
    areaLabel = req.areaQuery;
  }
  if (!origin) {
    origin = coarseFromHeaders(headers);
    areaSource = "ip";
    areaLabel = cityFromHeaders(headers);
  }
  if (!origin) {
    yield { type: "need_location" };
    return;
  }

  // 2. What's open: walkable first, widen to a short drive if that's thin.
  const diets = req.dietary?.diets ?? [];
  const allergies = req.dietary?.allergies ?? [];
  const fits = (p: Place) => !exclude.has(p.id) && !(diets.some((d) => VEG_DIETS.test(d)) && p.servesVegetarianFood === false);

  const craving = req.craving?.trim() || null;
  const { places, mode, cravingMatched } = await gatherPlaces(origin, req.mood, craving, fits, Boolean(req.widen));
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
  // Enough time: drop places that close before you'd get there with a meal's worth of time left.
  const reachable = places.filter((p) => !p.nextCloseTime || (Date.parse(p.nextCloseTime) - Date.now()) / 60000 >= travel.get(p.id)!.minutes + ARRIVE_WITH_MINUTES);
  if (reachable.length === 0) {
    yield { type: "empty", message: "Everything nearby closes before you'd get there.", suggestion: "order_in" };
    return;
  }
  const shortlist = [...reachable].sort((a, b) => travel.get(a.id)!.minutes - travel.get(b.id)!.minutes).slice(0, MAX_CANDIDATES);

  const sharedWith: ThirdParty[] = useAI ? ["google", "anthropic"] : ["google"];
  yield {
    type: "meta",
    mode,
    // "Sparse" means we had to widen on our own; a drive the user asked for needs no explaining.
    sparse: mode === "drive" && !req.widen,
    areaLabel,
    areaSource,
    sharedWith,
    ...(craving ? { cravingMatched } : {}),
  };

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
      rating: p.rating,
      ratings_count: p.ratingCount,
    };
  });

  const emitted = new Set<string>();
  const firstOfSession = Boolean(req.firstOfSession);
  // A matched craving keeps Google's relevance order; otherwise rank by mood, balance and distance.
  const heuristicOrder = cravingMatched
    ? places.filter((p) => shortlist.includes(p))
    : rankHeuristically(shortlist, travel, req.mood, firstOfSession);
  const make = (p: Place, ranked?: RankedPick): Pick => {
    const pick = buildPick(p, travel.get(p.id)!, mode, ranked);
    return { ...pick, suggestion: dietSafeSuggestion(pick.suggestion, diets) };
  };

  if (useAI) {
    try {
      const ranked = rankWithClaude(
        {
          mealFrame: frame,
          mood: req.mood,
          firstOfSession,
          diets,
          allergies,
          skipSignals: req.skipSignals ?? [],
          craving,
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
      console.error("rank failed:", safeErrorLabel(e));
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

/** Fixed words per mood for a second search when the nearest places run out. Safe to cache: no user text. */
const MOOD_QUERY: Record<Mood, string> = {
  fresh: "salad poke healthy bowl",
  comfort: "noodles soup comfort food",
  fast: "quick bites takeout",
  cheap: "cheap eats",
  treat: "dessert bakery",
};

function dedupe(lists: Place[][]): Place[] {
  const seen = new Set<string>();
  return lists.flat().filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
}

/**
 * Finds open places to rank, cheapest search first:
 * 1. With a craving: Google Text Search for it. Walkable matches if there are a couple,
 *    else matches within a short drive. If nothing matches, fall through to what's open.
 * 2. The 20 nearest open places. When fewer than a queue's worth are left (after the
 *    phone's exclude list), add the 20 most popular nearby and a search for the mood.
 * 3. Still thin, or the user asked for it: widen to a short drive.
 */
async function gatherPlaces(
  origin: LatLng,
  mood: Mood,
  craving: string | null,
  fits: (p: Place) => boolean,
  widen: boolean,
): Promise<{ places: Place[]; mode: "walk" | "drive"; cravingMatched: boolean }> {
  const within = (p: Place, m: number) => haversineMeters(origin, p.location) <= m;

  if (craving) {
    const matches = (await textSearchOpenPlaces(origin, craving, widen ? DRIVE_RADIUS_M : WALK_RADIUS_M, { cache: false })).filter(fits);
    const walkable = matches.filter((p) => within(p, WALK_RADIUS_M));
    if (!widen && walkable.length >= MIN_CRAVING_WALKABLE) return { places: walkable, mode: "walk", cravingMatched: true };
    const drivable = matches.filter((p) => within(p, DRIVE_RADIUS_M));
    if (drivable.length > 0) return { places: drivable, mode: "drive", cravingMatched: true };
  }

  let places: Place[] = [];
  if (!widen) {
    places = (await nearbyOpenPlaces(origin, WALK_RADIUS_M, "DISTANCE")).filter(fits);
    if (places.length < WANT_COUNT) {
      const more = await Promise.all([
        nearbyOpenPlaces(origin, WALK_RADIUS_M, "POPULARITY"),
        textSearchOpenPlaces(origin, MOOD_QUERY[mood], WALK_RADIUS_M, { cache: true }),
      ]);
      places = dedupe([places, ...more.map((list) => list.filter((p) => fits(p) && within(p, WALK_RADIUS_M)))]);
    }
    if (places.length >= MIN_WALKABLE) return { places, mode: "walk", cravingMatched: false };
  }
  const wider = (await nearbyOpenPlaces(origin, DRIVE_RADIUS_M)).filter(fits);
  if (widen || wider.length > places.length) return { places: wider, mode: "drive", cravingMatched: false };
  return { places, mode: "walk", cravingMatched: false };
}

function rankHeuristically(places: Place[], travel: Map<string, Travel>, mood: Mood, firstOfSession: boolean): Place[] {
  const score = (p: Place) => {
    const prof = profileFor(p);
    const balance = balanceScore(prof.plate);
    const moodFit = prof.moods.includes(mood) ? 1 : 0;
    // A well-rated place nudges up; too few ratings to tell counts as neutral.
    const rated = p.rating != null && (p.ratingCount ?? 0) >= 20 ? (p.rating - 4) * 0.6 : 0;
    return moodFit * 2 + balance * (firstOfSession ? 2 : 1) + rated - travel.get(p.id)!.minutes / 30;
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
    takeout: place.takeout,
    delivery: place.delivery,
    plate,
    labels: ranked?.labels ?? prof.labels,
    balance: balanceScore([plate.protein, plate.veg, plate.grain]),
    upgradeTip: tip || undefined,
    photo: place.photoName
      ? { kind: "url", url: `/api/photo?name=${encodeURIComponent(place.photoName)}` }
      : { kind: "mock", palette: ["#c8401f", "#3f8f6b", "#efe3c8"], motif: "plate" },
    rating: place.rating,
    ratingCount: place.ratingCount,
    mapsUrl: place.mapsUri ?? undefined,
    vegetarianOptions: place.servesVegetarianFood,
    placeTypes: [place.primaryType, ...place.types].filter((t): t is string => Boolean(t)).slice(0, 8),
  };
}

/** Same stream shape on mock data, so the client path is identical without keys. */
async function* demoFeed(req: PicksRequest, exclude: Set<string>): AsyncGenerator<PicksEvent> {
  const diets = req.dietary?.diets ?? [];
  const veg = diets.some((d) => VEG_DIETS.test(d));
  const craving = req.craving?.trim() || null;
  let picks = buildMockQueue(req.mood, new Date(), { firstOfSession: Boolean(req.firstOfSession), allMoods: Boolean(craving) })
    .filter((p) => !exclude.has(p.id) && !(veg && ["steak and BBQ", "burgers"].includes(p.category ?? "")))
    .map((p) => ({ ...p, suggestion: dietSafeSuggestion(p.suggestion, diets) }));
  // A word match stands in for Text Search on the fictional places.
  let cravingMatched = false;
  if (craving) {
    const words = craving.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    const hit = (p: Pick) => words.some((w) => `${p.name} ${p.suggestion} ${p.reason} ${p.category ?? ""}`.toLowerCase().includes(w.replace(/s$/, "")));
    const matches = picks.filter(hit);
    cravingMatched = matches.length > 0;
    picks = cravingMatched ? matches : picks.filter((p) => p.moods.includes(req.mood));
  }
  yield { type: "meta", mode: "demo", sparse: false, areaLabel: null, areaSource: "demo", sharedWith: [], ...(craving ? { cravingMatched } : {}) };
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
