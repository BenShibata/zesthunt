import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MAX_DECK, MAX_MEMBERS, ROOM_TTL_MS, roomStore, type Answer, type StoredMember } from "./partyStore";
import type { Mood, PartyCard, PartyState } from "@/lib/types";
import { summarizeWishes, type Wish } from "@/lib/wishes";
import { ALL_CRAVINGS } from "@/lib/cravings";

/** Friendly names handed out on join, so nobody has to fill in a form. Tap to rename. */
const FOOD_NAMES = ["Taco", "Ramen", "Dumpling", "Mango", "Biscuit", "Noodle", "Pickle", "Waffle", "Mochi", "Falafel", "Churro", "Kimchi", "Bao", "Pretzel"];

export function pickName(taken: string[]): string {
  const free = FOOD_NAMES.filter((n) => !taken.includes(n));
  return free.length > 0 ? free[randomInt(free.length)] : `Guest ${taken.length + 1}`;
}

/**
 * "Love it"s that make a place a clear favorite: everyone in groups of up to 3, all but one in
 * bigger groups. Kept for the state's `needed`; the vote itself no longer ends on its own when
 * everyone loves a place: everyone is told, and anyone can stop there (see `everyoneLoves`).
 */
export function matchNeeded(members: number): number {
  return members <= 3 ? members : members - 1;
}

/** Places every member loves (in a group of two or more): the group can stop there. */
export function everyoneLoves(t: Tally, memberIds: string[], order: string[]): string[] {
  if (memberIds.length < 2) return [];
  return order.filter((id) => memberIds.every((m) => t[id]?.love.includes(m)));
}

const EXTEND_MS = 5 * 60_000;

// No 0/O/1/I/L so codes are easy to read out loud.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

function newCode() {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const NicknameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 20))
  .pipe(z.string().min(1));

const UrlPhoto = z.object({ kind: z.literal("url"), url: z.string().max(600).startsWith("/api/photo?"), attribution: z.string().max(80).optional() });

/** Restaurant card as the client sends it. Anything extra is dropped by Zod. */
export const PartyCardSchema = z.object({
  id: z.string().max(200),
  placeId: z.string().max(200),
  name: z.string().max(120),
  suggestion: z.string().max(120),
  reason: z.string().max(160),
  moods: z.array(z.string().max(12)).max(5),
  category: z.string().max(40).nullable(),
  priceLevel: z.number().int().min(1).max(4).nullable(),
  closesAt: z.string().max(40).nullable(),
  travelMode: z.enum(["walk", "drive"]),
  location: z.object({ lat: z.number(), lng: z.number() }),
  address: z.string().max(160),
  payment: z
    .object({
      acceptsCreditCards: z.boolean().optional(),
      acceptsDebitCards: z.boolean().optional(),
      acceptsCashOnly: z.boolean().optional(),
      acceptsNfc: z.boolean().optional(),
    })
    .nullable(),
  websiteUrl: z.string().max(500).optional(),
  about: z.string().max(400).optional(),
  orderUrl: z.string().max(500).optional(),
  takeout: z.boolean().nullable().optional(),
  delivery: z.boolean().nullable().optional(),
  plate: z.object({ protein: z.number(), veg: z.number(), grain: z.number() }),
  labels: z.array(z.enum(["Protein", "Veg", "Whole grain"])).max(3),
  balance: z.number(),
  upgradeTip: z.string().max(160).optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  ratingCount: z.number().int().min(0).nullable().optional(),
  mapsUrl: z.string().max(500).startsWith("https://").optional(),
  vegetarianOptions: z.boolean().nullable().optional(),
  placeTypes: z.array(z.string().max(40)).max(8).optional(),
  photo: z.union([UrlPhoto, z.object({ kind: z.literal("mock"), palette: z.tuple([z.string(), z.string(), z.string()]), motif: z.enum(["bowl", "plate", "wrap", "cup"]) })]),
  photos: z.array(UrlPhoto).max(5).optional(),
  storefront: UrlPhoto.optional(),
  phone: z.string().max(40).optional(),
  phoneDial: z.string().max(20).regex(/^\+?\d+$/).optional(),
  reservable: z.boolean().nullable().optional(),
  added: z.boolean().optional(),
  guessed: z.boolean().optional(),
  kind: z.string().max(60).optional(),
  sponsored: z.object({ deal: z.string().max(80), url: z.string().max(500).startsWith("https://").optional() }).optional(),
});

export class PartyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function newMember(nickname: string): { member: StoredMember; key: string } {
  const key = randomBytes(18).toString("base64url");
  return { member: { id: randomBytes(6).toString("hex"), nickname, keyHash: hashKey(key) }, key };
}

