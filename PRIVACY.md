# Zesthunt privacy

**Nothing is saved by us. Close the tab and it's gone.**

Zesthunt has no accounts, no login, no cookies, no analytics, no tracking scripts and no third-party pixels. This document lists exactly what is processed, where, and for how long.

## On your device

| What | Where it lives | How long |
| --- | --- | --- |
| Your picks, skips, mood, anything you type or say, your location | In the page's memory (React state) | Until you refresh, close the tab, or 10 minutes pass with no activity. The pick you've locked in stays until you close it. |
| Skip signals ("fewer noodles") | Worked out on the device from your skips | Same as above. Only the short phrase is sent with the next request, never the skips themselves. |
| Bill split amounts | On the device only | Same as above. Only the message you choose to send from your own share sheet leaves the phone. |
| Dietary needs and allergies | In memory by default | Same as above |
| …if you turn on **"Remember my dietary needs on this device"** (off by default) | This browser's `localStorage`, key `zesthunt:dietary:v1`, holding only your diet and allergy selections | Until you tap **Forget me** (deletes it immediately), turn the switch off, or clear site data |

Zesthunt writes nothing else to `localStorage`, `sessionStorage`, IndexedDB or cookies.

## Sent to our server, per request

`POST /api/picks` receives:

- the device's local time (hour and minute frame the meal),
- the mood tab,
- your location, **rounded on the device to about 1 km** (two decimal places), *or* a neighborhood/ZIP you typed, *or* nothing,
- your dietary needs and allergies, if set, used as a filter,
- skip signals and anything you typed or said (as text),
- the IDs of picks you've already seen, so they aren't repeated.

None of this is written to disk, a database or logs. Responses carry `Cache-Control: no-store`, and every page sends `Referrer-Policy: no-referrer`. Server logs show only the method and path (e.g. `POST /api/picks 200`). On failure, the log line is the error type or a service status like `places 403`, never request content.

**IP address:** when you haven't shared a location, the server reads the hosting platform's city-level IP geolocation headers once to show a first pick nearby. It isn't stored or logged. For rate limiting, the IP is hashed with a random per-instance salt into a counter that expires after one minute.

## Sent to third parties

| Service | What it gets | Why |
| --- | --- | --- |
| Google Places API (New) | A rounded (~1 km) area and search radius | Find open restaurants nearby |
| Google Routes API | The same rounded point and restaurant locations | Walking times |
| Google Geocoding API | The neighborhood or ZIP you typed (only if you typed one) | Turn it into a rounded area |
| Google Places photos | A photo reference, fetched by our server | Your browser never talks to Google, so it never sees your IP |
| Anthropic (Claude API) | Meal frame, mood, dietary needs, skip signals, what you typed or said, and the list of nearby places (names, types, travel minutes). **No coordinates, addresses or IP.** | Rank and describe the picks |

Restaurant results are cached in server memory per ~1 km area for 5 minutes (it's restaurant data, not yours) and are gone when the server instance stops.

**Voice:** hold-to-speak uses your browser's on-device speech recognition only (`processLocally = true`). Audio never leaves your phone, and only the transcribed text is sent. Browsers without on-device recognition fall back to typing.

**Location:** precise browser location is only requested when you tap Go (to refine the walk time on your device) or when you choose "Use my location". It stays in memory and is rounded before it's sent anywhere.

## Hunt party rooms

Party rooms are the only thing the server keeps, and only briefly.

- **Contents:** the 6-character room code, each member's nickname and a hash of their join key, the shared deck of restaurant cards, each member's swipes on those cards, and the match.
- **Never in a room:** location, travel times, what anyone typed or said, dietary needs, or IP addresses.
- **Lifetime:** a hard 10 minutes from creation. Activity doesn't extend it. Every key expires at the same moment (Redis `EXPIREAT` in production; an in-memory map in local development).
- **Share links** look like `zesthunt.com/#p=CODE`. The code sits after the `#`, which browsers never send to servers, so it doesn't appear in request logs. Party API calls carry the code and key in the request body, not the URL.

## Paying

Zesthunt never handles money. There's no checkout, no stored cards and no payment processor. Payment chips come from Google Places. Bill splits are calculated on your device and shared from your own share sheet. "Order ahead" links go to the restaurant's site or a delivery app, where you pay them directly.

## Browser protections

Every page is served with a strict Content-Security-Policy: same-origin only, no third-party scripts, `frame-ancestors 'none'`. It also sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` that allows only location, microphone and motion, and only for this site.
