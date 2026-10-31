"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PartyCard, PartyMember, PartyState, Pick } from "@/lib/types";
import { haptic } from "@/lib/haptics";

const POLL_MS = 2000;

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
    setSession(s);
  }, []);

  const create = useCallback(
    async (nickname: string, cards: PartyCard[]) => {
      const r = await call<Session & { memberId: string }>({ action: "create", nickname, cards });
      begin(r, r.memberId, r.memberId, nickname, cards);
      return r.code;
    },
    [begin],
  );

  const join = useCallback(
    async (code: string, nickname: string) => {
      const r = await call<Session>({ action: "join", code, nickname });
      begin(r, null, r.memberId, nickname);
    },
    [begin],
  );

  const swipe = useCallback(
    (pickId: string, dir: "go" | "skip") => {
      if (!session) return;
      void call({ action: "swipe", code: session.code, memberId: session.memberId, key: session.key, pickId, dir }).catch(() => {});
    },
    [session],
  );

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
      if (Date.now() >= session.expiresAt) {
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
        if (s.deck.length > 0) {
          deckLen.current += s.deck.length;
          deckRef.current = [...deckRef.current, ...s.deck];
          setDeck(deckRef.current);
        }
        if (s.match && s.match !== matchRef.current) {
          matchRef.current = s.match;
          setMatch(s.match);
          setMatchedCard(deckRef.current.find((c) => c.id === s.match) ?? null);
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
    expiresAt: session?.expiresAt ?? 0,
    isHost: Boolean(session && hostId === session.memberId),
    members,
    deck,
    progress,
    match,
    matchedCard,
    dismissMatch: () => setMatchedCard(null),
    ended,
    clearEnded: () => setEnded(false),
    create,
    join,
    swipe,
    addCards,
    leave: reset,
  };
}
