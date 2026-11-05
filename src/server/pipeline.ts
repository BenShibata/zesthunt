import "server-only";
import { z } from "zod";
import { MOODS, type AreaSource, type Mood, type Pick, type PickPhoto, type PicksEvent, type ThirdParty } from "@/lib/types";
import { mealFrame } from "@/lib/time";
import { dietSafeSuggestion, dishCategory } from "@/lib/categories";
import { buildMockQueue } from "@/lib/mockPicks";
import { MAX_REACH, REACHES } from "@/lib/reach";
import { env, isDemo } from "./env";
import { safeErrorLabel } from "./memory";
import { cityFromHeaders, coarseFromHeaders, haversineMeters, roundToArea, type LatLng } from "./geo";
import { geocodeArea, nearbyOpenPlaces, textSearchOpenPlaces, type Place, type PlacePhoto } from "./places";
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
  exclude: z.array(z.string().max(200)).max(300).optional(),
  firstOfSession: z.boolean().optional(),
  /** Search a short drive away instead of a walk (the user asked for it). */
  widen: z.boolean().optional(),
  /** The ring (see REACHES) the last refill reached: start there, since closer rings were seen. */
  reach: z.number().int().min(0).max(MAX_REACH).optional(),
});
export type PicksRequest = z.infer<typeof PicksRequestSchema>;

/** Fewer new places than this in a ring, and the search goes one ring farther (carrying them along). */
const MIN_WALKABLE = 5;
const MIN_FARTHER = 3;
/**
 * Only a place you'd reach with under this long before closing is left out: that's certain,
 * not a guess. Shorter windows stay in, with the card's "Closes in N min" warning.
 */
const ARRIVE_WITH_MINUTES = 10;
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
  /** The farthest ring to search. The MCP connector stops at a short drive to keep its costs down. */
  maxReach?: number;
}

