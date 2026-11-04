"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MOODS, MOOD_LABELS, type FeedMode, type Mood, type PartyCard, type Pick, type PicksEvent } from "@/lib/types";
import { requestPreciseLocation, roundCoords, streamPicks, walkMinutesOnDevice, type PicksQuery, type SentRequest } from "@/lib/api";
import { applySignals, cantEatHints, skipSignals } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { cravingShortcuts } from "@/lib/cravings";
import { mealFrame } from "@/lib/time";
import { useSwipe } from "@/hooks/useSwipe";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { requestMotionPermission, useShake } from "@/hooks/useShake";
import { useVoice, type VoiceFallback } from "@/hooks/useVoice";
import { TopBar, type MenuItem } from "./TopBar";
import { NUDGE_LABEL, NotQuite } from "./NotQuite";
import { PickCard, PickSkeleton } from "./PickCard";
import { Controls } from "./Controls";
import { LockedIn } from "./LockedIn";
import { EmptyState, ErrorState, LocationPrompt, type EmptyActions } from "./FeedStates";
import { SearchContext } from "./SearchContext";
import { codeFromHash, partyLink, toPartyCard, useParty } from "@/hooks/useParty";
import { InviteSheet, JoinScreen, PartyBar, PartyResults, PartyWaiting } from "./Party";
import { DietPanel } from "./DietPanel";
import { PrivacyReceipt } from "./PrivacyReceipt";
import { LockIcon, PartyIcon, PinIcon, RewindIcon, SlidersIcon, UtensilsIcon } from "./Icons";
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
/** Lingering this long on a pick opens its details: interest earns more detail. */
const DWELL_MS = 4000;
/** Skips in a row before "Not quite?" offers to steer. */
const SKIPS_BEFORE_NUDGE = 2;
const PARTY_COACH = "Vote for the places you'd go, or Pass. Votes stay secret until the reveal.";
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
  const [notice, setNotice] = useState<string | null>(null);
  /** The active craving: it drives the search (and every refill) until cleared. Memory only. */
  const [craving, setCraving] = useState<string | null>(null);
  /** The user asked to search a short drive away. Reset when the area changes. */
  const [widened, setWidened] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  // Start simple: no mood picker, no details. "Not quite?" appears after a couple of skips,
  // and a pick's details open when the person asks or lingers on it.
  const [tuneOpen, setTuneOpen] = useState(false);
  const [moodChosen, setMoodChosen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** "Can't eat this": what the skipped pick hints at, offered first in the sheet. */
  const [dietSuggest, setDietSuggest] = useState<{ diets: string[]; allergies: string[] } | null>(null);
  const skipsSinceNudge = useRef(0);
  const allergiesChanged = useRef(false);
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
  const widenRef = useRef(false);
  const firstOfSession = useRef(true);
  const inflight = useRef<AbortController | null>(null);
  const skipped = useRef<Pick[]>([]);
  const exhausted = useRef(new Set<Mood>());
  const motionAsked = useRef(false);
  const voiceNoticeShown = useRef(new Set<VoiceFallback>());
  // Precise location as state too, so party cards can show on-device walk times when rendering.
  const [precise, setPrecise] = useState<{ lat: number; lng: number } | null>(null);

  // Hunt party (rooms live 10 minutes on the server; everything here is memory only).
  const party = useParty();
  const joinCode = useSyncExternalStore(subscribeHash, codeFromHash, () => null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [pIndex, setPIndex] = useState(0);
  const [pHistory, setPHistory] = useState<number[]>([]);
  const [hostExtra, setHostExtra] = useState<Pick[]>([]);
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
      dietary: hasDietary(dietRef.current) ? dietRef.current : null,
      craving: cravingRef.current,
      ...(widenRef.current ? { widen: true } : {}),
    }),
    [dietRef],
  );

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
          case "meta":
            setFeedMode(e.mode);
            setLastMeta(e);
            if (e.sparse && !opts.append) setNotice("Not much open within walking distance, so these are a short drive.");
            if (e.cravingMatched === false && !opts.append && cravingRef.current) {
              setNotice(`Nothing for “${cravingRef.current}” open nearby, so here’s what is.`);
            }
            break;
          case "pick":
            got++;
            firstOfSession.current = false;
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
            if (got === 0) {
              setFeed((f) => (opts.append && f.status === "ready" ? f : { status: "empty", message: e.message, suggestion: e.suggestion }));
            }
            break;
          case "error":
            if (got === 0) setFeed((f) => (opts.append && f.status === "ready" ? f : { status: "error", message: e.message }));
            break;
          case "done":
            if (opts.append && got === 0) exhausted.current.add(m);
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
    [baseQuery],
  );

  const load = useCallback(
    (m: Mood, extra: Partial<PicksQuery> = {}) => {
      exhausted.current.delete(m);
      setQueue([]);
      setIndex(0);
      setHistory([]);
      setFeed({ status: "loading" });
      fetchQueue(m, skipSignals(skipped.current), { append: false, extra });
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

  const soloSkip = useCallback(() => {
    if (!current) return;
    skipped.current = [...skipped.current, current];
    const next = skipSignals(skipped.current);
    const fresh = next.filter((s) => !signals.includes(s));
    if (fresh.length > 0) {
      // Reorder what's left right away so the signal feels instant; the next refill sends it to the ranker.
      setQueue((q) => [...q.slice(0, index + 1), ...applySignals(q.slice(index + 1), next)]);
      setSignals(next);
      setNotice(`Got it: ${fresh[0]}.`);
    }
    setHistory((h) => [...h, index]);
    setIndex((i) => i + 1);
    setSwipes((s) => s + 1);
    skipsSinceNudge.current += 1;
    if (skipsSinceNudge.current >= SKIPS_BEFORE_NUDGE) setTuneOpen(true);

    // Refill quietly in the background when the queue runs low, carrying this session's signals.
    const left = queue.length - (index + 1);
    if (left <= REFILL_AT && !refilling && !exhausted.current.has(mood)) {
      const exclude = [...queue.map((p) => p.id), ...skipped.current.map((p) => p.id)];
      setRefilling(true);
      fetchQueue(mood, next, { append: true, extra: { exclude } });
    }
  }, [current, index, signals, queue, refilling, mood, fetchQueue]);

  const soloGo = useCallback(() => {
    if (!current) return;
    haptic(18);
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
  }, [current]);

  const soloRewind = useCallback(() => {
    if (history.length === 0) return;
    const back = history[history.length - 1];
    const pick = queue[back];
    if (pick) skipped.current = skipped.current.filter((p) => p.id !== pick.id);
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
    const exclude = [...fit.map((p) => p.id), ...skipped.current.map((p) => p.id)];
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
      { ...baseQuery(wildMood, signals), craving: null, exclude: [...queue.map((p) => p.id), ...skipped.current.map((p) => p.id)] },
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

  const useMyLocation = async () => {
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
    setNotice("Rounded to ~1 km before it left your phone.");
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
    setComposing(false);
    voice.cancel();
    skipped.current = [];
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
  const partyCurrent = party.active ? (partyPicks[pIndex] ?? null) : null;

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
        setHostExtra((x) => [...x, ...got]);
        return party.addCards(got.map(toPartyCard));
      })
      .catch(() => {})
      .finally(() => {
        hostRefilling.current = false;
      });
  }, [baseQuery, mood, signals, party]);

  const partySwipe = (dir: "go" | "skip") => {
    if (!partyCurrent) return;
    party.swipe(partyCurrent.id, dir);
    if (dir === "go") {
      haptic(12);
      setNotice(party.members.length > 1 ? "Voted. Votes stay secret until the reveal." : "Voted. Invite friends to vote too.");
    }
    setPHistory((h) => [...h, pIndex]);
    setPIndex((i) => i + 1);
    setSwipes((s) => s + 1);
    // Passing is normal in a vote, not a sign of being stuck, so the group's "Not quite?"
    // opens only from Request (or ⋯ → Request something different).
    // The ballot is the deck the party started with (plus cards from a group nudge), so
    // everyone can finish it and reveal. No endless refills mid-vote.
  };

  const partyRewind = () => {
    if (pHistory.length === 0) return;
    setPIndex(pHistory[pHistory.length - 1]);
    setPHistory(pHistory.slice(0, -1));
  };

  /** One tap: open the room with the picks in hand, then show the invite (QR, link, share). */
  const startParty = async () => {
    const cards = queue.slice(index).map(toPartyCard);
    if (cards.length === 0) {
      setNotice("Wait for a pick to load, then start hunting together.");
      return;
    }
    setPartyBusy(true);
    setPartyError(null);
    try {
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

  const leaveParty = () => {
    party.leave();
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
  const skip = inParty ? () => partySwipe("skip") : soloSkip;
  const go = inParty ? () => partySwipe("go") : soloGo;
  const rewind = inParty ? partyRewind : soloRewind;
  const shown = inParty ? partyCurrent : current;
  const canGoBack = inParty ? pHistory.length > 0 : history.length > 0;

  // The locked-in pick is never cut off by the idle timer.
  // Party rooms have their own hard 10-minute clock, so the idle timer pauses in a party too.
  const timer = useInactivityTimer(IDLE_MS, onIdle, Boolean(locked) || inParty || Boolean(party.matchedCard));
  const swipe = useSwipe({ onLeft: skip, onRight: go, disabled: !shown });

  // Keyboard: ← skip, → go, Backspace rewind (solo or party, whichever is active).
  const keyActions = useRef({ skip, go, rewind });
  useEffect(() => {
    keyActions.current = { skip, go, rewind };
  });
  useEffect(() => {
    if (locked || composing || receiptOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [role=tablist]")) return;
      if (e.key === "ArrowLeft") keyActions.current.skip();
      else if (e.key === "ArrowRight") keyActions.current.go();
      else if (e.key === "Backspace") keyActions.current.rewind();
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
        pick={locked}
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
          drive: lastMeta.mode === "drive",
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

  const reveal = () =>
    void party.reveal().catch((e: unknown) => setNotice(e instanceof Error ? e.message : "Couldn't reveal. Try again."));

  // "Not quite?" answers. Each closes the row; skipping twice more brings it back.
  const settleNudge = (wait = 0) => {
    setTuneOpen(false);
    skipsSinceNudge.current = -wait;
  };
  const nudgeMood = (m: Mood) => {
    settleNudge();
    setMoodChosen(true);
    setNotice(`${NUDGE_LABEL[m]} it is.`);
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
  ];

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col bg-ink text-white">
      <TopBar
        demo={feedMode === "demo"}
        items={menu}
        badge={dietCount}
        action={
          inParty ? null : (
            // The group hunt is the headline feature, so it gets a visible button, not a menu entry.
            <button
              type="button"
              onClick={onPartyButton}
              disabled={partyBusy}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-social/25 px-3.5 text-sm font-semibold whitespace-nowrap text-social-bright transition hover:bg-social/35 disabled:opacity-60"
            >
              <PartyIcon size={18} className="hidden shrink-0 min-[360px]:block" />
              {partyBusy ? "Opening…" : "Hunt together"}
            </button>
          )
        }
      />
      {dietOpen && (
        // A sheet over the content (not pushing it) so the card never squeezes into the buttons.
        <div className="relative z-30 h-0">
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
        <div className="relative z-30 h-0">
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
            }}
          />
        </div>
      )}
      {inParty && party.code && party.memberId ? (
        <PartyBar
          code={party.code}
          expiresAt={party.expiresAt}
          members={party.members}
          progress={party.progress}
          meId={party.memberId}
          deckSize={party.deck.length}
          extended={party.extended}
          onInvite={() => setInviteOpen(true)}
          onLeave={leaveParty}
          onReveal={reveal}
          onRequest={party.hasHost ? () => setTuneOpen((o) => !o) : undefined}
          onExtend={() => void party.extend().then(() => setNotice("5 more minutes for everyone.")).catch(() => setNotice("Couldn't add time."))}
        />
      ) : (
        <>
          <SearchContext area={searchArea} craving={craving} onChangeArea={openArea} onClearCraving={clearCraving} />
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
                onCantEat={!inParty && current ? cantEat : undefined}
                onElsewhere={inParty ? undefined : openArea}
                onClose={() => settleNudge(1)}
                onBack={canGoBack ? rewind : undefined}
              />
            </div>
          )}
          <div className="flex items-start gap-2">
            {canGoBack && !steering && (
              <button
                type="button"
                onClick={rewind}
                aria-label="Back to the previous pick"
                className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-black/55 pr-3.5 pl-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-black/70 active:scale-95"
              >
                <RewindIcon size={16} />
                Back
              </button>
            )}
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
        </div>
      )}
      {receiptOpen ? (
        <PrivacyReceipt sent={lastSent} meta={lastMeta} precise={precise} inParty={inParty} onClose={() => setReceiptOpen(false)} />
      ) : inParty ? (
        partyCurrent && now ? (
          <PickCard
            pick={partyCurrent}
            now={now}
            swipes={swipes}
            swipe={swipe}
            quietBadge={Boolean(shownNotice)}
            voted={party.myVotes.includes(partyCurrent.id)}
            expanded={expandedId === partyCurrent.id}
            onExpand={() => setExpandedId(partyCurrent.id)}
          />
        ) : (
          <PartyWaiting members={party.members} progress={party.progress} deckSize={party.deck.length} meId={party.memberId ?? ""} onReveal={reveal} />
        )
      ) : (
        areaOpen ? (
          <LocationPrompt onSubmit={submitArea} onUseLocation={useMyLocation} onCancel={() => setAreaOpen(false)} />
        ) : (
        <>
      {(feed.status === "loading" || (feed.status === "ready" && !current && refilling)) && <PickSkeleton />}
      {feed.status === "need_location" && <LocationPrompt onSubmit={submitArea} onUseLocation={useMyLocation} />}
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
          swipes={swipes}
          swipe={swipe}
          quietBadge={Boolean(shownNotice || voice.listening)}
          onTangent={submitCraving}
          expanded={expandedId === current.id}
          onExpand={() => setExpandedId(current.id)}
        />
      )}
        </>
        )
      )}
      </div>

      {composing && now && (
        <div className="animate-rise flex gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]" role="group" aria-label="Quick cravings">
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
          className="animate-rise flex gap-2 px-4 pb-2"
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
            placeholder="Craving something? e.g. warm noodles"
            autoComplete="off"
            className="h-12 min-w-0 flex-1 rounded-full bg-white/10 px-4 text-base text-white placeholder:text-white/50"
          />
          <button type="submit" className="h-12 rounded-full bg-white px-5 font-semibold text-ink">
            Find
          </button>
        </form>
      )}

      <Controls
        travelMode={shown?.travelMode ?? "walk"}
        vote={inParty ? { done: Math.min(pIndex, party.deck.length), total: party.deck.length } : undefined}
        disabled={!shown || receiptOpen}
        listening={voice.listening}
        timeLeft={timer.fraction}
        minutesLeft={Math.ceil(timer.remainingMs / 60000)}
        onSkip={skip}
        onGo={go}
        onType={() => (inParty ? setNotice("Cravings are solo-only for now.") : setComposing((c) => !c))}
        onHoldStart={() => {
          if (inParty) return setNotice("Cravings are solo-only for now.");
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
          {inParty ? "Nothing kept after the party." : dietRemembered ? "Nothing saved by us." : "Nothing saved."}
          <span className="font-semibold text-teal-bright">What we sent</span>
        </button>
      </div>
    </main>
  );
}
