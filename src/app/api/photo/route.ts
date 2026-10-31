import { env } from "@/server/env";

/**
 * GET /api/photo?name=places/{id}/photos/{ref}
 * Proxies a Places photo so the API key stays on the server and the user's
 * browser never talks to Google directly.
 */
const NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!env.googleKey || !NAME.test(name)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const media = new URL(`https://places.googleapis.com/v1/${name}/media`);
  media.searchParams.set("maxWidthPx", "1200");
  media.searchParams.set("skipHttpRedirect", "true");
  const meta = await fetch(media, { headers: { "X-Goog-Api-Key": env.googleKey }, cache: "no-store" });
  if (!meta.ok) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  const { photoUri } = (await meta.json()) as { photoUri?: string };
  if (!photoUri?.startsWith("https://")) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });

  const img = await fetch(photoUri, { cache: "no-store", referrerPolicy: "no-referrer" });
  if (!img.ok || !img.body) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });

  return new Response(img.body, {
    headers: {
      "Content-Type": img.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
