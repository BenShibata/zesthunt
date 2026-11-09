import type { Pick } from "./types";

function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
}

/** Directions in the user's own maps app. Origin is left to the app (current location). */
export function directionsUrl(pick: Pick): string {
  const { lat, lng } = pick.location;
  const walking = pick.travelMode === "walk";
  if (isApple()) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=${walking ? "w" : "d"}`;
  }
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
    travelmode: walking ? "walking" : "driving",
  });
  if (!pick.placeId.startsWith("mock-")) params.set("destination_place_id", pick.placeId);
  return `https://www.google.com/maps/dir/?${params}`;
}

/**
 * Referral tagging (revenue): each partner gets a template, set in the environment once
 * you've joined its program. A template containing {url} wraps the destination (the usual
 * shape for Impact/CJ-style tracking links); anything else is appended as query parameters
 * ("ref=zesthunt"). Unset means a plain link. Only the destination is passed on: never the
 * user's location or anything about them.
 */
export type Partner = "doordash" | "ubereats" | "opentable";

const REFERRAL: Record<Partner, string | undefined> = {
  // Read straight from NEXT_PUBLIC_* so Next inlines them into the browser bundle.
  doordash: process.env.NEXT_PUBLIC_REFERRAL_DOORDASH,
  ubereats: process.env.NEXT_PUBLIC_REFERRAL_UBEREATS,
  opentable: process.env.NEXT_PUBLIC_REFERRAL_OPENTABLE,
};

export function tagLink(url: string, template: string | undefined): string {
  const t = template?.trim();
  if (!t) return url;
  if (t.includes("{url}")) return t.replace("{url}", encodeURIComponent(url));
  const u = new URL(url);
  for (const [k, v] of new URLSearchParams(t.replace(/^[?&]/, ""))) u.searchParams.set(k, v);
  return u.toString();
}

const referral = (partner: Partner, url: string) => tagLink(url, REFERRAL[partner]);

/** Some links pay Zesthunt a referral fee: true when any is set up, so the screen can say so. */
export const referralsOn = Object.values(REFERRAL).some((t) => Boolean(t?.trim()));

/**
 * "Book a table": an OpenTable search for the place, only when Google says it takes
 * reservations. A search (not a booking page) because Places gives no booking links.
 */
export function bookTableUrl(pick: Pick): string | null {
  if (pick.reservable !== true) return null;
  return referral("opentable", `https://www.opentable.com/s?term=${encodeURIComponent(pick.name)}`);
}

export type OrderAhead =
  | { kind: "own"; url: string }
  | { kind: "delivery"; options: { app: string; url: string }[] }
  | { kind: "none" };

/**
 * Order-ahead never happens in Zesthunt: we only link out, and payment happens there.
 * The restaurant's own ordering page wins; otherwise a delivery-app search for the
 * place; nothing at all when Places says it does neither takeout nor delivery.
 */
export function orderAhead(pick: Pick): OrderAhead {
  if (pick.orderUrl) return { kind: "own", url: pick.orderUrl };
  if (pick.takeout === false && pick.delivery === false) return { kind: "none" };
  const q = encodeURIComponent(pick.name);
  return {
    kind: "delivery",
    options: [
      { app: "DoorDash", url: referral("doordash", `https://www.doordash.com/search/store/${q}/`) },
      { app: "Uber Eats", url: referral("ubereats", `https://www.ubereats.com/search?q=${q}`) },
    ],
  };
}

/**
 * "Want to come?": one place to send a friend, lighter than a party. Built on the phone and
 * sent from the user's own share sheet; it names the place, never where the sender is.
 */
export function inviteMessage(pick: Pick): { title: string; text: string; url: string } {
  const url = pick.mapsUrl ?? directionsUrl(pick);
  const closes = pick.closesAt
    ? ` Open till ${new Date(pick.closesAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
    : "";
  return { title: `Want to come to ${pick.name}?`, text: pick.guessed ? `Want to come? ${pick.name}.${closes}` : `Want to come? ${pick.name}: ${pick.suggestion.replace(/^Try /, "")}.${closes}`, url };
}
