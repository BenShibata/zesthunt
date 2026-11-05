import { connection } from "next/server";
import { env, isDemo } from "@/server/env";
import { upstash } from "@/server/upstash";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * GET /api/health: what's connected, for an uptime checker or a quick look after a deploy.
 * Says only yes/no and which model, never a key or any user data. 503 if anything the live
 * app depends on is missing, so a monitor alerts when production quietly falls back to demo.
 */
export async function GET() {
  // Read the environment at request time, not once at build.
  await connection();

  const db = upstash();
  let rooms: "upstash" | "unreachable" | "memory" = "memory";
  if (db) {
    try {
      const [pong] = await db.run([["PING"]]);
      rooms = pong === "PONG" ? "upstash" : "unreachable";
    } catch {
      rooms = "unreachable";
    }
  }

  const status = {
    places: isDemo() ? "demo (no GOOGLE_MAPS_API_KEY)" : "google",
    walkTimes: env.useRoutes ? "google routes" : "distance estimate",
    ranking: !env.anthropicModel ? "rule-based (ANTHROPIC_MODEL=off)" : env.anthropicKey ? env.anthropicModel : "rule-based (no ANTHROPIC_API_KEY)",
    rooms,
  };
  const ok = !isDemo() && rooms === "upstash";
  return Response.json({ ok, ...status }, { status: ok ? 200 : 503, headers: NO_STORE });
}
