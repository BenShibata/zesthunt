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

/** The restaurant's own ordering page if Places has one, else a delivery-app search. */
export function orderAheadUrl(pick: Pick): { url: string; ownSite: boolean } {
  if (pick.orderUrl) return { url: pick.orderUrl, ownSite: true };
  return {
    url: `https://www.doordash.com/search/store/${encodeURIComponent(pick.name)}/`,
    ownSite: false,
  };
}
