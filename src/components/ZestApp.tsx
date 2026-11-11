"use client";

import { KEPT_HERE, PARTY_KEPT } from "@/lib/copy";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MOODS, MOOD_LABELS, type FeedMode, type Mood, type PartyCard, type Pick, type PicksEvent } from "@/lib/types";
import { requestPreciseLocation, roundCoords, streamPicks, walkMinutesOnDevice, type PicksQuery, type SentRequest } from "@/lib/api";
import { applyMaybes, applySignals, cantEatHints, lessSignals, maybeSignals, mergeSignals, skipSignals } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { cravingShortcuts } from "@/lib/cravings";
import { fitNote, tooLate } from "@/lib/partyFit";
import { forgetAllWins, readWins } from "@/lib/wins";
import { mealFrame } from "@/lib/time";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { requestMotionPermission, useShake } from "@/hooks/useShake";
import { useVoice, type VoiceFallback } from "@/hooks/useVoice";
import { TopBar, type MenuItem } from "./TopBar";
import { NUDGE_LABEL, NotQuite } from "./NotQuite";
import { PickCard, PickSkeleton } from "./PickCard";
import { GoMenu } from "./GoMenu";
import { NavRow, navPill } from "./NavRow";
import { SavedSheet, type SavedKind } from "./SavedSheet";
import { EMPTY_WISH, WishesForm, WishesSheet } from "./WishesSheet";
import { fitsWishes, wishLine, type Wish } from "@/lib/wishes";
import { Controls } from "./Controls";
import { LockedIn } from "./LockedIn";
import { EmptyState, ErrorState, LocationPrompt, type EmptyActions } from "./FeedStates";
import { reachAt } from "@/lib/reach";
import { secondLookRound, seenIds } from "@/lib/secondLook";
import { steerGuess, type SteerGuess } from "@/lib/steer";
import { SearchContext } from "./SearchContext";
import { codeFromHash, partyLink, toPartyCard, useParty } from "@/hooks/useParty";
import { EveryoneLoves, InviteSheet, JoinScreen, PartyBar, PartyEndOfList, PartyResults } from "./Party";
import { DietPanel } from "./DietPanel";
import { PrivacyReceipt } from "./PrivacyReceipt";
import { CarIcon, HeartIcon, LockIcon, PartyIcon, PinIcon, RewindIcon, SlidersIcon, UtensilsIcon, WalkIcon, XIcon } from "./Icons";
import { aimAt, type AimKey } from "@/lib/aim";
import { aimOptions, openAimedTarget } from "@/lib/links";
import { createBow } from "@/lib/bow";
import { LAUNCH_MS } from "@/hooks/useCardGestures";
import { BowButton } from "./BowButton";
import { dietaryBadge, readStoredDietary, useDietary } from "@/hooks/useDietary";
import type { Dietary } from "@/lib/types";

const hasDietary = (d: Dietary | null): d is Dietary => Boolean(d && d.diets.length + d.allergies.length > 0);

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
function clearHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

const IDLE_MS = 10 * 60 * 1000;

const TIPS_KEY = "zesthunt:tips:v1";
/** First-visit tips, one at a time, in plain words. Each gesture also has a button. */
const TIPS = [
  "Swipe left for less like this, right for more like this.",
  "Swipe up to save a maybe for later.",
  "Ready? Tap Let's go, or pull the card down, to get directions, order or call.",
];
/** Lingering this long on a pick opens its details: interest earns more detail. */
const DWELL_MS = 4000;
/** Skips in a row before "Not quite?" offers its one best guess. */
const SKIPS_BEFORE_NUDGE = 3;
/** An ignored guess fades after this long, and waits this many more skips before coming back. */
const HINT_MS = 6000;
const HINT_REST_SKIPS = 4;
/** The colour a steer washes over the next pick. */
const WASH: Record<Mood, string> = {
  fresh: "var(--color-teal-bright)",
  comfort: "var(--color-paprika-bright)",
  fast: "var(--color-star)",
  cheap: "var(--color-teal-bright)",
  treat: "var(--color-social-bright)",
};
const PARTY_COACH = "Answer each place: Love it, OK or Not for me. Answers stay secret until the reveal.";
/** Ask for more when this many unseen picks remain, so skips never wait on the network. */
const REFILL_AT = 3;

type Feed =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "need_location" }
  | { status: "empty"; message: string; suggestion: "drive" | "order_in" | "other_mood" }
  | { status: "error"; message: string };

const VOICE_NOTICE: Record<VoiceFallback, string> = {
  unsupported: "Voice needs on-device speech, which this browser doesn't have. Type instead.",
  preparing: "Getting on-device voice ready. Type for now.",
  denied: "The mic is off for this site. Type instead.",
};

/**
 * Everything lives in React state and refs: nothing is written to storage, so a
 * refresh, tab close or the 10-minute idle timer wipes it. That includes location,
 * skips and anything typed or said.
 */
