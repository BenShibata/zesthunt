import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ALLERGIES, DIETS } from "@/lib/dietary";
import { directionsUrl } from "@/lib/links";
import { priceText } from "@/lib/time";
import { MOODS, type PartyCard, type Pick, type PicksEvent } from "@/lib/types";
import { env, isDemo } from "./env";
import { dailyLimit } from "./memory";
import { createOpenParty } from "./party";
import { runPipeline, type PicksRequest } from "./pipeline";

/*
 * Zesthunt as an MCP connector for AI assistants (Claude, ChatGPT and others).
 *
 * Privacy is built into the schema: the tools only accept an area (words or coordinates,
 * rounded to ~1 km here), the local time, a mood and dietary filters. There is no field
 * for a name, an address or an account, so an assistant can't send them. Nothing is
 * stored or logged, and the assistant does the ranking, so no other AI sees the request.
 */

const PRIVACY = "Zesthunt stores nothing. The area is rounded to about 1 km and used for this answer only.";

const INSTRUCTIONS = `Zesthunt finds places to eat that are open right now near the user, with walk times, and picks for them.

When to use: someone asks what or where to eat now, is hungry, or a group can't decide where to go.

Privacy rules (Zesthunt's promise to the user, please keep it):
- Send only a neighborhood, cross-streets, ZIP or city, or approximate coordinates. Never a home or work address, and never the user's name or other personal details.
- Zesthunt stores nothing. You can tell the user that; their assistant's own chat history settings still apply.

How to present results:
- Lead with one pick and say why in a sentence. Offer the next one or two as backups.
- Only recommend places in the results. "try" is a suggested style of dish, not a confirmed menu item.
- Don't mention calories or call food good or bad. If the user has allergies, remind them to check with the restaurant.
- For a group, start_hunt_party gives a link everyone swipes on; it's a match when all of them say go.`;

const Area = {
  area: z
    .string()
    .min(2)
    .max(80)
    .optional()
    .describe("Neighborhood, cross-streets, ZIP or city, e.g. 'Mission District, SF'. Never a home address."),
  latitude: z.number().min(-90).max(90).optional().describe("Approximate latitude. Rounded to ~1 km before use."),
  longitude: z.number().min(-180).max(180).optional().describe("Approximate longitude. Rounded to ~1 km before use."),
  local_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .describe("The user's current local time, 24-hour HH:mm. Frames the meal (breakfast, lunch, dinner, late night)."),
  mood: z.enum(MOODS).default("fresh").describe("fresh, comfort, fast, cheap or treat."),
  diets: z.array(z.enum(DIETS)).max(DIETS.length).optional().describe("Hard dietary rules."),
  allergies: z.array(z.enum(ALLERGIES)).max(ALLERGIES.length).optional().describe("Allergies to flag. Zesthunt can't verify ingredients."),
};
type AreaInput = z.infer<z.ZodObject<typeof Area>>;

const PickOut = z.object({
  name: z.string(),
  try: z.string().describe("A suggested style of dish, not a confirmed menu item."),
  why: z.string(),
  travel_mode: z.enum(["walk", "drive"]),
  travel_minutes: z.number(),
  closes_in_minutes: z.number().nullable(),
  price: z.string().nullable(),
  address: z.string(),
  labels: z.array(z.string()),
  pays_with: z.array(z.string()),
  directions_url: z.string(),
  order_ahead_url: z.string().nullable(),
});

function toRequest(input: AreaInput): { req: PicksRequest } | { error: string } {
  const hasCoords = input.latitude !== undefined && input.longitude !== undefined;
  if (!hasCoords && !input.area) return { error: "Zesthunt needs an area. Ask the user for a neighborhood, cross-streets or ZIP (not a home address)." };
  const dietary = input.diets?.length || input.allergies?.length ? { diets: input.diets ?? [], allergies: input.allergies ?? [] } : null;
  return {
    req: {
      localTime: input.local_time,
      mood: input.mood,
      location: hasCoords ? { lat: input.latitude!, lng: input.longitude! } : null,
      areaQuery: hasCoords ? null : (input.area ?? null),
      dietary,
      skipSignals: [],
      exclude: [],
      // Gently balanced first picks, as in the app.
      firstOfSession: true,
    },
  };
}

/**
 * Runs the same pipeline as the app, minus Claude, and with no request headers: the caller
 * is the assistant's server, so its IP says nothing about where the user is.
 */
async function search(req: PicksRequest, want: number, signal: AbortSignal) {
  const picks: Pick[] = [];
  let problem: string | null = null;
  // The connector is open to anyone, so live lookups (which cost per call) have a daily ceiling. Demo data is free.
  if (!isDemo() && !(await dailyLimit("mcp-search", env.mcpDailyLimit)).ok) {
    return { picks, problem: "Zesthunt has reached today's limit for assistant requests. Try again tomorrow, or open zesthunt.com." };
  }
  for await (const e of runPipeline(req, new Headers(), signal, { rankWithAI: false }) as AsyncGenerator<PicksEvent>) {
    if (e.type === "pick") picks.push(e.pick);
    else if (e.type === "need_location") problem = "Couldn't find that area. Ask the user for a nearby neighborhood, cross-streets or ZIP.";
    else if (e.type === "empty") problem = e.message;
    else if (e.type === "error") problem = e.message;
    if (picks.length >= want) break;
  }
  return { picks, problem };
}

