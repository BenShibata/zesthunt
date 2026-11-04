import { clientIp, rateLimit, safeErrorLabel } from "@/server/memory";
import { PicksRequestSchema, runPipeline } from "@/server/pipeline";
import type { PicksEvent } from "@/lib/types";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * POST /api/picks → NDJSON stream of PicksEvent lines.
 * The request body (time, rounded location, mood, dietary filter, skip signals)
 * is used for this response only: never logged, cached, or stored.
 */
export async function POST(request: Request) {
  const limit = await rateLimit(clientIp(request.headers));
  if (!limit.ok) {
    return Response.json(
      { error: "Easy there, give it a moment." },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  }
  const parsed = PicksRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: PicksEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        for await (const event of runPipeline(parsed.data, request.headers, request.signal)) {
          if (request.signal.aborted) break;
          send(event);
        }
      } catch (e) {
        console.error("picks failed:", safeErrorLabel(e));
        send({ type: "error", message: "We couldn't reach the map service. Try again in a moment." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...NO_STORE, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}