export async function* runPipeline(
  req: PicksRequest,
  headers: Headers,
  signal: AbortSignal,
  opts: PipelineOptions = {},
): AsyncGenerator<PicksEvent> {
  const useAI = Boolean(env.anthropicKey && env.anthropicModel) && opts.rankWithAI !== false;
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

  // 2. What's open: walkable first, then farther rings while what's left is thin.
  const diets = req.dietary?.diets ?? [];
  const allergies = req.dietary?.allergies ?? [];
  const fits = (p: Place) => !exclude.has(p.id) && !(diets.some((d) => VEG_DIETS.test(d)) && p.servesVegetarianFood === false);

  const craving = req.craving?.trim() || null;
  const start = Math.max(req.reach ?? 0, req.widen ? 1 : 0);
  const maxReach = Math.min(opts.maxReach ?? MAX_REACH, MAX_REACH);
  const { places, reach, cravingMatched } = await gatherPlaces(origin, req.mood, craving, fits, Math.min(start, maxReach), maxReach);
  const mode = REACHES[reach].mode;
  if (places.length === 0) {
    yield {
      type: "empty",
      message: exclude.size > 0 ? `That's everything open within ${REACHES[reach].label}.` : "Nothing's open near you right now.",
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
  // Time: drop only places that would close before you could realistically get there.
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
    // "Sparse" means we had to go farther on our own; a drive the user asked for needs no explaining.
    sparse: reach > start,
    reach,
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

/**
 * The extra searches that top up a ring are a bonus: if Google refuses one (a quota, a blip),
 * carry on with what the others found instead of failing the whole search.
 */
async function extra(search: Promise<Place[]>): Promise<Place[]> {
  try {
    return await search;
  } catch (e) {
    console.error("extra search skipped:", safeErrorLabel(e));
    return [];
  }
}

function dedupe(lists: Place[][]): Place[] {
  const seen = new Set<string>();
  return lists.flat().filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
}

/**
 * Finds open places to rank, cheapest search first, one ring at a time (see REACHES):
 * 1. With a craving: Google Text Search for it. Walkable matches if there are a couple, else
 *    matches within a short drive. Nothing (more) for it → everything open, from close by.
 * 2. In each ring: the nearest (or most popular) 20 open places; when fewer than a queue's
 *    worth are new, the other 20, then the mood's search, then the other moods' searches.
 * 3. Still thin: the next ring out, keeping what was found. The last ring returns what it has.
 */
async function gatherPlaces(
  origin: LatLng,
  mood: Mood,
  craving: string | null,
  fits: (p: Place) => boolean,
  start: number,
  maxReach: number,
): Promise<{ places: Place[]; reach: number; cravingMatched: boolean }> {
  const within = (p: Place, m: number) => haversineMeters(origin, p.location) <= m;
  const walk = REACHES[0].meters;
  const shortDrive = REACHES[Math.min(1, maxReach)].meters;

  if (craving) {
    // One search: Google biases it toward the radius but returns farther matches too.
    const matches = (await textSearchOpenPlaces(origin, craving, start === 0 ? walk : shortDrive, { cache: false })).filter(fits);
    const walkable = matches.filter((p) => within(p, walk));
    if (start === 0 && walkable.length >= MIN_CRAVING_WALKABLE) return { places: walkable, reach: 0, cravingMatched: true };
    const drivable = matches.filter((p) => within(p, shortDrive));
    if (maxReach > 0 && drivable.length > 0) return { places: drivable, reach: Math.min(1, maxReach), cravingMatched: true };
    // A craving's ring was its own; everything else open starts again from close by.
    const plain = await gatherPlaces(origin, mood, null, fits, 0, maxReach);
    return { ...plain, cravingMatched: false };
  }

  let places: Place[] = [];
  for (let r = start; r <= maxReach; r++) {
    const { meters, mode } = REACHES[r];
    const keep = (lists: Place[][]) => dedupe([places, ...lists.map((l) => l.filter((p) => fits(p) && within(p, meters)))]);
    const [first, second]: ("DISTANCE" | "POPULARITY")[] = mode === "walk" ? ["DISTANCE", "POPULARITY"] : ["POPULARITY", "DISTANCE"];
    places = keep([await nearbyOpenPlaces(origin, meters, first)]);
    if (places.length < WANT_COUNT) {
      places = keep(await Promise.all([extra(nearbyOpenPlaces(origin, meters, second)), extra(textSearchOpenPlaces(origin, MOOD_QUERY[mood], meters, { cache: true }))]));
    }
    if (places.length < WANT_COUNT) {
      places = keep(await Promise.all(MOODS.filter((m) => m !== mood).map((m) => extra(textSearchOpenPlaces(origin, MOOD_QUERY[m], meters, { cache: true })))));
    }
    if (places.length >= (r === 0 ? MIN_WALKABLE : MIN_FARTHER) || r === maxReach) return { places, reach: r, cravingMatched: false };
  }
  return { places, reach: maxReach, cravingMatched: false };
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
    photos: place.photos.length > 1 ? place.photos.map(photoOf) : undefined,
    storefront: place.storefront ? photoOf(place.storefront) : undefined,
    phone: place.phone ?? undefined,
    phoneDial: place.phoneDial ?? undefined,
    reservable: place.reservable,
    photo: place.photoName
      ? { kind: "url", url: `/api/photo?name=${encodeURIComponent(place.photoName)}`, attribution: place.photoAuthor ?? undefined }
      : { kind: "mock", palette: ["#c8401f", "#3f8f6b", "#efe3c8"], motif: "plate" },
    rating: place.rating,
    ratingCount: place.ratingCount,
    about: place.summary ?? undefined,
    mapsUrl: place.mapsUri ?? undefined,
    vegetarianOptions: place.servesVegetarianFood,
    placeTypes: [place.primaryType, ...place.types].filter((t): t is string => Boolean(t)).slice(0, 8),
  };
}

function photoOf(p: PlacePhoto): PickPhoto {
  return { kind: "url", url: `/api/photo?name=${encodeURIComponent(p.name)}`, attribution: p.author ?? undefined };
}

/**
 * Same stream shape on mock data, so the client path is identical without keys. The mock
 * places stand in for two rings: this mood's picks on foot, then every other one "a short drive" away.
 */
async function* demoFeed(req: PicksRequest, exclude: Set<string>): AsyncGenerator<PicksEvent> {
  const diets = req.dietary?.diets ?? [];
  const veg = diets.some((d) => VEG_DIETS.test(d));
  const craving = req.craving?.trim() || null;
  const start = Math.min(Math.max(req.reach ?? 0, req.widen ? 1 : 0), 1);
  const queue = (allMoods: boolean) =>
    buildMockQueue(req.mood, new Date(), { firstOfSession: Boolean(req.firstOfSession), allMoods })
      .filter((p) => !exclude.has(p.id) && !(veg && ["steak and BBQ", "burgers"].includes(p.category ?? "")))
      .map((p) => ({ ...p, suggestion: dietSafeSuggestion(p.suggestion, diets) }));
  let picks = queue(Boolean(craving));
  let reach = start;
  // A word match stands in for Text Search on the fictional places.
  let cravingMatched = false;
  if (craving) {
    const words = craving.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    const hit = (p: Pick) => words.some((w) => `${p.name} ${p.suggestion} ${p.reason} ${p.category ?? ""}`.toLowerCase().includes(w.replace(/s$/, "")));
    const matches = picks.filter(hit);
    cravingMatched = matches.length > 0;
    if (!cravingMatched) reach = 0;
    picks = cravingMatched ? matches : picks.filter((p) => p.moods.includes(req.mood));
  }
  if (!craving || !cravingMatched) {
    if (reach === 0 && picks.length === 0) reach = 1;
    if (reach === 1) {
      picks = queue(true).map((p) => ({ ...p, travelMode: "drive" as const, walkMinutes: Math.max(4, Math.round(p.walkMinutes / 3)) }));
    }
  }
  yield {
    type: "meta",
    mode: "demo",
    sparse: reach > start,
    reach,
    areaLabel: null,
    areaSource: "demo",
    sharedWith: [],
    ...(craving ? { cravingMatched } : {}),
  };
  if (picks.length === 0) {
    yield { type: "empty", message: "That's every demo pick.", suggestion: "other_mood" };
    return;
  }
  for (const [i, pick] of picks.entries()) {
    await new Promise((r) => setTimeout(r, i === 0 ? 250 : 60));
    yield { type: "pick", pick };
  }
  yield { type: "done" };
}
