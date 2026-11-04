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
| …if you turn on **"Remember this on this device"** under What I eat (off by default) | This browser's `localStorage`, key `zesthunt:dietary:v1`, holding only your diet and allergy selections | Until you tap **Forget me** (deletes it immediately), turn the switch off, or clear site data |

Zesthunt writes nothing else to `localStorage`, `sessionStorage`, IndexedDB or cookies.

## Sent to our server, per request

`POST /api/picks` receives:

- the device's local time, hour and minute only (no date), to frame the meal,
- the mood tab,
- your location, **rounded on the device to about 1 km** (two decimal places), *or* a neighborhood/ZIP you typed, *or* nothing,
- your dietary needs and allergies, if set, used as a filter,
- skip signals and anything you typed or said (as text),
- the IDs of picks you've already seen, so they aren't repeated.

None of this is written to disk, a database or logs. Responses carry `Cache-Control: no-store`, and every page sends `Referrer-Policy: no-referrer`. Server logs show only the method and path (e.g. `POST /api/picks 200`). On failure, the log line is the error type or a service status like `places 403`, never request content.

**IP address:** when you haven't shared a location, the server reads the hosting platform's city-level IP geolocation headers once to show a first pick nearby. It isn't stored or logged. For rate limiting, the IP is turned into a one-way keyed hash that also includes the current minute, and used as a request counter that expires after two minutes. On the live site the counter is kept in the same Upstash database as party rooms, so the limit holds across all server instances. Without the database key the hash can't be traced back to an IP, and the same IP gets an unrelated hash the next minute. Locally, the counter stays in server memory with a random per-instance salt.

## Sent to third parties

| Service | What it gets | Why |
| --- | --- | --- |
| Google Places API (New) | A rounded (~1 km) area and search radius. **If you set a craving**, the craving's words too ("ramen"), never combined with anything that identifies you | Find open restaurants nearby, or ones serving what you're craving |
| Google Routes API | The same rounded point and restaurant locations | Walking times |
| Google Geocoding API | The neighborhood or ZIP you typed (only if you typed one) | Turn it into a rounded area |
| Google Places photos | A photo reference, fetched by our server | Your browser never talks to Google, so it never sees your IP. Your browser may keep a photo for up to an hour; no shared cache does |
| Anthropic (Claude API) | Meal frame, mood, dietary needs, skip signals, what you typed or said, and the list of nearby places (names, types, travel minutes). **No coordinates, addresses or IP.** | Rank and describe the picks |

Restaurant results are cached in server memory per ~1 km area for 5 minutes (it's restaurant data, not yours) and are gone when the server instance stops. Searches for a craving are never cached, because the craving is yours: those results are used for that one response.

**Voice:** hold-to-speak uses your browser's on-device speech recognition only (`processLocally = true`). Audio never leaves your phone, and only the transcribed text is sent. Browsers without on-device recognition fall back to typing.

**Location:** precise browser location is only requested when you tap Go (to refine the walk time on your device) or when you choose "Use my location". It stays in memory and is rounded before it's sent anywhere.

**See it yourself:** the lock button ("What we sent") at the bottom of the app shows the last request exactly as it left your phone, including the raw JSON, and which services received what.

## Through an AI assistant (the Zesthunt connector)

If you add Zesthunt to an assistant such as Claude or ChatGPT, the assistant calls `zesthunt.com/mcp` for you.

- **What it can send:** an area (a neighborhood, cross-streets, ZIP or city, or approximate coordinates, which we round to about 1 km), your local time, a mood, an optional craving ("ramen"), and diet or allergy filters. The tools have no field for a name, address or account, so these can't be sent.
- **What happens to it:** the same as in the app. It's used for that answer only, never stored or logged. Google gets the rounded area, and the craving's words if there is one. Claude is **not** called, because your assistant does the ranking.
- **No IP location:** requests come from the assistant's servers, so we never guess your location from them.
- **Party rooms** started from an assistant work like any other room, except they have no host. They hold nicknames, the places, swipes and nudge words, and vanish after 10 minutes (15 with the one-time extension).
- **Your assistant's own history:** Zesthunt keeps nothing, but your conversation with the assistant is subject to that assistant's own settings.

## Hunt party rooms

Party rooms are the only thing the server keeps, and only briefly.

- **Contents:** the 6-character room code, each member's nickname (a handed-out food name unless they rename) and a hash of their join key, the shared deck of restaurant cards, each member's swipes on those cards, the match, the latest group nudge as one of five mood words ("comfort") with who sent it, and whether the one-time 5 extra minutes were used.
- **Never in a room:** location, travel times, what anyone typed or said, dietary needs, or IP addresses.
- **Votes are a secret ballot:** until the group has a result, the server sends each member only their own votes, never anyone else's. At the result, everyone sees who was in on the top picks.
- **Lifetime:** a hard 10 minutes from creation. Activity doesn't extend it; the only way to add time is the one-time "+5 min" any member can tap, for 15 minutes at most. Every key expires at the same moment (Redis `EXPIREAT` in production; an in-memory map in local development).
- **Share links** look like `zesthunt.com/#p=CODE`. The code sits after the `#`, which browsers never send to servers, so it doesn't appear in request logs. Party API calls carry the code and key in the request body, not the URL.

## Paying

Zesthunt never handles money. There's no checkout, no stored cards and no payment processor. Payment chips come from Google Places. Bill splits are calculated on your device and shared from your own share sheet. "Order ahead" links go to the restaurant's site or a delivery app, where you pay them directly.

## Browser protections

Every page is served with a strict Content-Security-Policy: same-origin only, no third-party scripts, `frame-ancestors 'none'`. It also sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Opener-Policy: same-origin`, and a `Permissions-Policy` that allows only location, microphone and motion, and only for this site.
