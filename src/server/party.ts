import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MAX_DECK, MAX_MEMBERS, ROOM_TTL_MS, roomStore, type StoredMember } from "./partyStore";
import type { PartyCard, PartyState } from "@/lib/types";

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
  orderUrl: z.string().max(500).optional(),
  plate: z.object({ protein: z.number(), veg: z.number(), grain: z.number() }),
  labels: z.array(z.enum(["Protein", "Veg", "Whole grain"])).max(3),
  balance: z.number(),
  upgradeTip: z.string().max(160).optional(),
  photo: z.union([
    z.object({ kind: z.literal("url"), url: z.string().max(600).startsWith("/api/photo?") }),
    z.object({ kind: z.literal("mock"), palette: z.tuple([z.string(), z.string(), z.string()]), motif: z.enum(["bowl", "plate", "wrap", "cup"]) }),
  ]),
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

export async function createParty(nickname: string, cards: PartyCard[]) {
  const store = roomStore();
  const expiresAt = Date.now() + ROOM_TTL_MS;
  const { member, key } = newMember(nickname);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    if (await store.create(code, { hostId: member.id, expiresAt }, member)) {
      await store.appendDeck(code, cards.slice(0, MAX_DECK).map((c) => JSON.stringify(c)), expiresAt);
      return { code, memberId: member.id, key, expiresAt };
    }
  }
  throw new PartyError(503, "Couldn't open a room. Try again.");
}

export async function joinParty(code: string, nickname: string) {
  const meta = await liveMeta(code);
  const members = await roomStore().members(code);
  if (members.length >= MAX_MEMBERS) throw new PartyError(409, "This party is full.");
  const { member, key } = newMember(nickname);
  await roomStore().addMember(code, member, meta.expiresAt);
  return { code, memberId: member.id, key, expiresAt: meta.expiresAt };
}

export async function addCards(code: string, memberId: string, key: string, cards: PartyCard[]) {
  const { meta } = await authed(code, memberId, key);
  if (meta.hostId !== memberId) throw new PartyError(403, "Only the host adds picks.");
  const { size } = await roomStore().deck(code, 0);
  const room = Math.max(0, MAX_DECK - size);
  return roomStore().appendDeck(code, cards.slice(0, room).map((c) => JSON.stringify(c)), meta.expiresAt);
}

/** Records a swipe, then checks for a match: a pick every member (2+) swiped right on. */
export async function recordSwipe(code: string, memberId: string, key: string, pickId: string, dir: "go" | "skip") {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  await store.swipe(code, memberId, pickId, dir, meta.expiresAt);
  if (dir !== "go") return;
  const [members, swipes] = await Promise.all([store.members(code), store.swipes(code)]);
  if (members.length >= 2 && members.every((m) => swipes[`${m.id}|${pickId}`] === "go")) {
    await store.setMatch(code, pickId, meta.expiresAt);
  }
}

export async function partyState(code: string, memberId: string, key: string, since: number): Promise<PartyState> {
  const { meta } = await authed(code, memberId, key);
  const store = roomStore();
  const [members, deck, swipes, match] = await Promise.all([store.members(code), store.deck(code, since), store.swipes(code), store.match(code)]);
  const progress: Record<string, number> = {};
  for (const k of Object.keys(swipes)) {
    const id = k.split("|")[0];
    progress[id] = (progress[id] ?? 0) + 1;
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
  };
}
