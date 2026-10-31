"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { MOODS, MOOD_LABELS, type FeedMode, type Mood, type PartyCard, type Pick, type PicksEvent } from "@/lib/types";
import { requestPreciseLocation, roundCoords, streamPicks, walkMinutesOnDevice, type PicksQuery } from "@/lib/api";
import { applySignals, skipSignals } from "@/lib/categories";
import { haptic } from "@/lib/haptics";
import { useSwipe } from "@/hooks/useSwipe";
import { useInactivityTimer } from "@/hooks/useInactivityTimer";
import { requestMotionPermission, useShake } from "@/hooks/useShake";
import { useVoice, type VoiceFallback } from "@/hooks/useVoice";
import { MoodTabs, TopBar } from "./TopBar";
import { PickCard, PickSkeleton } from "./PickCard";
import { Controls } from "./Controls";
import { LockedIn } from "./LockedIn";
import { EmptyState, ErrorState, LocationPrompt } from "./FeedStates";
import { codeFromHash, partyLink, toPartyCard, useParty } from "@/hooks/useParty";
import { JoinScreen, PartyBar, PartySetup } from "./Party";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
function clearHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

const IDLE_MS = 10 * 60 * 1000;
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
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [signals, setSignals] = useState<string[]>([]);
  const [refilling, setRefilling] = useState(false);

  // Session-only context, never persisted.
  const location = useRef<{ lat: number; lng: number } | null>(null);
  const preciseLocation = useRef<{ lat: number; lng: number } | null>(null);
  const areaQuery = useRef<string | null>(null);
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
  const [partySetup, setPartySetup] = useState(false);
  const [partyBusy, setPartyBusy] = useState(false);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [pIndex, setPIndex] = useState(0);
  const [pHistory, setPHistory] = useState<number[]>([]);
  const [hostExtra, setHostExtra] = useState<Pick[]>([]);
  const hostRefilling = useRef(false);

  const baseQuery = useCallback(
    (m: Mood, sig: string[]): PicksQuery => ({
      mood: m,
      location: location.current,
      areaQuery: areaQuery.current,
      firstOfSession: firstOfSession.current,
      skipSignals: sig,
    }),
    [],
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
            if (e.sparse && !opts.append) setNotice("Not much open within walking distance, so these are a short drive.");
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

      streamPicks({ ...baseQuery(m, sig), ...opts.extra }, onEvent, ctrl.signal)
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

  // Open straight onto a pick (server uses a city-level IP estimate if there's no location yet).
  useEffect(() => {
    fetchQueue("fresh", [], { append: false });
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
      { ...baseQuery(wildMood, signals), exclude: [...queue.map((p) => p.id), ...skipped.current.map((p) => p.id)] },
      (e) => {
        if (taken || e.type !== "pick") return;
        taken = true;
        ctrl.abort();
        haptic([10, 40, 10]);
        setQueue((q) => [...q.slice(0, index), e.pick, ...q.slice(index)]);
        setNotice(`Wildcard: something ${MOOD_LABELS[wildMood].toLowerCase()}`);
      },
      ctrl.signal,
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
      const craving = text.trim();
      if (!craving) return;
      setNotice(`Hunting: “${craving}”`);
      load(mood, { craving });
    },
    [load, mood],
  );

  const onVoiceFallback = useCallback((why: VoiceFallback) => {
    setComposing(true);
    if (!voiceNoticeShown.current.has(why)) {
      voiceNoticeShown.current.add(why);
      setNotice(VOICE_NOTICE[why]);
    }
  }, []);

  const voice = useVoice({ onFinal: submitCraving, onFallback: onVoiceFallback });

  const submitArea = (query: string) => {
    areaQuery.current = query.trim() || null;
    load(mood);
  };

  const useMyLocation = async () => {
    setFeed({ status: "loading" });
    const pos = await requestPreciseLocation();
    if (!pos) {
      setFeed({ status: "need_location" });
      setNotice("Location is off. Type a neighborhood or ZIP instead.");
      return;
    }
    preciseLocation.current = pos;
    location.current = roundCoords(pos.lat, pos.lng);
    setPrecise(pos);
    load(mood);
  };

  const onIdle = useCallback(() => {
    setSwipes(0);
    setComposing(false);
    voice.cancel();
    skipped.current = [];
    setSignals([]);
    load(mood);
    setNotice("Picks cleared after 10 quiet minutes.");
  }, [load, mood, voice]);

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

  /** Only the host has a location, so only the host's device fetches more cards for the room. */
  const hostRefill = useCallback(() => {
    if (hostRefilling.current) return;
    hostRefilling.current = true;
    const got: Pick[] = [];
    streamPicks(
      { ...baseQuery(mood, signals), exclude: party.deck.map((c) => c.id) },
      (e) => {
        if (e.type === "pick") got.push(e.pick);
      },
      new AbortController().signal,
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
      setNotice(party.members.length > 1 ? "You said go. Waiting on the others." : "You said go. Invite friends to match.");
    }
    setPHistory((h) => [...h, pIndex]);
    setPIndex((i) => i + 1);
    setSwipes((s) => s + 1);
    if (party.isHost && party.deck.length - (pIndex + 1) <= REFILL_AT) hostRefill();
  };

  const partyRewind = () => {
    if (pHistory.length === 0) return;
    setPIndex(pHistory[pHistory.length - 1]);
    setPHistory(pHistory.slice(0, -1));
  };

  const startParty = async (nickname: string) => {
    const cards = queue.slice(index).map(toPartyCard);
    if (cards.length === 0) {
      setPartyError("Wait for a pick to load first.");
      return;
    }
    setPartyBusy(true);
    setPartyError(null);
    try {
      const code = await party.create(nickname, cards);
      setPIndex(0);
      setPHistory([]);
      setPartySetup(false);
      setNow(new Date());
      setNotice(`Party ${code} is open. Tap Invite to bring friends.`);
    } catch (e) {
      setPartyError(e instanceof Error ? e.message : "Couldn't start a party.");
    } finally {
      setPartyBusy(false);
    }
  };

  const joinParty = async (nickname: string) => {
    if (!joinCode) return;
    setPartyBusy(true);
    setPartyError(null);
    try {
      await party.join(joinCode, nickname);
      setPIndex(0);
      setPHistory([]);
      setNow(new Date());
    } catch (e) {
      setPartyError(e instanceof Error ? e.message : "Couldn't join.");
    } finally {
      setPartyBusy(false);
    }
  };

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
    if (party.active) {
      void shareParty();
      return;
    }
    setPartyError(null);
    setPartySetup((o) => !o);
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
    if (locked || composing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [role=tablist]")) return;
      if (e.key === "ArrowLeft") keyActions.current.skip();
      else if (e.key === "ArrowRight") keyActions.current.go();
      else if (e.key === "Backspace") keyActions.current.rewind();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locked, composing]);

  if (party.matchedCard && now) {
    return <LockedIn pick={toLocalPick(party.matchedCard)} now={now} partyMatch onClose={party.dismissMatch} />;
  }
  if (locked && now) {
    return <LockedIn pick={locked} now={now} onClose={() => setLocked(null)} />;
  }

  if (joinCode && !inParty) {
    return (
      <main className="mx-auto flex h-dvh max-w-md flex-col bg-ink text-white">
        <TopBar dietaryBadge={null} demo={feedMode === "demo"} onParty={() => {}} hideParty />
        <JoinScreen code={joinCode} onJoin={joinParty} onSolo={clearHash} busy={partyBusy} error={partyError} />
      </main>
    );
  }

  const outOfPicks = !inParty && feed.status === "ready" && !current && !refilling;
  const shownNotice = party.ended ? "That party has ended. Back to solo picks." : notice;

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col bg-ink text-white">
      <TopBar dietaryBadge={null} demo={feedMode === "demo"} onParty={onPartyButton} hideParty={inParty} />
      {partySetup && !inParty && (
        <PartySetup onStart={startParty} onCancel={() => setPartySetup(false)} busy={partyBusy} error={partyError} />
      )}
      {inParty && party.code && party.memberId ? (
        <PartyBar
          code={party.code}
          expiresAt={party.expiresAt}
          members={party.members}
          progress={party.progress}
          meId={party.memberId}
          onShare={shareParty}
          onLeave={leaveParty}
        />
      ) : (
        <MoodTabs mood={mood} onChange={changeMood} />
      )}

      {inParty ? (
        partyCurrent && now ? (
          <PickCard pick={partyCurrent} now={now} swipes={swipes} swipe={swipe} />
        ) : (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center" aria-live="polite">
            <p className="font-display text-2xl font-bold">You&apos;ve swiped them all.</p>
            <p className="text-white/75">
              {party.isHost ? "Fetching more picks for the group…" : "Waiting for the others, or for more picks from the host."}
            </p>
          </section>
        )
      ) : (
        <>
      {(feed.status === "loading" || (feed.status === "ready" && !current && refilling)) && <PickSkeleton />}
      {feed.status === "need_location" && <LocationPrompt onSubmit={submitArea} onUseLocation={useMyLocation} />}
      {feed.status === "error" && <ErrorState message={feed.message} onRetry={() => load(mood)} />}
      {feed.status === "empty" && <EmptyState message={feed.message} suggestion={feed.suggestion} onRetry={() => load(mood)} />}
      {outOfPicks && (
        <EmptyState
          message={`That's every ${MOOD_LABELS[mood].toLowerCase()} pick open nearby.`}
          suggestion="other_mood"
          onRetry={() => load(mood)}
        />
      )}
      {current && now && <PickCard pick={current} now={now} swipes={swipes} swipe={swipe} />}
        </>
      )}

      <div aria-live="polite" className="min-h-0 px-4">
        {voice.listening ? (
          <p className="animate-rise mx-auto mb-1 w-fit max-w-full rounded-full bg-paprika/25 px-3 py-1.5 text-center text-sm text-white">
            {voice.interim ? `“${voice.interim}”` : "Listening… let go when you're done"}
          </p>
        ) : (
          shownNotice && (
            <p className="animate-rise mx-auto mb-1 w-fit rounded-full bg-white/10 px-3 py-1.5 text-center text-sm text-white/85">{shownNotice}</p>
          )
        )}
      </div>

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
        canRewind={inParty ? pHistory.length > 0 : history.length > 0}
        disabled={!shown}
        listening={voice.listening}
        timeLeft={timer.fraction}
        minutesLeft={Math.ceil(timer.remainingMs / 60000)}
        onRewind={rewind}
        onSkip={skip}
        onGo={go}
        onWildcard={onWildcardTap}
        onType={() => (inParty ? setNotice("Cravings are solo-only for now.") : setComposing((c) => !c))}
        onHoldStart={() => {
          if (inParty) return setNotice("Cravings are solo-only for now.");
          voice.prime();
          void voice.start();
        }}
        onHoldEnd={voice.stop}
      />
      <p className="pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-[11px] text-white/50">
        Nothing is saved by us. Close the tab and it&apos;s gone.
      </p>
    </main>
  );
}