async function liveMeta(code: string) {
  const meta = await roomStore().meta(code);
  if (!meta || meta.expiresAt <= Date.now()) throw new PartyError(404, "This party has ended.");
  return meta;
}

async function authed(code: string, memberId: string, key: string) {
  const meta = await liveMeta(code);
  const member = (await roomStore().members(code)).find((m) => m.id === memberId);
  const a = Buffer.from(member?.keyHash ?? "");
  const b = Buffer.from(hashKey(key));
  if (!member || a.length !== b.length || !timingSafeEqual(a, b)) throw new PartyError(403, "Not in this party.");
  return { meta, member };
}

export async function createParty(nickname: string | undefined, cards: PartyCard[]) {
  const store = roomStore();
  const expiresAt = Date.now() + ROOM_TTL_MS;
  const name = nickname ?? pickName([]);
  const { member, key } = newMember(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await store.create(code, { hostId: member.id, expiresAt, startedAt: Date.now() }, member)) {
      await store.appendDeck(code, cards.slice(0, MAX_DECK).map((c) => JSON.stringify(c)), expiresAt);
      return { code, memberId: member.id, key, expiresAt, nickname: name };
    }
  }
  throw new PartyError(503, "Couldn't open a room. Try again.");
}

/** An open room with no host, for the AI connector: friends join from the link, and 2+ "go" swipes make a match. */
export async function createOpenParty(cards: PartyCard[]) {
  const store = roomStore();
  const expiresAt = Date.now() + ROOM_TTL_MS;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await store.create(code, { hostId: null, expiresAt, startedAt: Date.now() }, null)) {
      await store.appendDeck(code, cards.slice(0, MAX_DECK).map((c) => JSON.stringify(c)), expiresAt);
      return { code, expiresAt };
    }
  }
  throw new PartyError(503, "Couldn't open a room. Try again.");
}

export async function joinParty(code: string, nickname?: string) {
  const meta = await liveMeta(code);
  const members = await roomStore().members(code);
  if (members.length >= MAX_MEMBERS) throw new PartyError(409, "This party is full.");
  const name = nickname ?? pickName(members.map((m) => m.nickname));
  const { member, key } = newMember(name);
  await roomStore().addMember(code, member, meta.expiresAt);
  return { code, memberId: member.id, key, expiresAt: meta.expiresAt, nickname: name };
}

export async function renameMember(code: string, memberId: string, key: string, nickname: string) {
  const { meta, member } = await authed(code, memberId, key);
  await roomStore().addMember(code, { ...member, nickname }, meta.expiresAt);
  return { nickname };
}

export async function addCards(code: string, memberId: string, key: string, cards: PartyCard[]) {
  const { meta } = await authed(code, memberId, key);
  if (meta.hostId !== memberId) throw new PartyError(403, "Only the host adds picks.");
  const { size } = await roomStore().deck(code, 0);
  const room = Math.max(0, MAX_DECK - size);
  return roomStore().appendDeck(code, cards.slice(0, room).map((c) => JSON.stringify(c)), meta.expiresAt);
}

/**
 * Anyone can add a place they searched for: it goes to the end of everyone's list, marked as
 * added (never by whom), and counts as their vote. A place already in the list just gets the vote.
 */
export async function addPlace(code: string, memberId: string, key: string, card: PartyCard) {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const deck = await store.deck(code, 0);
  const existing = deck.cards.map((c) => JSON.parse(c) as PartyCard).find((c) => c.placeId === card.placeId);
  let id = existing?.id;
  if (!id) {
    if (deck.size >= MAX_DECK) throw new PartyError(409, "The list is full. Vote on what's there.");
    await store.appendDeck(code, [JSON.stringify({ ...card, added: true })], meta.expiresAt);
    id = card.id;
  }
  await recordSwipe(code, memberId, key, id, "love");
  return { id, existed: Boolean(existing) };
}

/** A member's answer, with the older yes/no read as love/no. */
export type Vote = "love" | "ok" | "no";
const asVote = (a: Answer): Vote => (a === "go" ? "love" : a === "skip" ? "no" : a);
const POINTS: Record<Vote, number> = { love: 2, ok: 1, no: 0 };

type Tally = Record<string, { love: string[]; ok: string[]; no: string[] }>;

