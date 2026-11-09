import type { PartyCard, PartyMember } from "./types";

export interface PartyResultRow {
  card: PartyCard;
  /** Nicknames of everyone who said Love it or OK. */
  likers: string[];
  /** How many of them loved it. */
  loved: number;
}

export interface PartyResult {
  winner: PartyResultRow;
  /** Up to two runners-up, most points first. */
  others: PartyResultRow[];
  voters: number;
}

const points = (r: PartyResultRow) => r.loved * 2 + (r.likers.length - r.loved);

/**
 * What the reveal shows: the group's pick first (whatever the room settled on), then the
 * next best places by points (Love it 2, OK 1). Deck order breaks ties, as on the server.
 */
export function rankResult(
  deck: PartyCard[],
  likes: Record<string, string[]>,
  members: PartyMember[],
  matchId: string,
  loves: Record<string, string[]> = {},
): PartyResult | null {
  const name = (id: string) => members.find((m) => m.id === id)?.nickname ?? "Someone";
  const rows = deck.map((card) => ({ card, likers: (likes[card.id] ?? []).map(name), loved: (loves[card.id] ?? []).length }));
  const winner = rows.find((r) => r.card.id === matchId);
  if (!winner) return null;
  const others = rows
    .filter((r) => r.card.id !== matchId && r.likers.length > 0)
    .sort((a, b) => points(b) - points(a))
    .slice(0, 2);
  return { winner, others, voters: members.length };
}