export function ZestApp() {
  const [now, setNow] = useState<Date | null>(null);
  const [mood, setMood] = useState<Mood>("fresh");
  const [queue, setQueue] = useState<Pick[]>([]);
  const [feed, setFeed] = useState<Feed>({ status: "loading" });
  const [feedMode, setFeedMode] = useState<FeedMode | null>(null);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [swipes, setSwipes] = useState(0);
  const [locked, setLocked] = useState<Pick | null>(null);
  const [lockedOrder, setLockedOrder] = useState(false);
  /** "Let's go" opens the choices first: head there, order, call, or all the details. */
  const [goMenu, setGoMenu] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** The active craving: it drives the search (and every refill) until cleared. Memory only. */
  const [craving, setCraving] = useState<string | null>(null);
  /** The user asked to search a short drive away. Reset when the area changes. */
  const [widened, setWidened] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  // Start simple: no mood picker, no details. "Not quite?" appears after a couple of skips,
  // and a pick's details open when the person asks or lingers on it.
  const [tuneOpen, setTuneOpen] = useState(false);
  /** "Not quite? Something lighter?": one guess from the latest skips, in place of the full row. */
  const [steerHint, setSteerHint] = useState<SteerGuess | null>(null);
  const [wash, setWash] = useState<{ key: number; mood: Mood } | null>(null);
  const [moodChosen, setMoodChosen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** "Can't eat this": what the skipped pick hints at, offered first in the sheet. */
  const [dietSuggest, setDietSuggest] = useState<{ diets: string[]; allergies: string[] } | null>(null);
  const skipsSinceNudge = useRef(0);
  const allergiesChanged = useRef(false);
  // A small win on the locked-in screen: how quickly this hunt ended. Device-only.
  const huntStartedAt = useRef<number | null>(null);
  const [decided, setDecided] = useState<{ seconds: number; swipes: number } | null>(null);
  /** The swipe hint plays once per session. */
  const [hinted, setHinted] = useState(false);
  /** The reveal screen comes first; "Let's go" from it opens the locked-in screen. */
  const [resultSeen, setResultSeen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [refilling, setRefilling] = useState(false);
  // The "What we sent" receipt: the last request body and the server's account of it. Memory only.
  const [lastSent, setLastSent] = useState<SentRequest | null>(null);
  const [lastMeta, setLastMeta] = useState<Extract<PicksEvent, { type: "meta" }> | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Session-only context, never persisted.
  const location = useRef<{ lat: number; lng: number } | null>(null);
  const preciseLocation = useRef<{ lat: number; lng: number } | null>(null);
  const areaQuery = useRef<string | null>(null);
  // Mirrors of `craving` and `widened` for request building inside stable callbacks.
  const cravingRef = useRef<string | null>(null);
  // "Back to Kai Poke?": places remembered on this device (opt-in), offered first once per session.
  const winIds = useRef<Set<string> | null>(null);
  const returnTried = useRef(false);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [winsCount, setWinsCount] = useState(() => (typeof window === "undefined" ? 0 : readWins().length));
  const widenRef = useRef(false);
  /** The ring the last search reached (see lib/reach); refills start there. Reset by a fresh search. */
  const reachRef = useRef(0);
  /** Mirrors for callbacks that run after a stream event, outside render. */
  const queueRef = useRef<Pick[]>([]);
  const indexRef = useRef(0);
  const secondLooks = useRef(0);
  const firstOfSession = useRef(true);
  const inflight = useRef<AbortController | null>(null);
  const skipped = useRef<Pick[]>([]);
  /** "Less like this": skips that steer away straight away (memory only). */
  const disliked = useRef<Pick[]>([]);
  // Which way the next card comes in: from the right when moving on, from the left when going back.
  const [enterFrom, setEnterFrom] = useState<"right" | "left">("right");
  /** Solo "More like this": places you liked this visit (memory only, never saved). Searches lean toward them. */
  const [maybes, setMaybes] = useState<Pick[]>([]);
  const maybesRef = useRef<Pick[]>([]);
  /** Solo "Maybe": saved for later without steering the picks (memory only). */
  const [laters, setLaters] = useState<Pick[]>([]);
  const latersRef = useRef<Pick[]>([]);
  /** The Saved sheet: liked places and maybes. */
  const [maybesOpen, setMaybesOpen] = useState(false);
  const exhausted = useRef(new Set<Mood>());
  const motionAsked = useRef(false);
  const voiceNoticeShown = useRef(new Set<VoiceFallback>());
  // Precise location as state too, so party cards can show on-device walk times when rendering.
  const [precise, setPrecise] = useState<{ lat: number; lng: number } | null>(null);

  // Hunt party (rooms live 45 minutes on the server; everything here is memory only).
  const party = useParty();
  const joinCode = useSyncExternalStore(subscribeHash, codeFromHash, () => null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [pIndex, setPIndex] = useState(0);
  const [pHistory, setPHistory] = useState<number[]>([]);
  const [hostExtra, setHostExtra] = useState<Pick[]>([]);
  const [wishesOpen, setWishesOpen] = useState(false);
  const [myWish, setMyWish] = useState<Wish | null>(null);
  // Asked once per group: guests get the sheet when they join; the host sets them in the invite sheet.
  const [askedWishes, setAskedWishes] = useState(false);
  const [hostWish, setHostWish] = useState<Wish>(EMPTY_WISH);
  /** In a group: browsing search results to add one to the vote. */
  const [adding, setAdding] = useState<{ query: string; picks: Pick[]; at: number; loading: boolean } | null>(null);
  const addingCtrl = useRef<AbortController | null>(null);
  /** Set while in a group, so a typed or spoken search adds to the vote instead of steering solo picks. */
  const groupSearch = useRef<((query: string) => void) | null>(null);
  const hostRefilling = useRef(false);

  // Dietary needs: memory by default; localStorage only if the user opts in.
  const { dietary, remembered: dietRemembered, update: updateDiet, setRemember, forget: forgetDiet, current: dietRef } = useDietary();
  const [dietOpen, setDietOpen] = useState(false);
  const dietAtOpen = useRef("");

  const baseQuery = useCallback(
    (m: Mood, sig: string[]): PicksQuery => ({
      mood: m,
      location: location.current,
      areaQuery: areaQuery.current,
      firstOfSession: firstOfSession.current,
      skipSignals: sig,
      ...(maybesRef.current.length > 0 ? { likeSignals: maybeSignals(maybesRef.current) } : {}),
      dietary: hasDietary(dietRef.current) ? dietRef.current : null,
      craving: cravingRef.current,
      ...(widenRef.current ? { widen: true } : {}),
      ...(reachRef.current > 0 ? { reach: reachRef.current } : {}),
    }),
    [dietRef],
  );

  useEffect(() => {
    queueRef.current = queue;
    indexRef.current = index;
  }, [queue, index]);

  /**
   * Every ring has been searched and the person is at the end: go round again with the
   * places they passed, rather than a dead end. Returns false if there's nothing to show.
   */
  const appendSecondLook = useCallback((from: number) => {
    // Maybes come back first: they're the ones the person was nearly sold on.
    const round = secondLookRound([...latersRef.current, ...maybesRef.current, ...skipped.current], queueRef.current.slice(from), Date.now());
    if (round.length === 0) return false;
    secondLooks.current += 1;
    setQueue((q) => [...q, ...round]);
    setNotice(
      secondLooks.current === 1
        ? "That's everything open around you. Here's a second look at the ones you passed."
        : "Round again: the ones you passed.",
    );
    return true;
  }, []);

  /**
   * Streams picks from the server. "replace" starts a fresh queue (first pick shows as
   * soon as it arrives); "append" adds behind the current queue for refills and mood switches
   * (callers set `refilling` first so the empty state waits for it).
   */
  const fetchQueue = useCallback(
    (m: Mood, sig: string[], opts: { append: boolean; extra?: Partial<PicksQuery> }) => {
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      let got = 0;

      const onEvent = (e: PicksEvent) => {
        if (ctrl.signal.aborted) return;
        switch (e.type) {
          case "meta": {
            setFeedMode(e.mode);
            setLastMeta(e);
            const from = reachAt(reachRef.current).label;
            if (typeof e.reach === "number") reachRef.current = e.reach;
            // Going farther is never silent: say where the new picks are.
            if (e.sparse) {
              const to = reachAt(reachRef.current).label;
              setNotice(opts.append ? `You've seen what's open within ${from}. Now looking ${to} away.` : `Not much open within ${from}, so these are ${to} away.`);
            }
            if (e.cravingMatched === false && cravingRef.current) {
              setNotice(
                opts.append
                  ? `That's every “${cravingRef.current}” place nearby. Here's everything else open.`
                  : `Nothing for “${cravingRef.current}” open nearby, so here’s what is.`,
              );
              // The search moved on from the craving, so refills shouldn't keep asking for it.
              cravingRef.current = null;
              setCraving(null);
            }
            break;
          }
          case "pick":
            got++;
            firstOfSession.current = false;
            // A remembered place in the session's first batch goes to the front, once.
            if (!opts.append && !returnTried.current) {
              winIds.current ??= new Set(readWins().map((w) => w.placeId));
              if (winIds.current.has(e.pick.placeId)) {
                returnTried.current = true;
                setReturningId(e.pick.id);
                setNotice(`Back to ${e.pick.name}? It's open.`);
                if (got > 1) {
                  setQueue((q) => [e.pick, ...q.filter((p) => p.id !== e.pick.id)]);
                  break;
                }
              }
            }
            if (!opts.append && got === 1) {
              setNow(new Date());
              setQueue([e.pick]);
              setFeed({ status: "ready" });
            } else {
              setQueue((q) => (q.some((p) => p.id === e.pick.id) ? q : [...q, e.pick]));
              setFeed((f) => {
                if (f.status === "ready") return f;
                setNow(new Date());
                return { status: "ready" };
              });
            }
            break;
          case "need_location":
            setFeed({ status: "need_location" });
            break;
          case "empty":
            exhausted.current.add(m);
            // Waiting at the end of the queue: go round again instead of stopping.
            if (opts.append && indexRef.current >= queueRef.current.length && appendSecondLook(indexRef.current)) break;
            if (got === 0) {
              setFeed((f) => (opts.append && f.status === "ready" ? f : { status: "empty", message: e.message, suggestion: e.suggestion }));
            }
            break;
          case "error":
            if (got === 0) setFeed((f) => (opts.append && f.status === "ready" ? f : { status: "error", message: e.message }));
            break;
          case "done":
            if (opts.append && got === 0) {
              exhausted.current.add(m);
              if (indexRef.current >= queueRef.current.length) appendSecondLook(indexRef.current);
            }
            if (!opts.append) returnTried.current = true;
            break;
        }
      };

      streamPicks({ ...baseQuery(m, sig), ...opts.extra }, onEvent, ctrl.signal, setLastSent)
        .catch((err: unknown) => {
          if (ctrl.signal.aborted || got > 0) return;
          const message = err instanceof Error ? err.message : "Couldn't load picks.";
          setFeed((f) => (opts.append && f.status === "ready" ? f : { status: "error", message }));
        })
        .finally(() => {
          if (inflight.current === ctrl) setRefilling(false);
        });
    },
    [baseQuery, appendSecondLook],
  );

  const load = useCallback(
    (m: Mood, extra: Partial<PicksQuery> = {}) => {
      // A fresh search starts close by again.
      reachRef.current = 0;
      secondLooks.current = 0;
      exhausted.current.delete(m);
      setQueue([]);
      setIndex(0);
      setHistory([]);
      setFeed({ status: "loading" });
      fetchQueue(m, mergeSignals(lessSignals(disliked.current), skipSignals(skipped.current)), { append: false, extra });
    },
    [fetchQueue],
  );

  const applyCraving = useCallback((c: string | null) => {
    cravingRef.current = c;
    setCraving(c);
  }, []);

  const applyWiden = (on: boolean) => {
    widenRef.current = on;
    setWidened(on);
  };

  // Open straight onto a pick (server uses a city-level IP estimate if there's no location yet).
  useEffect(() => {
    // Storage-backed state may not have settled yet on the first effect, so read it directly.
    const stored = readStoredDietary();
    fetchQueue("fresh", [], { append: false, extra: hasDietary(stored) ? { dietary: stored } : {} });
    return () => inflight.current?.abort();
  }, [fetchQueue]);

  // Keep the clock fresh for closing-time warnings and meal framing.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(t);
  }, [notice]);


  const current = feed.status === "ready" ? (queue[index] ?? null) : null;
  // The area is the network's rough guess and the device hasn't shared its location: no walk times on show.
  const approxNow = Boolean(lastMeta?.areaSource === "ip" && !precise);

  /** Move on: a plain skip, after a like ("More like this"), or steering away ("Less like this"). */
  const soloSkip = useCallback((how: "skip" | "liked" | "less" = "skip") => {
    if (!current) return;
    const asMaybe = how === "liked";
    // A like isn't a "no": it doesn't count toward skip hints.
    if (!asMaybe) skipped.current = [...skipped.current, current];
    // Inside a search ("tacos"), passing on a place means "not this place", never "fewer tacos":
    // no kind-of-food signals are learned from it, only distance and price patterns.
    const inSearch = Boolean(cravingRef.current);
    if (how === "less" && !inSearch) disliked.current = [...disliked.current.filter((p) => p.id !== current.id), current];
    const all = mergeSignals(lessSignals(disliked.current), skipSignals(skipped.current));
    const next = inSearch ? all.filter((s) => !s.startsWith("fewer ") || signals.includes(s)) : all;
    const fresh = next.filter((s) => !signals.includes(s));
    if (how === "less" && inSearch && !asMaybe) setNotice("Got it: not this one.");
    else if ((fresh.length > 0 || how === "less") && !asMaybe) {
      // Reorder what's left right away so the signal feels instant; the next refill sends it to the ranker.
      setQueue((q) => [...q.slice(0, index + 1), ...applySignals(q.slice(index + 1), next)]);
      setSignals(next);
      if (how === "less") setNotice(current.category ? `Got it: fewer ${current.category}.` : "Got it: less like that.");
      else setNotice(`Got it: ${fresh[0]}.`);
    }
    setHistory((h) => [...h, index]);
    setIndex((i) => i + 1);
    setSwipes((s) => s + 1);
    if (!asMaybe) skipsSinceNudge.current += 1;
    if (skipsSinceNudge.current >= SKIPS_BEFORE_NUDGE && !tuneOpen && !asMaybe) setSteerHint(steerGuess(skipped.current, mood));

    // Refill quietly in the background when the queue runs low, carrying this session's signals.
    // Once every ring has been searched, the end of the queue starts a second look instead.
    const left = queue.length - (index + 1);
    if (left <= REFILL_AT && !refilling && !exhausted.current.has(mood)) {
      setRefilling(true);
      fetchQueue(mood, next, { append: true, extra: { exclude: seenIds([queue, skipped.current, maybesRef.current, latersRef.current]) } });
    } else if (left === 0 && exhausted.current.has(mood)) {
      appendSecondLook(index + 1);
    }
  }, [current, index, signals, queue, refilling, mood, fetchQueue, appendSecondLook, tuneOpen]);

  // An ignored guess bows out quietly and rests for a few skips.
  useEffect(() => {
    if (!steerHint) return;
    const t = setTimeout(() => {
      setSteerHint(null);
      skipsSinceNudge.current = -HINT_REST_SKIPS;
    }, HINT_MS);
    return () => clearTimeout(t);
  }, [steerHint]);

  /** Lock in and start the journey; aimed at "order", it opens with the ordering choices showing. */
  const soloGo = useCallback((target?: AimKey) => {
    if (!current) return;
    setLockedOrder(target === "order");
    haptic(18);
    const started = huntStartedAt.current;
    setDecided(started ? { seconds: Math.max(1, Math.round((Date.now() - started) / 1000)), swipes } : null);
    setLocked(current);
    // Precise location is asked for only now, and used on the device to refine the walk time.
    if (!preciseLocation.current && current.travelMode === "walk") {
      void requestPreciseLocation().then((pos) => {
        if (!pos) return;
        preciseLocation.current = pos;
        location.current = roundCoords(pos.lat, pos.lng);
        setPrecise(pos);
        setLocked((l) => (l && l.id === current.id ? { ...l, walkMinutes: walkMinutesOnDevice(pos, l.location), timeEstimated: true } : l));
      });
    }
  }, [current, swipes]);

  const soloRewind = useCallback(() => {
    if (history.length === 0) return;
    const back = history[history.length - 1];
    const pick = queue[back];
    if (pick) {
      skipped.current = skipped.current.filter((p) => p.id !== pick.id);
      disliked.current = disliked.current.filter((p) => p.id !== pick.id);
    }
    setIndex(back);
    setHistory(history.slice(0, -1));
  }, [history, queue]);

  /** Restyles the queue instantly from picks already in hand, then streams more for the new mood behind them. */
  const changeMood = (m: Mood) => {
    if (m === mood) return;
    if (cravingRef.current) {
      // Craving picks were chosen for the craving, not the mood, so re-search with both.
      setMood(m);
      load(m);
      return;
    }
    setMood(m);
    exhausted.current.delete(m);
    const pool = queue.slice(index);
    const fit = applySignals(
      pool.filter((p) => p.moods.includes(m)),
      signals,
    );
    setQueue(fit);
    setIndex(0);
    setHistory([]);
    if (fit.length > 0) {
      setFeed({ status: "ready" });
    } else if (feed.status === "ready" || feed.status === "loading") {
      setFeed({ status: "loading" });
    }
    const exclude = seenIds([fit, skipped.current]);
    setRefilling(true);
    fetchQueue(m, signals, { append: true, extra: { exclude } });
  };

  const wildcard = useCallback(() => {
    if (feed.status !== "ready") return;
    const others = MOODS.filter((m) => m !== mood);
    const wildMood = others[Math.floor(Math.random() * others.length)];
    const ctrl = new AbortController();
    let taken = false;
    streamPicks(
      // A wildcard is about stepping outside the current search, so it leaves the craving out.
      { ...baseQuery(wildMood, signals), craving: null, exclude: seenIds([queue, skipped.current]) },
      (e) => {
        if (e.type === "meta") setLastMeta(e);
        if (taken || e.type !== "pick") return;
        taken = true;
        ctrl.abort();
        haptic([10, 40, 10]);
        setQueue((q) => [...q.slice(0, index), e.pick, ...q.slice(index)]);
        setNotice(`Wildcard: something ${MOOD_LABELS[wildMood].toLowerCase()}`);
      },
      ctrl.signal,
      setLastSent,
    ).catch(() => {
      if (!taken) setNotice("No wildcard right now. Try again in a moment.");
    });
  }, [feed.status, mood, baseQuery, signals, queue, index]);

  const onWildcardTap = () => {
    if (party.active) {
      setNotice("Wildcards are solo-only for now.");
      return;
    }
    // iOS only shows the motion prompt from a tap, so the first wildcard tap also enables shake.
    if (!motionAsked.current) {
      motionAsked.current = true;
      void requestMotionPermission();
    }
    wildcard();
  };

  useShake(wildcard, !locked && feed.status === "ready" && !party.active);

  const submitCraving = useCallback(
    (text: string) => {
      setComposing(false);
      setDraft("");
      const wish = text.trim().slice(0, 140);
      if (!wish) return;
      if (groupSearch.current) {
        groupSearch.current(wish);
        return;
      }
      applyCraving(wish);
      setNotice(`Hunting: “${wish}”`);
      load(mood);
    },
    [load, mood, applyCraving],
  );

  const clearCraving = () => {
    applyCraving(null);
    load(mood);
  };

  const searchWider = () => {
    applyWiden(true);
    load(mood);
  };

  const onVoiceFallback = useCallback((why: VoiceFallback) => {
    setComposing(true);
    if (!voiceNoticeShown.current.has(why)) {
      voiceNoticeShown.current.add(why);
      setNotice(VOICE_NOTICE[why]);
    }
  }, []);

  const voice = useVoice({ onFinal: submitCraving, onFallback: onVoiceFallback });

  const submitArea = (query: string) => {
    // A typed area replaces any device location, which the server would otherwise prefer.
    areaQuery.current = query.trim() || null;
    location.current = null;
    preciseLocation.current = null;
    setPrecise(null);
    applyWiden(false);
    setAreaOpen(false);
    load(mood);
  };

  const shareMyLocation = async () => {
    setAreaOpen(false);
    setFeed({ status: "loading" });
    const pos = await requestPreciseLocation();
    if (!pos) {
      setFeed({ status: "need_location" });
      setNotice("Location is off. Type a neighborhood or ZIP instead.");
      return;
    }
    preciseLocation.current = pos;
    location.current = roundCoords(pos.lat, pos.lng);
    areaQuery.current = null;
    applyWiden(false);
    setPrecise(pos);
    setNotice("Rounded to ~1 km before it left your device.");
    load(mood);
  };

  const toggleReceipt = () => {
    if (dietOpen) closeDiet();
    setInviteOpen(false);
    setAreaOpen(false);
    setReceiptOpen((o) => !o);
  };

  const onIdle = useCallback(() => {
    setSwipes(0);
    huntStartedAt.current = null;
    setComposing(false);
    voice.cancel();
    skipped.current = [];
    disliked.current = [];
    maybesRef.current = [];
    setMaybes([]);
    latersRef.current = [];
    setLaters([]);
    setSignals([]);
    applyCraving(null);
    widenRef.current = false;
    setWidened(false);
    load(mood);
    setNotice("Picks cleared after 10 quiet minutes.");
  }, [load, mood, voice, applyCraving]);

  const openDiet = () => {
    if (dietOpen) return closeDiet();
    dietAtOpen.current = JSON.stringify(dietary);
    setInviteOpen(false);
    setReceiptOpen(false);
    setDietOpen(true);
  };

  /** Applies dietary changes once, when the panel closes, instead of on every tap. */
  const closeDiet = () => {
    setDietOpen(false);
    setDietSuggest(null);
    if (JSON.stringify(dietRef.current) !== dietAtOpen.current && !party.active) {
      setNotice(hasDietary(dietRef.current) ? "Picks updated to fit what you eat." : "Showing everything again.");
      load(mood);
    }
  };

  // ---------------------------------------------------------------------------
  // Hunt party
  // ---------------------------------------------------------------------------

  /** Party cards carry no travel time; each device fills it in from what it already knows. */
  const toLocalPick = useCallback(
    (c: PartyCard): Pick => {
      const own = queue.find((p) => p.id === c.id) ?? hostExtra.find((p) => p.id === c.id);
      if (own) return own;
      if (precise && c.travelMode === "walk") {
        return { ...c, walkMinutes: walkMinutesOnDevice(precise, c.location), distanceMeters: 0, timeEstimated: true };
      }
      return { ...c, walkMinutes: 0, distanceMeters: 0, travelUnknown: true };
    },
    [queue, hostExtra, precise],
  );

  const partyPicks = useMemo(() => party.deck.map(toLocalPick), [party.deck, toLocalPick]);
  // Places removed because they don't fit someone are skipped, and don't count toward "voted".
  const unfitSet = useMemo(() => new Set(party.unfit), [party.unfit]);
  let pAt = pIndex;
  while (pAt < partyPicks.length && unfitSet.has(partyPicks[pAt].id)) pAt++;
  const partyCurrent = party.active ? (partyPicks[pAt] ?? null) : null;
  const votableCount = partyPicks.filter((p) => !unfitSet.has(p.id)).length;
  // My maybes in a group: places I moved past without answering, to come back to. Never sent anywhere.
  const [pLater, setPLater] = useState<string[]>([]);
  const [reviewingLater, setReviewingLater] = useState(false);
  const pendingLaters = pLater.filter((id) => !party.myAnswers[id] && !unfitSet.has(id) && partyPicks.some((p) => p.id === id));
  // Finished: answered every place still in play, or said "I'm done".
  const doneCount = party.members.filter((m) => party.doneIds.includes(m.id) || (votableCount > 0 && (party.progress[m.id] ?? 0) >= votableCount)).length;
  // My own answers, as a little guide: how many of each, and how many places are left to see.
  const myTally = useMemo(() => {
    const t = { love: 0, ok: 0, no: 0, left: 0 };
    for (const p of partyPicks) {
      if (unfitSet.has(p.id)) continue;
      const a = party.myAnswers[p.id];
      if (a) t[a] += 1;
      else t.left += 1;
    }
    return t;
  }, [partyPicks, unfitSet, party.myAnswers]);
  /**
   * The only automatic removal: the place would close before I could realistically get there
   * (after the vote and my own trip). Food mismatches are never removed for me: they're a
   * private note on the card, and "Can't eat this" is my call.
   */
  const worksForMe = useCallback((p: Pick) => !tooLate(p, p.travelUnknown ? null : p.walkMinutes, new Date()), []);

  /**
   * Only the host has a location, so only the host's device fetches more cards for the room.
   * A group nudge ("Heartier") passes its mood and always runs, even mid-refill.
   */
  const hostRefill = useCallback((nudge?: Mood) => {
    if (hostRefilling.current && !nudge) return;
    hostRefilling.current = true;
    const got: Pick[] = [];
    streamPicks(
      // A nudge follows the group's word, not the host's own craving.
      { ...baseQuery(nudge ?? mood, signals), ...(nudge ? { craving: null } : {}), exclude: party.deck.map((c) => c.id) },
      (e) => {
        if (e.type === "meta") setLastMeta(e);
        if (e.type === "pick") got.push(e.pick);
      },
      new AbortController().signal,
      setLastSent,
    )
      .then(() => {
        // Only places the host could actually reach before closing go to the room.
        const fit = got.filter(worksForMe);
        setHostExtra((x) => [...x, ...fit]);
        return party.addCards(fit.map(toPartyCard));
      })
      .catch(() => {})
      .finally(() => {
        hostRefilling.current = false;
      });
  }, [baseQuery, mood, signals, party, worksForMe]);

  // A group works like solo: swipe left for the next place, right to go back, pull down to vote.
  const partyNext = () => {
    if (!partyCurrent) return;
    setPHistory((h) => [...h, pAt]);
    setSwipes((n) => n + 1);
    if (reviewingLater) {
      // Going back through my maybes: straight to the next undecided one, then the end.
      const nextAt = partyPicks.findIndex((p) => p.id !== partyCurrent.id && pLater.includes(p.id) && !party.myAnswers[p.id] && !unfitSet.has(p.id));
      if (nextAt >= 0) setPIndex(nextAt);
      else {
        setReviewingLater(false);
        setPIndex(partyPicks.length);
      }
      return;
    }
    setPIndex(pAt + 1);
  };
  /** Maybe (in a group): move on without answering, and come back to it before you're done. Only on this device. */
  const partyMaybe = () => {
    if (!partyCurrent) return;
    if (pLater.includes(partyCurrent.id)) {
      setPLater((l) => l.filter((id) => id !== partyCurrent.id));
      setNotice("Taken off your maybes.");
      return;
    }
    setPLater((l) => [...l, partyCurrent.id]);
    haptic(8);
    setEnterFrom("right");
    partyNext();
  };
  const reviewLaters = () => {
    const at = partyPicks.findIndex((p) => pendingLaters.includes(p.id));
    if (at < 0) return;
    setReviewingLater(true);
    setPHistory((h) => [...h, pAt]);
    setPIndex(at);
  };
  /** Love it / OK / Not for me: answers (or changes the answer to) the place on screen, then moves on. */
  const partyAnswer = (a: "love" | "ok" | "no") => {
    if (!partyCurrent) return;
    const before = party.myAnswers[partyCurrent.id];
    party.answer(partyCurrent.id, a);
    // Answering decides a maybe.
    setPLater((l) => l.filter((id) => id !== partyCurrent.id));
    setEnterFrom("right");
    haptic(a === "love" ? 14 : 8);
    if (before && before !== a) setNotice(`Changed to ${a === "love" ? "Love it" : a === "ok" ? "OK" : "Not for me"}.`);
    else if (party.members.length < 2 && Object.keys(party.myAnswers).length === 0) setNotice("Answered. Invite friends to vote too.");
    partyNext();
  };

  // Wishes: asked once when you join or start a group, and any time from the bar.
  const saveWishes = (w: Wish) => {
    setWishesOpen(false);
    setMyWish(w);
    void party
      .setWishes(w)
      .then(() => setNotice("Got it. Places that fit everyone's wishes get added to the list."))
      .catch(() => setNotice("Couldn't reach the group. Try again."));
  };

  // Searching in a group: browse what turns up like solo picks, and pull one down to add it.
  const addingCurrent = adding ? (adding.picks[adding.at] ?? null) : null;
  const myAdded = useRef(new Set<string>());
  const startAdding = (query: string) => {
    addingCtrl.current?.abort();
    const ctrl = new AbortController();
    addingCtrl.current = ctrl;
    setAdding({ query, picks: [], at: 0, loading: true });
    streamPicks(
      { ...baseQuery(mood, []), craving: query, exclude: party.deck.map((c) => c.placeId) },
      (e) => {
        if (e.type === "pick") setAdding((a) => (a && a.query === query ? { ...a, picks: [...a.picks, e.pick] } : a));
      },
      ctrl.signal,
      setLastSent,
    )
      .catch(() => {})
      .finally(() => setAdding((a) => (a && a.query === query ? { ...a, loading: false } : a)));
  };
  const stopAdding = () => {
    addingCtrl.current?.abort();
    setAdding(null);
  };
  const addToVote = async () => {
    const pick = addingCurrent;
    if (!pick) return;
    myAdded.current.add(pick.id);
    try {
      const r = await party.add(toPartyCard(pick));
      setHostExtra((x) => [...x, pick]);
      haptic(12);
      setNotice(r.existed ? `${pick.name} was already on the list. Your vote's in.` : `${pick.name} added to everyone's list, with your vote.`);
      stopAdding();
    } catch (e) {
      myAdded.current.delete(pick.id);
      setNotice(e instanceof Error ? e.message : "Couldn't add it. Try again.");
    }
  };
  useEffect(() => {
    groupSearch.current = party.active ? startAdding : null;
  });

  // Someone else added a place: say so quietly, never who.
  const seenAdded = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!party.active) {
      seenAdded.current = null;
      return;
    }
    const addedCards = party.deck.filter((c) => c.added);
    if (!seenAdded.current) {
      // Places added before I joined aren't news.
      seenAdded.current = new Set(addedCards.map((c) => c.id));
      return;
    }
    const fresh = addedCards.filter((c) => !seenAdded.current!.has(c.id));
    for (const c of fresh) seenAdded.current.add(c.id);
    const others = fresh.filter((c) => !myAdded.current.has(c.id));
    if (others.length === 1) setNotice(`A new place was added to vote on: ${others[0].name}${/[.!?]$/.test(others[0].name) ? "" : "."}`);
    else if (others.length > 1) setNotice(`${others.length} new places were added to vote on.`);
  }, [party.active, party.deck]);

  const partyRewind = () => {
    // Back to the last card still in play (removed ones are skipped).
    const h = [...pHistory];
    while (h.length > 0 && unfitSet.has(partyPicks[h[h.length - 1]]?.id)) h.pop();
    if (h.length === 0) return;
    setPIndex(h[h.length - 1]);
    setPHistory(h.slice(0, -1));
  };

  // Each phone drops places that would close before its owner could get there, telling the room
  // only which cards (never who or why). Food is never auto-removed: see the private note.
  const reportedUnfit = useRef(new Set<string>());
  useEffect(() => {
    if (!party.active) return;
    const bad = partyPicks.filter((p) => !unfitSet.has(p.id) && !reportedUnfit.current.has(p.id) && !worksForMe(p)).map((p) => p.id);
    if (bad.length === 0) return;
    for (const id of bad) reportedUnfit.current.add(id);
    void party.markUnfit(bad).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check when the cards or removals change
  }, [partyPicks, unfitSet, party.active]);

  // Say so when someone else's phone removed places, without saying whose or why.
  const lastOthersRemoved = useRef(0);
  useEffect(() => {
    const othersRemoved = party.unfit.filter((id) => !reportedUnfit.current.has(id)).length;
    if (othersRemoved > lastOthersRemoved.current) {
      const n = othersRemoved - lastOthersRemoved.current;
      setNotice(`${n} place${n === 1 ? "" : "s"} removed: someone can't eat there, or it closes too soon.`);
    }
    lastOthersRemoved.current = othersRemoved;
  }, [party.unfit]);

  // Keep enough places to vote on: if removals leave few, the host's phone fetches more.
  const refilledAt = useRef(-1);
  useEffect(() => {
    if (!party.active || !party.isHost || votableCount >= 6 || party.deck.length >= 40 || refilledAt.current === party.deck.length) return;
    refilledAt.current = party.deck.length;
    hostRefill();
  }, [party.active, party.isHost, votableCount, party.deck.length, hostRefill]);

  // The group's wishes changed: the host's phone (the one with a location) adds a few places
  // that fit them all to the end of everyone's list. Wishes reach the room only as a summary.
  const wishKey = JSON.stringify(party.wishes);
  const lastWishFetch = useRef("");
  useEffect(() => {
    if (!party.active || !party.isHost || party.wishes.count === 0 || lastWishFetch.current === wishKey) return;
    lastWishFetch.current = wishKey;
    const w = party.wishes;
    const queries: (string | null)[] = w.crave.length > 0 ? w.crave.slice(0, 2) : [null];
    const have = new Set(party.deck.map((c) => c.placeId));
    void Promise.all(
      queries.map((q) => {
        const got: Pick[] = [];
        return streamPicks(
          { ...baseQuery(mood, signals), craving: q, widen: w.reach !== "walk", exclude: [...have] },
          (e) => {
            if (e.type === "pick") got.push(e.pick);
          },
          new AbortController().signal,
        )
          .then(() => got.filter((p) => !have.has(p.placeId) && fitsWishes(p, w) && worksForMe(p)).slice(0, 4))
          .catch(() => [] as Pick[]);
      }),
    ).then((lists) => {
      const fresh = [...new Map(lists.flat().map((p) => [p.placeId, p])).values()].slice(0, 6);
      if (fresh.length === 0) return;
      setHostExtra((x) => [...x, ...fresh]);
      void party
        .addCards(fresh.map(toPartyCard))
        .then(() => setNotice(`Added ${fresh.length} place${fresh.length === 1 ? "" : "s"} that fit the group's wishes.`))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per change in the group's wishes
  }, [wishKey, party.active, party.isHost]);

  /** "Can't eat this" on a party card: removed for everyone, anonymously. */
  const cantEatInParty = (id: string) => {
    reportedUnfit.current.add(id);
    void party.markUnfit([id]).catch(() => setNotice("Couldn't reach the group. Try again."));
    setNotice("Removed for everyone. Nobody sees who or why.");
  };

  /** One tap: open the room with the picks in hand, then show the invite (QR, link, share). */
  const startParty = async () => {
    setPartyBusy(true);
    setPartyError(null);
    try {
      // Every place in hand (from this one on, then the ones already seen), preferring those the
      // host can reach before closing. Late at night that can be none: then all of them, with
      // each phone's own "closes soon" note. With nothing in hand at all, fetch some first.
      let inHand = [...queue.slice(index), ...queue.slice(0, index)];
      if (inHand.length === 0) {
        setNotice("Finding places for the group…");
        const got: Pick[] = [];
        await streamPicks(
          { ...baseQuery(mood, signals), exclude: [] },
          (e) => {
            if (e.type === "meta") setLastMeta(e);
            if (e.type === "pick") got.push(e.pick);
          },
          new AbortController().signal,
          setLastSent,
        );
        inHand = got;
      }
      const seen = new Set<string>();
      const unique = inHand.filter((p) => !seen.has(p.placeId) && seen.add(p.placeId));
      const reachable = unique.filter(worksForMe);
      const cards = (reachable.length > 0 ? reachable : unique).map(toPartyCard);
      if (cards.length === 0) {
        setNotice("Couldn't find open places nearby to vote on. Try again in a moment.");
        return;
      }
      await party.create(cards);
      setPIndex(0);
      setPHistory([]);
      setNow(new Date());
      setInviteOpen(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't start a party.");
    } finally {
      setPartyBusy(false);
    }
  };

  /** Opening an invite link joins straight away: no form, a food name is handed out. */
  const joinParty = useCallback(async () => {
    if (!joinCode) return;
    setPartyBusy(true);
    setPartyError(null);
    try {
      await party.join(joinCode);
      setPIndex(0);
      setPHistory([]);
      setNow(new Date());
      setNotice(PARTY_COACH);
      // Guests are asked their wishes as they arrive (the host sets them in the invite sheet).
      setAskedWishes(true);
      setWishesOpen(true);
    } catch (e) {
      setPartyError(e instanceof Error ? e.message : "Couldn't join.");
    } finally {
      setPartyBusy(false);
    }
  }, [joinCode, party]);

  const joinTried = useRef<string | null>(null);
  useEffect(() => {
    if (!joinCode || party.active || joinTried.current === joinCode) return;
    joinTried.current = joinCode;
    void joinParty();
  }, [joinCode, party.active, joinParty]);

  // A request from anyone: the host's phone fetches places that fit and adds them to the end
  // of everyone's list. Nobody skips ahead, so everyone can still vote on every card.
  const steerSeq = party.steer?.seq ?? 0;
  const lastSteer = useRef(0);
  const pendingRequest = useRef<{ label: string; at: number } | null>(null);
  useEffect(() => {
    const s = party.steer;
    if (!s || s.seq === lastSteer.current) return;
    lastSteer.current = s.seq;
    const label = NUDGE_LABEL[s.mood].toLowerCase();
    const who = s.by === party.memberId ? "You" : (party.members.find((m) => m.id === s.by)?.nickname ?? "Someone");
    pendingRequest.current = { label, at: s.at };
    setNotice(`${who} asked for ${label} places. Adding a few to everyone's list…`);
    if (party.isHost) hostRefill(s.mood);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per request
  }, [steerSeq]);
  const deckLength = party.deck.length;
  useEffect(() => {
    const req = pendingRequest.current;
    if (!req || deckLength <= req.at) return;
    pendingRequest.current = null;
    const added = deckLength - req.at;
    setNotice(`${added} ${req.label} place${added === 1 ? "" : "s"} added to the end of the list.`);
  }, [deckLength]);

  // No countdown in a group: now and then, how long it's been (a guest joining late starts from where it is).
  const announced = useRef<number | null>(null);
  const partyStarted = party.startedAt;
  const inPartyNow = party.active;
  useEffect(() => {
    if (!inPartyNow || !partyStarted) {
      announced.current = null;
      return;
    }
    const MARKS = [5, 10, 15, 20, 30, 40];
    const tick = () => {
      const mins = (Date.now() - partyStarted) / 60_000;
      const mark = [...MARKS].reverse().find((m) => mins >= m) ?? 0;
      if (announced.current === null) announced.current = mark;
      else if (mark > announced.current) {
        announced.current = mark;
        setNotice(mark >= 40 ? `${mark} minutes in. The room closes at 45 minutes.` : `${mark} minutes in.`);
      }
    };
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [inPartyNow, partyStarted]);

  // Everyone loves a place: everyone is told once per place, and chooses whether to stop there.
  const [keptVoting, setKeptVoting] = useState<string[]>([]);
  const lovedByAll = party.everyoneLoves.find((id) => !keptVoting.includes(id)) ?? null;
  const lovedCard = lovedByAll ? (party.deck.find((c) => c.id === lovedByAll) ?? null) : null;
  useEffect(() => {
    if (lovedByAll) haptic([20, 40, 20]);
  }, [lovedByAll]);

  const leaveParty = () => {
    party.leave();
    setKeptVoting([]);
    setPLater([]);
    setReviewingLater(false);
    setAskedWishes(false);
    setHostWish(EMPTY_WISH);
    clearHash();
    setPIndex(0);
    setPHistory([]);
  };

  const shareParty = async () => {
    if (!party.code) return;
    const url = partyLink(party.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Zesthunt party", text: `Help pick where we eat. Party code ${party.code}.`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNotice("Invite link copied.");
    } catch {
      setNotice(`Party code: ${party.code}`);
    }
  };

  const onPartyButton = () => {
    // Through closeDiet so choices made in the open sheet still apply.
    if (dietOpen) closeDiet();
    setReceiptOpen(false);
    if (party.active) setInviteOpen((o) => !o);
    else if (!partyBusy) void startParty();
  };

  useEffect(() => {
    if (!party.ended) return;
    const t = setTimeout(party.clearEnded, 5000);
    return () => clearTimeout(t);
  }, [party.ended, party.clearEnded]);

  const inParty = party.active;
  // The same three moves everywhere: next, back, and pull down (go / vote / add).
  const moveOn = adding ? () => setAdding((a) => a && { ...a, at: a.at + 1 }) : inParty ? partyNext : () => soloSkip();
  const next = () => {
    setEnterFrom("right");
    moveOn();
  };
  /** Less like this: move on, and what's coming steers away from this kind of place at once. */
  const lessLike = () => {
    if (!current) return;
    haptic(8);
    setEnterFrom("right");
    soloSkip("less");
  };
  /** More like this: save this pick to the liked list (or take it off) and move on. What's coming leans toward it. */
  const toggleMaybe = (opts: { swiped?: boolean } = {}) => {
    if (!current) return;
    const liked = maybes.some((m) => m.placeId === current.placeId);
    // A swipe right on a place you already like just moves on (it never takes the like back).
    if (liked && opts.swiped) {
      setEnterFrom("left");
      soloSkip("liked");
      return;
    }
    if (liked) {
      const rest = maybes.filter((m) => m.placeId !== current.placeId);
      maybesRef.current = rest;
      setMaybes(rest);
      setNotice("Taken off the places you liked.");
      return;
    }
    const saved = [...maybes, current];
    maybesRef.current = saved;
    setMaybes(saved);
    haptic(10);
    const lean = maybeSignals(saved);
    setQueue((q) => [...q.slice(0, index + 1), ...applyMaybes(q.slice(index + 1), lean)]);
    setNotice(saved.length === 1 ? "Liked. More like this coming up, and it's saved for later." : `Liked. ${saved.length} saved so far.`);
    // The liked card leaves to the right, so the next one comes in from the left.
    setEnterFrom(opts.swiped ? "left" : "right");
    soloSkip("liked");
  };
  const isMaybe = Boolean(current && maybes.some((m) => m.placeId === current.placeId));
  // Holding Let's go draws the bow over the card; letting go shoots at what's aimed.
  const [bow] = useState(createBow);
  const shoot = (aim: number) => {
    if (!current) return bow.set(null);
    const target = aimAt(aim, aimOptions(current));
    // Straight from the gesture, so the browser allows the new tab or the call.
    openAimedTarget(current, target);
    haptic(18);
    bow.set({ tension: 1, aim, launching: true });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(
      () => {
        bow.set(null);
        soloGo(target);
      },
      still ? 0 : LAUNCH_MS,
    );
  };
  /** Maybe: save it for later without steering the picks (or take it off), and move on. */
  const isLater = Boolean(current && laters.some((m) => m.placeId === current.placeId));
  const toggleLater = () => {
    if (!current) return;
    if (isLater) {
      const rest = laters.filter((m) => m.placeId !== current.placeId);
      latersRef.current = rest;
      setLaters(rest);
      setNotice("Taken off your maybes.");
      return;
    }
    const saved = [...laters, current];
    latersRef.current = saved;
    setLaters(saved);
    haptic(8);
    setNotice(saved.length === 1 && maybes.length === 0 ? "Saved as a maybe. Find it under Saved, up top." : "Saved as a maybe.");
    setEnterFrom("right");
    soloSkip("liked");
  };
  const savedList: { pick: Pick; kind: SavedKind }[] = [...maybes.map((pick) => ({ pick, kind: "liked" as const })), ...laters.map((pick) => ({ pick, kind: "maybe" as const }))];
  /** From the Saved list: jump back to one (it's still in the queue), ready to go. */
  const openMaybe = (p: Pick) => {
    setMaybesOpen(false);
    const at = queue.findIndex((q) => q.placeId === p.placeId);
    if (at < 0 || at === index) return;
    setHistory((h) => [...h, index]);
    setIndex(at);
  };
  const removeMaybe = (p: Pick, kind: SavedKind) => {
    if (kind === "maybe") {
      const rest = laters.filter((m) => m.placeId !== p.placeId);
      latersRef.current = rest;
      setLaters(rest);
      if (rest.length + maybes.length === 0) setMaybesOpen(false);
      return;
    }
    const rest = maybes.filter((m) => m.placeId !== p.placeId);
    maybesRef.current = rest;
    setMaybes(rest);
    if (rest.length + laters.length === 0) setMaybesOpen(false);
  };
  const stepBack = adding ? () => setAdding((a) => (a && a.at > 0 ? { ...a, at: a.at - 1 } : a)) : inParty ? partyRewind : soloRewind;
  const back = () => {
    setEnterFrom("left");
    stepBack();
  };
  const pullGo = adding ? () => void addToVote() : inParty ? () => partyAnswer("love") : soloGo;
  const shown = inParty ? partyCurrent : current;
  const canGoBack = adding ? adding.at > 0 : inParty ? pHistory.length > 0 : history.length > 0;
  // Back is always offered; on the first pick it says so instead of doing nothing.
  const goBack = () => {
    if (canGoBack) back();
  };
  // First-pick tips: how the card works, until the first swipe or "Got it". Kept in memory only
  // (nothing is saved), so they're back on the next visit until you swipe once.
  // Remembered on this device once dismissed (just a yes/no, nothing about the person).
  const [tipsDismissed, setTipsDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(TIPS_KEY) === "done";
    } catch {
      return false;
    }
  });
  const [tipStep, setTipStep] = useState(0);
  const dismissTips = () => {
    setTipsDismissed(true);
    try {
      window.localStorage.setItem(TIPS_KEY, "done");
    } catch {
      // Storage blocked: the tips just come back next visit.
    }
  };
  const showTips = !tipsDismissed && !inParty && !adding && Boolean(current) && !composing && !goMenu && !locked && !maybesOpen;

  // The locked-in pick is never cut off by the idle timer.
  // Party rooms have their own hard 45-minute clock, so the idle timer pauses in a party too.
  const timer = useInactivityTimer(IDLE_MS, onIdle, Boolean(locked) || inParty || Boolean(party.matchedCard));

  // Keyboard: → next, ← or Backspace back, ↓ go (or vote, or add), solo or in a group.
  const keyActions = useRef<{ next: () => void; back: () => void; pullGo: () => void; answer?: (a: "love" | "ok" | "no") => void; maybe?: () => void; less?: () => void; later?: () => void }>({ next, back: goBack, pullGo });
  useEffect(() => {
    keyActions.current = { next, back: goBack, pullGo, answer: inParty && !adding ? partyAnswer : undefined, maybe: !inParty && !adding ? () => toggleMaybe() : undefined, less: !inParty && !adding ? lessLike : undefined, later: adding ? undefined : inParty ? partyMaybe : toggleLater };
  });
  useEffect(() => {
    if (locked || composing || receiptOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [role=tablist]")) return;
      if (keyActions.current.maybe && e.key.toLowerCase() === "m") keyActions.current.maybe();
      else if (keyActions.current.less && e.key.toLowerCase() === "l") keyActions.current.less();
      else if (keyActions.current.answer && ["1", "2", "3"].includes(e.key)) keyActions.current.answer(e.key === "1" ? "no" : e.key === "2" ? "ok" : "love");
      else if (e.key === "ArrowRight") keyActions.current.next();
      else if (e.key === "ArrowLeft" || e.key === "Backspace") keyActions.current.back();
      else if (e.key === "ArrowUp" && keyActions.current.later) {
        e.preventDefault();
        keyActions.current.later();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        keyActions.current.pullGo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, composing, receiptOpen]);

  // Lingering on a pick is interest: open its details without being asked.
  const shownId = shown?.id ?? null;
  const busy = dietOpen || composing || areaOpen || receiptOpen || inviteOpen;
  useEffect(() => {
    if (!shownId || busy || expandedId === shownId) return;
    const t = setTimeout(() => setExpandedId(shownId), DWELL_MS);
    return () => clearTimeout(t);
  }, [shownId, busy, expandedId]);

  // The hunt's clock starts when the first pick appears (and again after an idle reset).
  useEffect(() => {
    if (shownId && huntStartedAt.current === null) huntStartedAt.current = Date.now();
  }, [shownId]);

  if (party.matchedCard && party.result && !resultSeen) {
    return (
      <PartyResults
        result={party.result}
        onGo={() => setResultSeen(true)}
        onLeave={() => {
          party.dismissMatch();
          leaveParty();
        }}
      />
    );
  }
  if (party.matchedCard && now) {
    return (
      <LockedIn
        pick={toLocalPick(party.matchedCard)}
        now={now}
        partyMatch
        partySize={party.members.length || 2}
        allergyNote={dietary.allergies.length > 0}
        onClose={() => {
          setResultSeen(false);
          party.dismissMatch();
        }}
      />
    );
  }
  if (locked && now) {
    return (
      <LockedIn
        pick={approxNow ? { ...locked, travelUnknown: true } : locked}
        startWithOrder={lockedOrder}
        decided={decided ?? undefined}
        onRememberChange={() => setWinsCount(readWins().length)}
        now={now}
        allergyNote={dietary.allergies.length > 0}
        allergies={dietary.allergies}
        onAllergiesChange={(allergies) => {
          allergiesChanged.current = true;
          updateDiet((d) => ({ ...d, allergies }));
        }}
        onDecideTogether={() => {
          setLocked(null);
          void startParty();
        }}
        onClose={() => {
          setLocked(null);
          // Allergies added on the way out apply to the picks they come back to.
          if (allergiesChanged.current) {
            allergiesChanged.current = false;
            setNotice("Picks updated to fit what you eat.");
            load(mood);
          }
        }}
      />
    );
  }

  if (joinCode && !inParty) {
    return (
      <main className="mx-auto flex h-dvh max-w-md flex-col bg-ink text-white">
        <TopBar demo={feedMode === "demo"} items={[]} />
        <JoinScreen code={joinCode} busy={partyBusy} error={partyError} onRetry={() => void joinParty()} onSolo={clearHash} />
      </main>
    );
  }

  const outOfPicks = !inParty && feed.status === "ready" && !current && !refilling;

  // Where the search is centered, for the line under the moods. Demo places have no real area.
  const searchArea =
    lastMeta && lastMeta.areaSource !== "demo"
      ? {
          label: lastMeta.areaSource === "device" ? "you" : (lastMeta.areaLabel ?? "you"),
          approx: lastMeta.areaSource === "ip",
          farther: lastMeta.mode === "drive" ? reachAt(lastMeta.reach ?? 1).label : null,
        }
      : null;

  const emptyActions: EmptyActions = {
    onClearCraving: craving ? clearCraving : undefined,
    onWiden: outOfPicks && feedMode === "walk" && !widened ? searchWider : undefined,
    moods: craving
      ? []
      : MOODS.filter((m) => m !== mood)
          .slice(0, 3)
          .map((m) => ({ label: NUDGE_LABEL[m], onClick: () => nudgeMood(m) })),
  };
  const shownNotice = party.ended ? "That party has ended. Back to solo picks." : notice;
  const steering = tuneOpen;
  // In a party a nudge goes to the whole group (as a mood word only); everything else is solo.
  const partyNudge = (m: Mood) => {
    settleNudge();
    void party.steerTo(m).catch(() => setNotice("Couldn't reach the group. Try again."));
  };

  /** "I'm done" (or "Keep voting"): finished, even with places left; the result shows once everyone is. */
  const setDone = (done: boolean) => {
    void party.finish(done).catch(() => setNotice("Couldn't reach the group. Try again."));
    setNotice(done ? "You're done. The result shows once everyone's finished." : "Back to voting.");
  };
  const reveal = () =>
    void party.reveal().catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Couldn't reveal. Try again."));

  // "Not quite?" answers. Each closes the row; skipping twice more brings it back.
  const settleNudge = (wait = 0) => {
    setTuneOpen(false);
    setSteerHint(null);
    skipsSinceNudge.current = -wait;
  };
  const nudgeMood = (m: Mood) => {
    settleNudge();
    setMoodChosen(true);
    haptic(12);
    setWash((w) => ({ key: (w?.key ?? 0) + 1, mood: m }));
    setNotice(`${NUDGE_LABEL[m]} it is. New picks on the way.`);
    if (m === mood) load(m);
    else changeMood(m);
  };
  const cantEat = () => {
    if (!current) return;
    setDietSuggest(cantEatHints(current));
    settleNudge();
    soloSkip();
    openDiet();
  };
  const takeHint = () => {
    if (!steerHint) return;
    if (steerHint.kind === "mood") nudgeMood(steerHint.mood);
    else {
      settleNudge();
      onWildcardTap();
    }
  };
  const openArea = () => {
    settleNudge();
    setReceiptOpen(false);
    setAreaOpen(true);
  };

  const dietCount = dietary.diets.length + dietary.allergies.length;
  const menu: MenuItem[] = [
    {
      label: "What I eat",
      detail: dietaryBadge(dietary) ?? "nothing set",
      count: dietCount,
      icon: <UtensilsIcon size={18} />,
      onSelect: () => {
        setDietSuggest(null);
        openDiet();
      },
    },
    ...(inParty && !party.hasHost
      ? []
      : [{ label: inParty ? "Request something different" : "Steer the picks", icon: <SlidersIcon size={18} />, onSelect: () => setTuneOpen(true) }]),
    ...(inParty ? [] : [{ label: "Change area", icon: <PinIcon size={18} />, onSelect: openArea }]),
    { label: inParty ? "Invite friends" : "Hunt together", icon: <PartyIcon size={18} />, onSelect: onPartyButton },
    { label: "What we sent", icon: <LockIcon size={18} />, onSelect: toggleReceipt },
    ...(winsCount > 0
      ? [
          {
            label: "Forget remembered places",
            detail: `${winsCount} saved on this device`,
            icon: <RewindIcon size={18} />,
            onSelect: () => {
              forgetAllWins();
              setWinsCount(0);
              setReturningId(null);
              setNotice("Forgotten. No places are remembered on this device.");
            },
          },
        ]
      : []),
  ];

  return (
    <main className="relative mx-auto flex h-dvh max-w-md flex-col bg-ink text-white">
      <TopBar
        demo={feedMode === "demo"}
        // In a group everything else lives in Wishes and the party bar: up here, just what we sent.
        items={inParty ? [] : menu}
        badge={dietCount}
        action={
          inParty ? (
            <button
              type="button"
              onClick={toggleReceipt}
              aria-expanded={receiptOpen}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-semibold text-white hover:bg-white/15"
            >
              <LockIcon size={16} className="text-teal-bright" />
              What we sent
            </button>
          ) : (
            <>
            {savedList.length > 0 && (
              <button
                type="button"
                onClick={() => setMaybesOpen(true)}
                aria-label={`Saved places (${savedList.length})`}
                className="inline-flex h-11 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-semibold whitespace-nowrap text-white hover:bg-white/15"
              >
                <span aria-hidden="true" className="text-star">
                  ☆
                </span>
                <span className="hidden min-[430px]:inline">Saved</span> {savedList.length}
              </button>
            )}
            {/* The group hunt is the headline feature, so it gets a visible button, not a menu entry. */}
            <button
              type="button"
              onClick={onPartyButton}
              disabled={partyBusy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-social/25 px-3.5 text-sm font-semibold whitespace-nowrap text-social-bright transition hover:bg-social/35 disabled:opacity-60"
            >
              <PartyIcon size={18} className="hidden shrink-0 min-[360px]:block" />
              {partyBusy ? "Opening…" : "Hunt together"}
            </button>
            </>
          )
        }
      />
      {dietOpen && (
        // A sheet over the content (not pushing it) so the card never squeezes into the buttons.
        <div className="relative z-40 h-0">
          <button type="button" aria-label="Close what you eat" tabIndex={-1} onClick={closeDiet} className="fixed inset-0 -z-10 cursor-default bg-black/55" />
        <DietPanel
          suggested={dietSuggest ?? undefined}
          dietary={dietary}
          remembered={dietRemembered}
          onChange={updateDiet}
          onRemember={setRemember}
          onForget={() => {
            forgetDiet();
            setNotice("Forgotten. Nothing about what you eat is stored on this device.");
          }}
          onClose={closeDiet}
        />
        </div>
      )}
      {inviteOpen && inParty && party.code && (
        <div className="relative z-40 h-0">
          <button type="button" aria-label="Close invite" tabIndex={-1} onClick={() => setInviteOpen(false)} className="fixed inset-0 -z-10 cursor-default bg-black/55" />
          <InviteSheet
            code={party.code}
            link={partyLink(party.code)}
            nickname={party.nickname}
            memberCount={party.members.length}
            onShare={shareParty}
            onRename={(name) => party.rename(name).catch(() => setNotice("Couldn't rename. Try again."))}
            onClose={() => {
              setInviteOpen(false);
              if (party.members.length <= 1 && pIndex === 0) setNotice(PARTY_COACH);
              if (party.isHost && !askedWishes) {
                setAskedWishes(true);
                if (hostWish.price !== null || hostWish.reach !== null || hostWish.crave.length > 0) saveWishes(hostWish);
              }
            }}
          >
            {/* Starting a group is one sheet: the host's own wishes go right here. */}
            {party.isHost && !askedWishes && now && (
              <div className="border-t border-white/10 pt-3">
                <p className="mb-2 text-sm font-semibold">What would work for you? <span className="font-normal text-white/60">Optional, and nobody sees whose.</span></p>
                <WishesForm value={hostWish} onChange={setHostWish} cravings={cravingShortcuts(mealFrame(now), dietary.diets)} compact />
              </div>
            )}
          </InviteSheet>
        </div>
      )}
      {wishesOpen && inParty && now && (
        <WishesSheet cravings={cravingShortcuts(mealFrame(now), dietary.diets)} initial={myWish} onSave={saveWishes} onSkip={() => setWishesOpen(false)}>
          {/* Everything about what you want, in one place: what you eat, and asking the group for something different. */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => {
                setWishesOpen(false);
                setDietSuggest(null);
                openDiet();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-white/8 px-3 text-left font-semibold hover:bg-white/12"
            >
              <UtensilsIcon size={18} className="shrink-0 text-white/70" />
              <span className="flex-1">
                What I eat
                <span className="block text-sm font-normal text-white/60">{dietaryBadge(dietary) ?? `Diets and allergies. ${KEPT_HERE}`}</span>
              </span>
              <span aria-hidden="true" className="text-white/50">
                ›
              </span>
            </button>
            {party.hasHost && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold text-white/80">
                  Ask the group for something different <span className="font-normal text-white/55">(adds a few places)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setWishesOpen(false);
                        partyNudge(m);
                      }}
                      className="h-10 rounded-full bg-white/10 px-3.5 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-95"
                    >
                      {NUDGE_LABEL[m]}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </WishesSheet>
      )}
      {lovedCard && inParty && !party.matchedCard && (
        <EveryoneLoves
          name={lovedCard.name}
          onStop={() => {
            void party.stopAt(lovedCard.id).catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Couldn't reach the group. Try again."));
          }}
          onKeep={() => setKeptVoting((k) => [...k, lovedCard.id])}
        />
      )}
      {inParty && party.code && party.memberId ? (
        <PartyBar
          code={party.code}
          members={party.members}
          meId={party.memberId}
          onInvite={() => setInviteOpen(true)}
          onLeave={leaveParty}
          onWishes={() => setWishesOpen(true)}
          onAdd={() => setComposing(true)}
          wishes={party.wishes.count > 0 ? wishLine(party.wishes) : undefined}
          done={votableCount > 0 ? doneCount : undefined}
          iAmDone={party.iAmDone}
          onDone={setDone}
        />
      ) : (
        <>
          <SearchContext area={searchArea} craving={craving} onChangeArea={openArea} onClearCraving={clearCraving} onUseLocation={() => void shareMyLocation()} />
        </>
      )}

      <div
        id="picks-panel"
        className="relative flex min-h-0 flex-1 flex-col"
      >
      {/*
        Floats over the top of the photo so nothing below moves: "Back" on the left whenever
        there's a pick to return to, and notices on the right (in place of the swipe badge).
      */}
      {/*
        One layer over the top of the photo, so nothing below ever moves: "Not quite?" (when
        steering is offered), then "Back" on the left whenever there's a pick to return to,
        and notices on the right (in place of the swipe badge), under the row if it's open.
      */}
      {wash && (
        <div
          key={wash.key}
          aria-hidden="true"
          onAnimationEnd={() => setWash(null)}
          className="animate-wash pointer-events-none absolute inset-0 z-10"
          style={{ background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${WASH[wash.mood]} 40%, transparent), transparent 70%)` }}
        />
      )}
      {!receiptOpen && !areaOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-3">
          {steering && (
            <div className="pointer-events-auto">
              <NotQuite
                mood={mood}
                moodChosen={moodChosen && !inParty}
                group={inParty}
                onMood={inParty ? partyNudge : nudgeMood}
                onSurprise={
                  inParty
                    ? undefined
                    : () => {
                        settleNudge();
                        onWildcardTap();
                      }
                }
                onClose={() => settleNudge(1)}
              />
            </div>
          )}
          <div className="flex items-start gap-2">
            <div aria-live="polite" className="ml-auto flex min-w-0 justify-end">
              {voice.listening ? (
                <p className="animate-rise rounded-2xl bg-paprika/90 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md">
                  {voice.interim ? `“${voice.interim}”` : "Listening… let go when you're done"}
                </p>
              ) : (
                shownNotice && (
                  <p className="animate-rise rounded-2xl bg-black/70 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-md">{shownNotice}</p>
                )
              )}
            </div>
          </div>
          {/* One short tip at a time, on one line, so the photo stays visible. */}
          {showTips && (
            <div
              key={tipStep}
              className="animate-rise pointer-events-auto flex min-h-11 items-center gap-1 self-center rounded-full bg-black/70 py-1 pr-1 pl-4 text-sm text-white shadow-lg backdrop-blur-md"
              role="note"
              aria-label={`Tip ${tipStep + 1} of ${TIPS.length}`}
            >
              <span className="min-w-0">{TIPS[tipStep]}</span>
              <button
                type="button"
                onClick={() => (tipStep + 1 < TIPS.length ? setTipStep(tipStep + 1) : dismissTips())}
                className="h-9 shrink-0 rounded-full px-3 font-semibold text-teal-bright hover:bg-white/10"
              >
                {tipStep + 1 < TIPS.length ? "Next" : "Got it"}
              </button>
              {tipStep + 1 < TIPS.length && (
                <button type="button" onClick={dismissTips} aria-label="Hide tips" className="grid size-9 shrink-0 place-items-center rounded-full text-white/60 hover:text-white">
                  <XIcon size={14} />
                </button>
              )}
            </div>
          )}
          {/* One guess, small and out of the way; never while someone is reading the details. */}
          {steerHint && !steering && !inParty && current && expandedId !== current.id && (
            <div className="animate-rise pointer-events-auto inline-flex h-11 items-center self-start rounded-full bg-black/60 text-sm font-semibold text-white shadow-lg backdrop-blur-md">
              <button type="button" onClick={takeHint} className="inline-flex h-11 items-center gap-1.5 rounded-full pr-2.5 pl-3.5 transition hover:bg-white/10 active:scale-95">
                <span className="font-medium text-white/60">Not quite?</span> {steerHint.text}
              </button>
              <span aria-hidden="true" className="h-5 w-px bg-white/20" />
              <button
                type="button"
                onClick={() => {
                  setSteerHint(null);
                  setTuneOpen(true);
                }}
                aria-label="More ways to steer the picks"
                className="grid size-11 place-items-center rounded-full text-white/70 transition hover:text-white"
              >
                <SlidersIcon size={16} />
              </button>
            </div>
          )}
        </div>
      )}
      {receiptOpen ? (
        <PrivacyReceipt sent={lastSent} meta={lastMeta} precise={precise} inParty={inParty} onClose={() => setReceiptOpen(false)} />
      ) : inParty ? (
        adding ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-full bg-white/10 py-1 pr-1 pl-4 text-sm">
              <span className="min-w-0 flex-1 truncate text-white/80">
                Adding to the vote: <span className="font-semibold text-white">“{adding.query}”</span>
              </span>
              <button type="button" onClick={stopAdding} className="h-11 shrink-0 rounded-full bg-white px-4 font-semibold text-ink">
                Done
              </button>
            </div>
            {addingCurrent && now ? (
              <PickCard
                pick={addingCurrent}
                now={now}
                quietBadge={Boolean(shownNotice)}
                expanded={expandedId === addingCurrent.id}
                onExpand={() => setExpandedId(addingCurrent.id)}
                onNext={next}
                onBack={goBack}
                hasBack={canGoBack}
                onPull={pullGo}
                pullAction="add"
                enterFrom={enterFrom}
              />
            ) : adding.loading ? (
              <PickSkeleton />
            ) : (
              <section className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <p className="font-display text-2xl font-bold">
                  {adding.picks.length > 0 ? `That's every “${adding.query}” place we found.` : `Nothing open for “${adding.query}” nearby.`}
                </p>
                <button type="button" onClick={() => setComposing(true)} className="h-12 w-full rounded-full bg-social px-6 font-semibold text-white">
                  Search for something else
                </button>
                <button type="button" onClick={stopAdding} className="h-12 w-full rounded-full bg-white/12 px-6 font-semibold text-white">
                  Back to the vote
                </button>
              </section>
            )}
          </div>
        ) : partyCurrent && now && !party.iAmDone ? (
          <PickCard
            pick={partyCurrent}
            now={now}
            quietBadge={Boolean(shownNotice)}
            answer={party.myAnswers[partyCurrent.id] ?? null}
            fitsGroup={fitsWishes(partyCurrent, party.wishes)}
            onNext={next}
            onBack={goBack}
            onMaybe={partyMaybe}
            isLater={pLater.includes(partyCurrent.id)}
                hasBack={canGoBack}
            onPull={pullGo}
            pullAction="vote"
            enterFrom={enterFrom}
            onCantEat={() => cantEatInParty(partyCurrent.id)}
            fitNote={now ? fitNote(partyCurrent, dietary, partyCurrent.travelUnknown ? null : partyCurrent.walkMinutes, now) : null}
            expanded={expandedId === partyCurrent.id}
            onExpand={() => setExpandedId(partyCurrent.id)}
          />
        ) : (
          <PartyEndOfList
            done={doneCount}
            total={party.members.length}
            quit={party.iAmDone}
            maybes={party.iAmDone ? 0 : pendingLaters.length}
            onReviewMaybes={reviewLaters}
            onKeepVoting={() => setDone(false)}
            onSearch={() => setComposing(true)}
            onStartOver={() => {
              if (party.iAmDone) setDone(false);
              setPIndex(0);
              setPHistory([]);
            }}
            onReveal={reveal}
          />
        )
      ) : (
        areaOpen ? (
          <LocationPrompt onSubmit={submitArea} onUseLocation={shareMyLocation} onCancel={() => setAreaOpen(false)} />
        ) : (
        <>
      {(feed.status === "loading" || (feed.status === "ready" && !current && refilling)) && <PickSkeleton />}
      {feed.status === "need_location" && <LocationPrompt onSubmit={submitArea} onUseLocation={shareMyLocation} />}
      {feed.status === "error" && <ErrorState message={feed.message} onRetry={() => load(mood)} />}
      {feed.status === "empty" && (
        <EmptyState message={feed.message} suggestion={feed.suggestion} onRetry={() => load(mood)} actions={emptyActions} />
      )}
      {outOfPicks && (
        <EmptyState
          message={
            craving
              ? `That's every “${craving}” place open ${widened || feedMode === "drive" ? "within a short drive" : "nearby"}.`
              : `That's every ${MOOD_LABELS[mood].toLowerCase()} pick open ${widened || feedMode === "drive" ? "within a short drive" : "nearby"}.`
          }
          suggestion={feedMode === "walk" ? "drive" : "order_in"}
          onRetry={() => load(mood)}
          actions={emptyActions}
        />
      )}
      {current && now && (
        <PickCard
          pick={current}
          now={now}
          quietBadge={Boolean(shownNotice || voice.listening)}
          onNext={lessLike}
          onBack={() => toggleMaybe({ swiped: true })}
          onMaybe={toggleLater}
          isLater={isLater}
          approx={approxNow && searchArea ? { area: searchArea.label, onUseLocation: () => void shareMyLocation() } : undefined}
          likeSwipes
          onPull={pullGo}
          pullAction="go"
          enterFrom={enterFrom}
          photoNow={swipes === 0}
          isMaybe={isMaybe}
          bow={bow}
          onTangent={submitCraving}
          expanded={expandedId === current.id}
          onExpand={() => setExpandedId(current.id)}
          hint={!hinted && swipes === 0}
          returning={current.id === returningId}
          onHinted={() => setHinted(true)}
          onCantEatHere={cantEat}
        />
      )}
        </>
        )
      )}
      </div>

      {goMenu && current && !inParty && (
        <GoMenu
          pick={approxNow ? { ...current, travelUnknown: true } : current}
          onClose={() => setGoMenu(false)}
          onChoose={(target) => {
            setGoMenu(false);
            soloGo(target);
          }}
        />
      )}
      {/* Searching: everything but the search fades back, so it's just the box, the ideas and the button. */}
      {composing && (
        <button
          type="button"
          aria-label="Close search"
          tabIndex={-1}
          onClick={() => setComposing(false)}
          className="animate-fade absolute inset-0 z-[45] cursor-default bg-ink/85 backdrop-blur-[2px]"
        />
      )}
      {composing && (
        <p className="animate-rise relative z-50 px-5 pb-2 font-display text-2xl font-bold">{inParty ? "Find a place to add" : "What sounds good?"}</p>
      )}
      {composing && now && (
        <div className="animate-rise relative z-50 flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]" role="group" aria-label="Quick cravings">
          {cravingShortcuts(mealFrame(now), dietary.diets).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => submitCraving(c)}
              className="h-11 shrink-0 rounded-full bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/15"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {composing && (
        <form
          className="animate-rise relative z-50 flex gap-2 px-4 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitCraving(draft);
          }}
        >
          <label htmlFor="craving" className="sr-only">
            What are you craving?
          </label>
          <input
            id="craving"
            autoFocus
            value={draft}
            maxLength={140}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setComposing(false)}
            placeholder={inParty ? "Find a place to add, e.g. ramen" : "Craving something? e.g. warm noodles"}
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white placeholder:text-white/50"
          />
          <button type="submit" className="h-12 rounded-full bg-white px-5 font-semibold text-ink">
            Find
          </button>
        </form>
      )}

      {maybesOpen && !inParty && savedList.length > 0 && (
        <SavedSheet saved={savedList} onOpen={openMaybe} onRemove={removeMaybe} onClose={() => setMaybesOpen(false)} />
      )}
      {/* Back, always bottom-left; Let's go and the liked list (solo), or where you are and Skip (group), beside it. */}
      <NavRow
        hidden={composing || receiptOpen || !(adding ? addingCurrent : shown)}
        canBack={canGoBack}
        onBack={goBack}
        compactBack={inParty && !adding}
        center={
          adding ? (
            <span className="text-sm text-white/60">
              {adding.at + 1} of {adding.picks.length}
            </span>
          ) : inParty ? (
            // My answers so far, as the same symbols as the buttons, and how many places are left to see.
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-2.5 py-1.5 text-sm whitespace-nowrap text-white/80 tabular-nums"
              aria-label={`Your answers: ${myTally.love} love it, ${myTally.ok} OK, ${myTally.no} not for me${pendingLaters.length > 0 ? `, ${pendingLaters.length} maybe` : ""}. ${myTally.left} left to see.`}
            >
              {/* Only the symbols used so far, so it stays one short line. */}
              {myTally.love > 0 && <span aria-hidden="true" className="text-social-bright">♥{myTally.love}</span>}
              {myTally.ok > 0 && <span aria-hidden="true">👍{myTally.ok}</span>}
              {myTally.no > 0 && <span aria-hidden="true" className="text-white/60">✕{myTally.no}</span>}
              {pendingLaters.length > 0 && (
                <span aria-hidden="true" className="text-star">
                  ☆{pendingLaters.length}
                </span>
              )}
              <span aria-hidden="true" className="font-semibold text-white">{myTally.left} left</span>
            </span>
          ) : current ? (
            <BowButton
              bow={bow}
              label="Let's go"
              aria={`Let's go: ${current.travelMode === "drive" ? "drive" : "walk"} to ${current.name}. Tap for choices, or hold and slide to aim.`}
              icon={current.travelMode === "drive" ? <CarIcon size={20} /> : <WalkIcon size={20} />}
              disabled={receiptOpen}
              onTap={() => setGoMenu(true)}
              onShoot={shoot}
            />
          ) : null
        }
        right={
          adding ? null : inParty ? (
            partyCurrent && <MaybeButton on={pLater.includes(partyCurrent.id)} name={partyCurrent.name} group onClick={partyMaybe} />
          ) : current ? (
            <MaybeButton on={isLater} name={current.name} onClick={toggleLater} />
          ) : null
        }
      />
      <Controls
        searching={composing}
        disabled={!(adding ? addingCurrent : shown) || receiptOpen}
        next={
          adding
            ? addingCurrent
              ? { label: "Next", onClick: next }
              : undefined
            : inParty
              ? shown
                ? { label: "Next", onClick: next }
                : undefined
              : current
                ? { label: "Less like this", aria: `Less like this: skip ${current.name} and see fewer like it`, onClick: lessLike, icon: <span aria-hidden="true">👎</span> }
                : undefined
        }
        answer={
          inParty && !adding && partyCurrent ? { value: party.myAnswers[partyCurrent.id] ?? null, onAnswer: partyAnswer, place: partyCurrent.name } : undefined
        }
        primary={
          adding
            ? addingCurrent
              ? { label: "Add", aria: `Add ${addingCurrent.name} to the group's vote`, onClick: () => void addToVote(), tone: "add", icon: <HeartIcon size={20} /> }
              : undefined
            : inParty
              ? undefined
              : current
                ? {
                    label: isMaybe ? "Liked" : "More like this",
                    aria: isMaybe ? `You liked ${current.name}. Tap to take it off` : `More like this: like ${current.name}, save it for later and see more like it`,
                    onClick: () => toggleMaybe(),
                    tone: isMaybe ? "liked" : "like",
                    pressed: isMaybe,
                    icon: <span aria-hidden="true">👍</span>,
                  }
                : undefined
        }
        group={inParty}
        listening={voice.listening}
        timeLeft={inParty ? 1 : timer.fraction}
        minutesLeft={Math.ceil(timer.remainingMs / 60000)}
        onType={() => setComposing((c) => !c)}
        onHoldStart={() => {
          voice.prime();
          void voice.start();
        }}
        onHoldEnd={voice.stop}
      />
      <div className="flex justify-center px-3 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          onClick={toggleReceipt}
          aria-expanded={receiptOpen}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-xs text-white/60 hover:text-white/85"
        >
          <LockIcon size={12} className="text-teal-bright" />
          {inParty ? PARTY_KEPT : KEPT_HERE}
          <span className="font-semibold text-teal-bright">What we sent</span>
        </button>
      </div>
    </main>
  );
}

/** ☆ Maybe: save it for later and move on (solo), or come back to it before you're done (in a group). Tap again to take it off. */
function MaybeButton({ on, name, group, onClick }: { on: boolean; name: string; group?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={
        on
          ? `${name} is a maybe. Tap to take it off`
          : group
            ? `Maybe: come back to ${name} before you're done (no answer yet)`
            : `Maybe: save ${name} for later and see another`
      }
      className={`${navPill} ${on ? "bg-star/20 text-star" : "bg-white/10 text-white hover:bg-white/15"}`}
    >
      <span aria-hidden="true">{on ? "★" : "☆"}</span> Maybe
    </button>
  );
}