/** Everyone's answers per place still in play (removed places can't win, however they were rated). */
function tallyFrom(swipes: Record<string, Answer>, memberIds: string[], unfit: string[] = []): Tally {
  const t: Tally = {};
  for (const [k, a] of Object.entries(swipes)) {
    const [member, pickId] = k.split("|");
    if (!memberIds.includes(member) || unfit.includes(pickId)) continue;
    (t[pickId] ??= { love: [], ok: [], no: [] })[asVote(a)].push(member);
  }
  return t;
}

/** Who's "in" (love or OK) on each place: what the reveal lists. */
function likesFrom(t: Tally): Record<string, string[]> {
  return Object.fromEntries(Object.entries(t).map(([id, v]) => [id, [...v.love, ...v.ok]]).filter(([, l]) => l.length > 0));
}

/** The group's best: most points (love 2, OK 1), then fewer "Not for me", then earliest in the list. Null if nobody's in on anything. */
export function bestPlace(t: Tally, order: string[]): string | null {
  let best: string | null = null;
  let bestKey: [number, number] = [0, 0];
  for (const id of order) {
    const v = t[id];
    if (!v) continue;
    const pts = v.love.length * POINTS.love + v.ok.length * POINTS.ok;
    const key: [number, number] = [pts, -v.no.length];
    if (pts > 0 && (key[0] > bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1]) || !best)) {
      best = id;
      bestKey = key;
    }
  }
  return best;
}

/**
 * Ends the vote as soon as everyone is finished, each person either having answered every
 * place in play or said "I'm done": the best place wins. (When everyone loves a place, the
 * vote doesn't end by itself: everyone is told, and can choose to stop there.)
 */
async function maybeFinish(code: string, expiresAt: number) {
  const store = roomStore();
  const [members, swipes, unfit, deck, match, done] = await Promise.all([
    store.members(code),
    store.swipes(code),
    store.unfit(code),
    store.deck(code, 0),
    store.match(code),
    store.done(code),
  ]);
  if (match || members.length < 2) return;
  const ids = members.map((m) => m.id);
  const t = tallyFrom(swipes, ids, unfit);
  const inPlay = deck.cards.map((c) => (JSON.parse(c) as PartyCard).id).filter((id) => !unfit.includes(id));
  const everyoneDone = inPlay.length > 0 && ids.every((m) => done.includes(m) || inPlay.every((id) => swipes[`${m}|${id}`] !== undefined));
  if (!everyoneDone) return;
  const best = bestPlace(t, inPlay);
  if (best) await store.setMatch(code, best, expiresAt);
}

/**
 * "Doesn't fit someone": each phone checks the cards against its own needs (and whether
 * there's time to get there) and reports only the card ids. The room never learns who or why.
 */
export async function markUnfit(code: string, memberId: string, key: string, pickIds: string[]) {
  const { meta } = await authed(code, memberId, key);
  await roomStore().addUnfit(code, pickIds, meta.expiresAt);
  // Removing the last unanswered place can mean everyone's done.
  await maybeFinish(code, meta.expiresAt);
}

/** Records an answer (or changes it), then checks whether the vote can end. */
export async function recordSwipe(code: string, memberId: string, key: string, pickId: string, dir: Answer) {
  const { meta } = await authed(code, memberId, key);
  await roomStore().swipe(code, memberId, pickId, dir, meta.expiresAt);
  await maybeFinish(code, meta.expiresAt);
}

/** "I'm done": I've seen enough. Counts as finished, so the result can show without me answering the rest. "Keep voting" undoes it. */
export async function setDone(code: string, memberId: string, key: string, done: boolean) {
  const { meta } = await authed(code, memberId, key);
  await roomStore().setDone(code, memberId, done, meta.expiresAt);
  if (done) await maybeFinish(code, meta.expiresAt);
}

/** "Stop here": everyone loves this place, so anyone can end the vote with it. */
export async function stopAt(code: string, memberId: string, key: string, pickId: string) {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, swipes, unfit, deck] = await Promise.all([store.members(code), store.swipes(code), store.unfit(code), store.deck(code, 0)]);
  const ids = members.map((m) => m.id);
  const order = deck.cards.map((c) => (JSON.parse(c) as PartyCard).id);
  if (!everyoneLoves(tallyFrom(swipes, ids, unfit), ids, order).includes(pickId)) throw new PartyError(409, "Not everyone loves that one (yet).");
  await store.setMatch(code, pickId, meta.expiresAt);
  return { match: pickId };
}

/** A member's wishes (budget, distance, food words from the fixed list). Only a nameless summary is ever shown. */
export const WishSchema = z.object({
  price: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
  reach: z.enum(["walk", "drive"]).nullable(),
  crave: z
    .array(z.string().max(30))
    .max(3)
    .transform((c) => c.filter((w) => ALL_CRAVINGS.includes(w))),
});

