import { z } from "zod";
import { clientIp, rateLimit, safeErrorLabel } from "@/server/memory";
import { CODE_RE, NicknameSchema, PartyCardSchema, PartyError, addCards, createParty, joinParty, partyState, recordSwipe } from "@/server/party";
import type { PartyCard } from "@/lib/types";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

const Code = z.string().toUpperCase().regex(CODE_RE);
const Auth = { code: Code, memberId: z.string().max(32), key: z.string().max(64) };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), nickname: NicknameSchema, cards: z.array(PartyCardSchema).min(1).max(40) }),
  z.object({ action: z.literal("join"), code: Code, nickname: NicknameSchema }),
  z.object({ action: z.literal("state"), ...Auth, since: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal("swipe"), ...Auth, pickId: z.string().max(200), dir: z.enum(["go", "skip"]) }),
  z.object({ action: z.literal("cards"), ...Auth, cards: z.array(PartyCardSchema).max(40) }),
]);

/**
 * POST /api/party: every party action goes through one POST so room codes and
 * member keys stay in request bodies, never in URLs or access logs.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  }

  // Polling is frequent; everything else is a human action.
  const limit = body.action === "state" ? rateLimit(clientIp(request.headers), "party-poll", 150) : rateLimit(clientIp(request.headers), "party", 60);
  if (!limit.ok) {
    return Response.json({ error: "Easy there, give it a moment." }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } });
  }

  try {
    switch (body.action) {
      case "create":
        return Response.json(await createParty(body.nickname, body.cards as PartyCard[]), { headers: NO_STORE });
      case "join":
        return Response.json(await joinParty(body.code, body.nickname), { headers: NO_STORE });
      case "state":
        return Response.json(await partyState(body.code, body.memberId, body.key, body.since), { headers: NO_STORE });
      case "swipe":
        await recordSwipe(body.code, body.memberId, body.key, body.pickId, body.dir);
        return Response.json({ ok: true }, { headers: NO_STORE });
      case "cards":
        return Response.json({ deckSize: await addCards(body.code, body.memberId, body.key, body.cards as PartyCard[]) }, { headers: NO_STORE });
    }
  } catch (e) {
    if (e instanceof PartyError) return Response.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    console.error("party failed:", safeErrorLabel(e));
    return Response.json({ error: "Party service hiccup. Try again." }, { status: 502, headers: NO_STORE });
  }
}
