import type { PartyCard, PartyMember } from "./types";

export interface PartyResultRow {
  card: PartyCard;
  /** Nicknames of everyone who said "I'm in". */
  likers: string[];
}

export interface PartyResult {
  winner: PartyResultRow;
  /** Up to two runners-up, most-liked first. */
  others: PartyResultRow[];
  voters: number;
}

/**
 * What the reveal shows: the group's pick first (whatever the room settled on), then the
 * next most-liked cards. Deck order breaks ties, as it does on the server.
 */
export function rankResult(deck: PartyCard[], likes: Record<string, string[]>, members: PartyMember[], matchId: string): PartyResult | null {
  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? "Someone";
  const rows = deck.map((card) => ({ card, likers: (likes[card.id] ?? []).map(name) }));
  const winner = rows.find((r) => r.card.id === matchId);
  if (!winner) return null;
  const others = rows
    .filter((r) => r.card.id !== matchId && r.likers.length > 0)
    .sort((a, b) => b.likers.length - a.likers.length)
    .slice(0, 2);
  return { winner, others, voters: members.length };
}