function paysWith(p: Pick): string[] {
  const pay = p.payment;
  if (!pay) return [];
  if (pay.acceptsCashOnly) return ["Cash only"];
  const out: string[] = [];
  if (pay.acceptsNfc) out.push("Tap to pay");
  if (pay.acceptsCreditCards) out.push("Card");
  if (pay.acceptsDebitCards && !pay.acceptsCreditCards) out.push("Debit");
  return out;
}

function toOut(p: Pick): z.infer<typeof PickOut> {
  return {
    name: p.name,
    try: p.suggestion,
    why: p.reason,
    travel_mode: p.travelMode,
    travel_minutes: p.walkMinutes,
    closes_in_minutes: p.closesAt ? Math.max(0, Math.round((Date.parse(p.closesAt) - Date.now()) / 60000)) : null,
    price: p.priceLevel ? priceText(p.priceLevel).visual : null,
    address: p.address,
    labels: p.labels,
    pays_with: paysWith(p),
    directions_url: directionsUrl(p),
    order_ahead_url: p.orderUrl ?? null,
  };
}

function summary(picks: z.infer<typeof PickOut>[], demo: boolean) {
  const lines = picks.map(
    (p, i) =>
      `${i + 1}. ${p.name}: ${p.try}. ${p.why} ${p.travel_minutes} min ${p.travel_mode}` +
      `${p.closes_in_minutes !== null ? `, closes in ${p.closes_in_minutes} min` : ""}${p.price ? `, ${p.price}` : ""}.`,
  );
  return [demo ? "DEMO DATA: these places are fictional." : null, ...lines, PRIVACY].filter(Boolean).join("\n");
}

function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** A fresh server per request (stateless): nothing about one call survives into the next. */
export function buildMcpServer(origin: string, signal: AbortSignal) {
  const server = new McpServer({ name: "zesthunt", title: "Zesthunt", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "find_food_now",
    {
      title: "Find food open now",
      description:
        "Find places to eat that are open right now near an area, with walk times and closing times, ranked for the meal, mood and diet. " +
        "Use when someone asks what or where to eat now. Send only a neighborhood, cross-streets, ZIP or approximate coordinates, never a home address. " +
        "Zesthunt stores nothing.",
      inputSchema: {
        ...Area,
        max_walk_minutes: z.number().int().min(3).max(60).optional().describe("Leave out places farther than this on foot."),
        count: z.number().int().min(1).max(8).default(3).describe("How many picks to return: one pick plus backups."),
      },
      outputSchema: {
        demo: z.boolean().describe("True when Zesthunt has no map key and the places are fictional."),
        picks: z.array(PickOut),
        privacy: z.string(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input) => {
      const built = toRequest(input);
      if ("error" in built) return failure(built.error);
      const { picks, problem } = await search(built.req, input.count + 10, signal);
      const fits = picks.filter((p) => !input.max_walk_minutes || (p.travelMode === "walk" && p.walkMinutes <= input.max_walk_minutes));
      const chosen = fits.slice(0, input.count).map(toOut);
      if (chosen.length === 0) {
        return failure(problem ?? (picks.length ? `Nothing open within a ${input.max_walk_minutes}-minute walk. Try a longer walk.` : "Nothing open nearby right now."));
      }
      const demo = isDemo();
      const out = { demo, picks: chosen, privacy: PRIVACY };
      return { content: [{ type: "text", text: summary(chosen, demo) }], structuredContent: out };
    },
  );

  server.registerTool(
    "start_hunt_party",
    {
      title: "Start a hunt party",
      description:
        "Open a shared Zesthunt room for a group deciding where to eat. Returns a link to send the group: everyone swipes on the same open places, and it's a match when all of them say go. " +
        "The room needs no accounts and disappears after 10 minutes.",
      inputSchema: Area,
      outputSchema: {
        demo: z.boolean(),
        link: z.string(),
        code: z.string(),
        expires_in_minutes: z.number(),
        places_in_room: z.number(),
        privacy: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      const built = toRequest(input);
      if ("error" in built) return failure(built.error);
      const { picks, problem } = await search(built.req, 15, signal);
      if (picks.length < 2) return failure(problem ?? "Not enough open places nearby for a party.");

      // Party cards carry restaurant data only: no travel times, which would hint at where the user is.
      const cards: PartyCard[] = picks.map((p) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { walkMinutes, distanceMeters, timeEstimated, travelUnknown, ...card } = p;
        return card;
      });
      const { code, expiresAt } = await createOpenParty(cards);
      const link = `${origin}/#p=${code}`;
      const minutes = Math.round((expiresAt - Date.now()) / 60000);
      const roomPrivacy = "The room holds only nicknames, these places and swipes, and disappears in 10 minutes. No accounts, no location.";
      const out = { demo: isDemo(), link, code, expires_in_minutes: minutes, places_in_room: cards.length, privacy: roomPrivacy };
      return {
        content: [{ type: "text", text: `Hunt party ready: ${link}\nSend it to the group. Everyone swipes; it's a match when you all say go. Closes in ${minutes} minutes.\n${roomPrivacy}` }],
        structuredContent: out,
      };
    },
  );

  return server;
}
