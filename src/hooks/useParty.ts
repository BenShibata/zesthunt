"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mood, PartyCard, PartyMember, PartyState, PartySteer, Pick } from "@/lib/types";
import { haptic } from "@/lib/haptics";
import { rankResult, type PartyResult } from "@/lib/partyResults";
import { NO_WISHES, type Wish, type WishSummary } from "@/lib/wishes";

const POLL_MS = 2000;
/** With no match, the reveal is asked for this long before the room ends (polls carry it to everyone). */
const REVEAL_BEFORE_END_MS = 12_000;

interface Session {
  code: string;
  memberId: string;
  key: string;
  expiresAt: number;
}

async function call<T>(body: object): Promise<T> {
  const res = await fetch("/api/party", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Party service hiccup."), { status: res.status });
  return data;
}

/** Strips a pick down to restaurant data before it goes to the room. */
export function toPartyCard(p: Pick): PartyCard {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { walkMinutes, distanceMeters, timeEstimated, travelUnknown, ...card } = p;
  return card;
}

export function partyLink(code: string) {
  return `${window.location.origin}/#p=${code}`;
}

/**
 * Answers given here that the room hasn't echoed back yet (the poll can land before the
 * answer does): keep showing them rather than flicker back.
 */
function pendingAnswers(mine: Record<string, "love" | "ok" | "no">, server: Record<string, "love" | "ok" | "no">) {
  return Object.fromEntries(Object.entries(mine).filter(([id]) => !(id in server)));
}

/** Reads a join code from the share link's #p=CODE (fragments never reach the server). */
export function codeFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const m = /[#&]p=([A-Za-z0-9]{6})\b/.exec(window.location.hash);
  return m ? m[1].toUpperCase() : null;
}

/**
 * One hunt party session, held in memory only. Polls the room every 2s for members,
 * new cards and a match. Ends when the room's hard 10-minute TTL runs out.
 */
export function useParty() {
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [hostId, setHostId] = useState<string | null>(null);
  const [deck, setDeck] = useState<PartyCard[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [match, setMatch] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  // Kept after the room expires, until the user closes the locked-in screen.
  const [matchedCard, setMatchedCard] = useState<PartyCard | null>(null);
  // The reveal, kept (like matchedCard) after the room expires, until it's dismissed.
  const [result, setResult] = useState<PartyResult | null>(null);
  const [likes, setLikes] = useState<Record<string, string[]>>({});
  const [myVotes, setMyVotes] = useState<string[]>([]);
  const [myAnswers, setMyAnswers] = useState<Record<string, "love" | "ok" | "no">>({});
  const [loves, setLoves] = useState<Record<string, string[]>>({});
  const [wishes, setWishSummary] = useState<WishSummary>(NO_WISHES);
  const [unfit, setUnfit] = useState<string[]>([]);
  const [needed, setNeeded] = useState(2);
  const [extended, setExtended] = useState(false);
  const [steer, setSteer] = useState<PartySteer | null>(null);
  // "+5 minutes" moves the deadline, so it's tracked apart from the session.
  const [expiresAt, setExpiresAt] = useState(0);
  const expiresRef = useRef(0);
  const deckLen = useRef(0);
  const deckRef = useRef<PartyCard[]>([]);
  const matchRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    setSession(null);
    setMembers([]);
    setHostId(null);
    setDeck([]);
    setProgress({});
    setMatch(null);
    setLikes({});
    setMyVotes([]);
    setMyAnswers({});
    setLoves({});
    setWishSummary(NO_WISHES);
    setUnfit([]);
    setExtended(false);
    setSteer(null);
    deckLen.current = 0;
    deckRef.current = [];
    matchRef.current = null;
  }, []);

  const begin = useCallback((s: Session, host: string | null, me: string, nickname: string, cards: PartyCard[] = []) => {
    deckLen.current = cards.length;
    deckRef.current = cards;
    setDeck(cards);
    setMembers([{ id: me, nickname }]);
    setHostId(host);
    setEnded(false);
    expiresRef.current = s.expiresAt;
    setExpiresAt(s.expiresAt);
    setSession(s);
  }, []);

  // No nickname needed: the room hands out a food name ("Taco"), renamable any time.
  const create = useCallback(
    async (cards: PartyCard[]) => {
      const r = await call<Session & { nickname: string }>({ action: "create", cards });
      begin(r, r.memberId, r.memberId, r.nickname, cards);
      return r.code;
    },
    [begin],
  );

  const join = useCallback(
    async (code: string) => {
      const r = await call<Session & { nickname: string }>({ action: "join", code });
      begin(r, null, r.memberId, r.nickname);
    },
    [begin],
  );

  const auth = useCallback(() => (session ? { code: session.code, memberId: session.memberId, key: session.key } : null), [session]);

  const rename = useCallback(
    async (nickname: string) => {
      const a = auth();
      if (!a) return;
      await call({ action: "rename", ...a, nickname });
      setMembers((ms) => ms.map((m) => (m.id === a.memberId ? { ...m, nickname } : m)));
    },
    [auth],
  );

  /** "Reveal results": the most-liked card wins and everyone's votes are shown (on the next poll for all). */
  const reveal = useCallback(async () => {
    const a = auth();
    if (a) await call({ action: "reveal", ...a });
  }, [auth]);

  const extend = useCallback(async () => {
    const a = auth();
    if (!a) return;
    const r = await call<{ expiresAt: number }>({ action: "extend", ...a });
    expiresRef.current = r.expiresAt;
    setExpiresAt(r.expiresAt);
    setExtended(true);
  }, [auth]);

  /** "Doesn't fit someone": only card ids go to the room. Applied here at once, so the card leaves now. */
  const markUnfit = useCallback(
    async (pickIds: string[]) => {
      const a = auth();
      if (!a || pickIds.length === 0) return;
      setUnfit((prev) => [...new Set([...prev, ...pickIds])]);
      await call({ action: "unfit", ...a, pickIds });
    },
    [auth],
  );

  /** A group nudge: only the mood word goes to the room. */
  const steerTo = useCallback(
    async (mood: Mood) => {
      const a = auth();
      if (a) await call({ action: "steer", ...a, mood });
    },
    [auth],
  );

  /** Answer a place (Love it / OK / Not for me), or change the answer. Shown at once here; the room hears right after. */
  const answer = useCallback(
    (pickId: string, a: "love" | "ok" | "no") => {
      if (!session) return;
      setMyAnswers((m) => ({ ...m, [pickId]: a }));
      setMyVotes((v) => (a === "no" ? v.filter((id) => id !== pickId) : [...new Set([...v, pickId])]));
      void call({ action: "swipe", code: session.code, memberId: session.memberId, key: session.key, pickId, dir: a }).catch(() => {});
    },
    [session],
  );

  /** What would work for me (budget, distance, food words): the room shows only a nameless summary. */
  const setWishes = useCallback(
    async (wish: Wish) => {
      if (!session) return;
      await call({ action: "wishes", code: session.code, memberId: session.memberId, key: session.key, wish });
    },
    [session],
  );

  /** Add a place found by searching: to the end of everyone's list, with my vote. */
  const add = useCallback(
    async (card: PartyCard) => {
      if (!session) throw new Error("Not in a party.");
      const r = await call<{ id: string; existed: boolean }>({ action: "add", code: session.code, memberId: session.memberId, key: session.key, card });
      setMyVotes((v) => [...new Set([...v, r.id])]);
      setMyAnswers((m) => ({ ...m, [r.id]: "love" }));
      return r;
    },
    [session],
  );

  // When time's nearly up with no match, any phone still here asks for the reveal: the
  // most-voted place wins. (If nobody voted, the room just ends.)
  useEffect(() => {
    if (!session || match) return;
    const t = setTimeout(
      () => {
        if (!matchRef.current) void call({ action: "reveal", code: session.code, memberId: session.memberId, key: session.key }).catch(() => {});
      },
      Math.max(0, expiresAt - Date.now() - REVEAL_BEFORE_END_MS),
    );
    return () => clearTimeout(t);
  }, [session, match, expiresAt]);

  const addCards = useCallback(
    async (cards: PartyCard[]) => {
      if (!session || cards.length === 0) return;
      await call({ action: "cards", code: session.code, memberId: session.memberId, key: session.key, cards });
    },
    [session],
  );

  // Poll while the room is alive.
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    const tick = async () => {
      if (Date.now() >= expiresRef.current) {
        setEnded(true);
        reset();
        return;
      }
      try {
        const s = await call<PartyState>({ action: "state", code: session.code, memberId: session.memberId, key: session.key, since: deckLen.current });
        if (stopped) return;
        setMembers(s.members);
        setHostId(s.hostId);
        setProgress(s.progress);
        setLikes(s.likes);
        setMyVotes(s.myVotes);
        setMyAnswers((mine) => ({ ...s.myAnswers, ...pendingAnswers(mine, s.myAnswers) }));
        setLoves(s.loves);
        setWishSummary((prev) => (JSON.stringify(prev) === JSON.stringify(s.wishes) ? prev : s.wishes));
        setUnfit((prev) => [...new Set([...prev, ...s.unfit])]);
        setNeeded(s.needed);
        setExtended(s.extended);
        setSteer((prev) => (prev?.seq === s.steer?.seq ? prev : s.steer));
        if (s.expiresAt !== expiresRef.current) {
          expiresRef.current = s.expiresAt;
          setExpiresAt(s.expiresAt);
        }
        if (s.deck.length > 0) {
          deckLen.current += s.deck.length;
          deckRef.current = [...deckRef.current, ...s.deck];
          setDeck(deckRef.current);
        }
        if (s.match && s.match !== matchRef.current) {
          matchRef.current = s.match;
          setMatch(s.match);
          setMatchedCard(deckRef.current.find((c) => c.id === s.match) ?? null);
          setResult(rankResult(deckRef.current, s.likes, s.members, s.match, s.loves));
          haptic([30, 60, 30, 60, 90]);
        }
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (!stopped && (status === 404 || status === 403)) {
          setEnded(true);
          reset();
        }
      }
    };
    void tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [session, reset]);

  return {
    active: session !== null,
    code: session?.code ?? null,
    memberId: session?.memberId ?? null,
    expiresAt: session ? expiresAt : 0,
    nickname: members.find((m) => m.id === session?.memberId)?.nickname ?? null,
    likes,
    myVotes,
    myAnswers,
    loves,
    wishes,
    setWishes,
    unfit,
    markUnfit,
    needed,
    extended,
    steer,
    rename,
    reveal,
    extend,
    steerTo,
    isHost: Boolean(session && hostId === session.memberId),
    /** Rooms opened by an AI assistant have no host, so nobody can fetch cards for a request. */
    hasHost: hostId !== null,
    members,
    deck,
    progress,
    match,
    matchedCard,
    result,
    dismissMatch: () => {
      setMatchedCard(null);
      setResult(null);
    },
    ended,
    clearEnded: () => setEnded(false),
    create,
    join,
    answer,
    add,
    addCards,
    leave: reset,
  };
}
