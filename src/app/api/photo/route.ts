import { env } from "@/server/env";
import { clientIp, rateLimit } from "@/server/memory";

/**
 * GET /api/photo?name=places/{id}/photos/{ref}
 * Proxies a Places photo so the API key stays on the server and the user's
 * browser never talks to Google directly.
 */
const NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const NO_STORE = { "Cache-Control": "no-store" };
// Each fetch here is a billed Places Photo call. The browser may keep the image for an
// hour so rewinds and re-renders don't pay again. It's `private` so no shared CDN keeps
// copies, in line with Google's limits on caching Places content.
const BROWSER_CACHE = "private, max-age=3600";

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!env.googleKey || !NAME.test(name)) {
    return new Response(null, { status: 404, headers: NO_STORE });
  }

  // A full queue is ~10 photos and refills add ~10 more, so this is far above normal use.
  const limit = await rateLimit(clientIp(request.headers), "photo", 120);
  if (!limit.ok) {
    return new Response(null, { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfter) } });
  }

  const media = new URL(`https://places.googleapis.com/v1/${name}/media`);
  // 800px is sharp on phone screens (the photo area is ~400 CSS px wide) and about half the bytes of 1200.
  media.searchParams.set("maxWidthPx", "800");
  media.searchParams.set("skipHttpRedirect", "true");
  const meta = await fetch(media, { headers: { "X-Goog-Api-Key": env.googleKey }, cache: "no-store" });
  if (!meta.ok) return new Response(null, { status: 502, headers: NO_STORE });
  const { photoUri } = (await meta.json()) as { photoUri?: string };
  if (!photoUri?.startsWith("https://")) return new Response(null, { status: 502, headers: NO_STORE });

  const img = await fetch(photoUri, { cache: "no-store", referrerPolicy: "no-referrer" });
  if (!img.ok || !img.body) return new Response(null, { status: 502, headers: NO_STORE });

  return new Response(img.body, {
    headers: {
      "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": BROWSER_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
