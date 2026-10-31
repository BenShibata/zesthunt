# Zesthunt

Decide what to eat in seconds. Opens straight onto a meal pick: no question, no form, no login. Nothing is saved by us.

## Status

Built in stages, with a review after each one.

- [x] **1. Opening and locked-in screens, using mocked data** (`src/lib/mockPicks.ts`)
- [x] **2. Places + Routes + Claude picks pipeline** (`src/server/`, `src/app/api/`)
- [x] **3. Queue refills, skip signals, moods, shake and voice**
- [x] **4. Hunt party rooms**
- [x] **5. Payment chips, split the bill, order-ahead links**
- [ ] 6. Privacy hardening, accessibility and polish (plus PRIVACY.md and .env.example)

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 in a phone-sized viewport.

### Demo mode vs live

With no keys, the app runs in **demo mode**: the same `/api/picks` stream serves fictional places, and a "Demo" chip shows in the top bar.

For real places, copy `.env.example` to `.env.local` and fill in:

| Variable | What it's for |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Places API (New), Routes API, Geocoding API. Server-side only. |
| `ANTHROPIC_API_KEY` | Ranks and describes picks. Without it, picks use rule-based descriptions from the place type. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Party rooms. Needed on Vercel; locally, rooms live in memory. |

Locally there is no IP geolocation, so the app asks for a neighborhood or ZIP (or your location) on first open. On Vercel it starts from the city-level `x-vercel-ip-*` headers.

## How a pick is made

`POST /api/picks` streams newline-delimited JSON (`meta`, `pick`…, `done`):

1. **Where:** the device location rounded to ~1 km, else a typed neighborhood/ZIP (Geocoding), else the platform's city-level IP estimate, else ask.
2. **What's open:** Places Nearby Search within 1.5 km, open now only. Fewer than 5 → widens to an 8 km drive and says so. Cached per ~1 km area for 5 minutes.
3. **How far:** Routes API route matrix (walking), with a distance estimate if it fails.
4. **Rank and describe:** Claude picks only from those places, with output streamed as structured JSON. Each pick is sent to the phone as soon as its object closes, then validated with Zod. Invented IDs, duplicates, "they serve…" claims, and calorie or diet talk are dropped or replaced. If Claude is slower than 2.5 s for the first pick, a rule-based pick shows first.

Prompts and the output schema are in [`src/server/prompts.ts`](src/server/prompts.ts). Claude never receives coordinates, addresses or IPs.

Photos go through `/api/photo` so the key stays server-side and the browser never contacts Google.

## The queue

- The phone holds ~10 picks so skips never wait. When 3 remain it quietly asks for more, excluding everything already seen.
- **Skip signals:** each pick has a coarse dish category. After 2 skips of the same kind, the phone forms a hint ("fewer noodles", "shorter walks", "cheaper places"). It reorders what's left right away and sends the hint with the next request. Skips themselves never leave the device.
- **Moods:** switching re-sorts the picks already loaded, so it's instant, then streams mood-specific picks behind them.
- **Shake:** two sharp jolts trigger a wildcard pick from another mood. iOS needs motion permission, which is requested on the first tap of the wildcard button.
- **Voice:** holding the center button uses the Web Speech API with `processLocally = true`. The spec requires on-device recognition in that mode and fails rather than uploading audio. Browsers without on-device speech (currently Safari, Firefox and older Chrome) open the text field instead. Only the transcribed text is sent.

## Hunt party

1. Tap **Party**, enter a nickname, and the current picks become the shared deck. **Invite** opens the share sheet (or copies the link) with `zesthunt.com/#p=CODE`. The code sits after the `#`, so it never reaches the server or its logs.
2. Friends open the link, type a nickname and swipe the same cards. When every member (2+) swipes right on the same pick, every device shows "It's a match!" with haptics and confetti.
3. Rooms have a hard 10-minute TTL from creation that activity doesn't extend. The room holds only the code, nicknames (plus a hashed join key), restaurant cards and swipes. Never location, cravings or travel times; each device works out its own walk time.
4. Only the host's device adds cards (it's the one with a location). Party traffic goes through one `POST /api/party` endpoint so codes and keys stay out of URLs. Members poll every 2 s.

## Paying (without Zesthunt touching money)

There's no checkout, no stored cards and no payment processor. Three things only:

1. **How to pay:** chips come from Google Places `paymentOptions`: "Tap to pay" (NFC), "Cards", "Cash only", plus "Online ordering" when there's an ordering page. If Places doesn't say, no chip is shown.
2. **Split the bill:** on the locked-in screen (open by default after a party match, with the head count prefilled). Type the total and the number of people, and the phone works out each share in whole cents that add up exactly. **Send the split** opens the native share sheet with a ready message for Venmo, Cash App, Apple Cash or a text (or copies it where sharing isn't supported). Nothing is sent to the server. Amounts are shown in USD for now.
3. **Order ahead:** links to the restaurant's own site when Places says it does takeout or delivery, otherwise to a DoorDash or Uber Eats search for that place. If Places says neither, it just says "Dine-in only". Payment happens on those sites.

## Deploy to Vercel

1. Push the repo and import it in Vercel (framework: Next.js, no build settings needed).
2. Add `GOOGLE_MAPS_API_KEY` and `ANTHROPIC_API_KEY` under Project → Settings → Environment Variables.
   For party rooms, add an Upstash Redis database (Vercel Marketplace → Upstash) and set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
3. Deploy. In Google Cloud, restrict the key to the three APIs above.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Go (lock in) | swipe right / ✓ | → |
| Skip | swipe left / ✕ | ← |
| Rewind | ↺ | Backspace |
| Tell it a craving | tap center button | Tab to it, Enter |
| Wildcard | dice button, or shake the phone | Tab to it, Enter |
| Speak a craving | hold the center button | (typing is the keyboard path) |

## Project layout

- `src/components/ZestApp.tsx`: in-memory session state (queue, skips, rewind, mood, 10-minute idle clear)
- `src/components/PickCard.tsx`: full-screen pick and its skeleton
- `src/components/Controls.tsx`: thumb-reach controls and the countdown ring
- `src/components/LockedIn.tsx`: the screen after Go
- `src/lib/`: types, time framing, map and order links, the `/api/picks` client, mock data
- `src/server/`: Places, Routes, the Claude ranking, prompts, in-memory cache and rate limit
- `src/app/api/picks`, `src/app/api/photo`: the two API routes