export async function setWishes(code: string, memberId: string, key: string, wish: Wish) {
  const { meta } = await authed(code, memberId, key);
  await roomStore().setWish(code, memberId, JSON.stringify(wish), meta.expiresAt);
}

/** "Reveal results": the most-liked card wins (earliest in the deck breaks ties) and every vote is shown. Needs at least one "I'm in". */
export async function decideNow(code: string, memberId: string, key: string) {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, swipes, deck, unfit] = await Promise.all([store.members(code), store.swipes(code), store.deck(code, 0), store.unfit(code)]);
  const t = tallyFrom(swipes, members.map((m) => m.id), unfit);
  const order = deck.cards.map((c) => (JSON.parse(c) as PartyCard).id);
  const best = bestPlace(t, order);
  if (!best) throw new PartyError(409, "Nobody's said Love it or OK to anything yet. Keep going!");
  await store.setMatch(code, best, meta.expiresAt);
  return { match: best };
}

/** "+5 minutes", once per room. */
export async function extendParty(code: string, memberId: string, key: string) {
  const { meta } = await authed(code, memberId, key);
  if (meta.extended) throw new PartyError(409, "This party already got its extra 5 minutes.");
  const next = { ...meta, extended: true, expiresAt: meta.expiresAt + EXTEND_MS };
  await roomStore().updateMeta(code, next);
  return { expiresAt: next.expiresAt };
}

/** A group nudge ("Heartier"). Only the mood word is stored; the host's phone fetches matching cards. */
export async function steerParty(code: string, memberId: string, key: string, mood: Mood) {
  const { meta } = await authed(code, memberId, key);
  const { size } = await roomStore().deck(code, 0);
  const steer = { mood, seq: (meta.steer?.seq ?? 0) + 1, at: size, by: memberId };
  await roomStore().updateMeta(code, { ...meta, steer });
  return { steer };
}

export async function partyState(code: string, memberId: string, key: string, since: number): Promise<PartyState> {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, deck, swipes, match, unfit, wishes, done, fullDeck] = await Promise.all([
    store.members(code),
    store.deck(code, since),
    store.swipes(code),
    store.match(code),
    store.unfit(code),
    store.wishes(code),
    store.done(code),
    store.deck(code, 0),
  ]);
  const ids = members.map((m) => m.id);
  const t = tallyFrom(swipes, ids, unfit);
  const allLikes = likesFrom(t);
  const myAnswers: Record<string, Vote> = {};
  for (const [k, a] of Object.entries(swipes)) {
    const [m, pickId] = k.split("|");
    if (m === memberId) myAnswers[pickId] = asVote(a);
  }
  const wishList = Object.entries(wishes)
    .filter(([m]) => ids.includes(m))
    .map(([, w]) => {
      const parsed = WishSchema.safeParse(JSON.parse(w));
      return parsed.success ? parsed.data : null;
    })
    .filter((w): w is Wish => w !== null);
  // Progress counts votes on places still in play, so removed ones don't block "done".
  const progress: Record<string, number> = {};
  for (const k of Object.keys(swipes)) {
    const [id, pickId] = k.split("|");
    if (!unfit.includes(pickId)) progress[id] = (progress[id] ?? 0) + 1;
  }
  return {
    code,
    hostId: meta.hostId,
    expiresAt: meta.expiresAt,
    members: members.map(({ id, nickname }) => ({ id, nickname })),
    deck: deck.cards.map((c) => JSON.parse(c) as PartyCard),
    deckSize: deck.size,
    progress,
    match,
    // Secret ballot: other people's answers only leave the server once there's a result.
    likes: match ? allLikes : {},
    loves: match ? Object.fromEntries(Object.entries(t).map(([id, v]) => [id, v.love]).filter(([, l]) => l.length > 0)) : {},
    myVotes: Object.keys(allLikes).filter((id) => allLikes[id].includes(memberId)),
    myAnswers,
    // Wishes only as a nameless summary.
    wishes: summarizeWishes(wishList),
    needed: matchNeeded(Math.max(2, members.length)),
    extended: Boolean(meta.extended),
    steer: meta.steer ?? null,
    unfit,
    startedAt: meta.startedAt ?? meta.expiresAt - ROOM_TTL_MS,
    done: done.filter((id) => ids.includes(id)),
    // A group result, not anyone's ballot: when every single person loves a place, everyone may know.
    everyoneLoves: match ? [] : everyoneLoves(t, ids, fullDeck.cards.map((c) => (JSON.parse(c) as PartyCard).id)),
  };
}
