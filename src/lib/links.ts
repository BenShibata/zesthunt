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
      { app: "DoorDash", url: `https://www.doordash.com/search/store/${q}/` },
      { app: "Uber Eats", url: `https://www.ubereats.com/search?q=${q}` },
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
  return { title: `Want to come to ${pick.name}?`, text: `Want to come? ${pick.name}: ${pick.suggestion.replace(/^Try /, "")}.${closes}`, url };
}
