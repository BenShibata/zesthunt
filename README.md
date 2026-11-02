# Zesthunt

Decide what to eat in seconds. Opens straight onto a meal pick: no question, no form, no login. Nothing is saved by us.

## Status

Built in stages, with a review after each one.

- [x] **1. Opening and locked-in screens, using mocked data** (`src/lib/mockPicks.ts`)
- [x] **2. Places + Routes + Claude picks pipeline** (`src/server/`, `src/app/api/`)
- [x] **3. Queue refills, skip signals, moods, shake and voice**
- [x] **4. Hunt party rooms**
- [x] **5. Payment chips, split the bill, order-ahead links**
- [x] **6. Privacy hardening, accessibility and polish** (see [PRIVACY.md](PRIVACY.md))
- [x] **"What we sent" receipt and rounded-area visual**
- [x] **A. AI assistant connector (MCP) at `/mcp`**
- [ ] B. Pick card shown inside the chat (MCP Apps / Apps SDK)
- [ ] C. Connector directory listings and "Add to Claude / ChatGPT" buttons

## Run locally

```bash
npm install
npm run dev
```

Checks (the same ones CI runs on every push and pull request):

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Open http://localhost:3000 in a phone-sized viewport.

### Demo mode vs live

With no keys, the app runs in **demo mode**: the same `/api/picks` stream serves fictional places, and "Demo · fictional places" shows under the moods, where the area line would be.

For real places, copy `.env.example` to `.env.local` and fill in:

| Variable | What it's for |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Places API (New), Routes API, Geocoding API. Server-side only. |
| `ANTHROPIC_API_KEY` | Ranks and describes picks. Without it, picks use rule-based descriptions from the place type. |
| `ANTHROPIC_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Party rooms and rate limits. Needed on Vercel; locally, both live in memory. |
| `MCP_DAILY_LIMIT` | Optional. Most live place searches the `/mcp` connector may run per UTC day, across all callers. Defaults to 2000. |

Locally there is no IP geolocation, so the app asks for a neighborhood or ZIP (or your location) on first open. On Vercel it starts from the city-level `x-vercel-ip-*` headers.

## How a pick is made

`POST /api/picks` streams newline-delimited JSON (`meta`, `pick`…, `done`):

1. **Where:** the device location rounded to ~1 km, else a typed neighborhood/ZIP (Geocoding), else the platform's city-level IP estimate, else ask.
2. **What's open:**
   - **With a craving** ("ramen"): Places Text Search for it, open now, near the area. Two or more matches within 1.5 km → walk; otherwise matches within 8 km → drive. No matches → the usual search, and the phone says "Nothing for “ramen” open nearby, so here's what is." Craving searches are never cached.
   - **Otherwise:** the 20 nearest open places (Nearby Search, 1.5 km). When fewer than 10 are left after the phone's exclude list, it adds the 20 most popular nearby and a Text Search for the mood ("salad poke healthy bowl" for Fresh, and so on). Fewer than 5 → widens to an 8 km drive and says so. "Try a short drive" on the empty screen asks for the 8 km search directly.
   - Cached per ~1 km area for 5 minutes. The field list includes rating, rating count and the Google Maps link, which are in the same billing tier as the fields already requested.
3. **How far:** Routes API route matrix (walking), with a distance estimate if it fails.
4. **Rank and describe:** Claude picks only from those places, with output streamed as structured JSON. Each pick is sent to the phone as soon as its object closes, then validated with Zod. Invented IDs, duplicates, "they serve…" claims, and calorie or diet talk are dropped or replaced. If Claude is slower than 2.5 s for the first pick, a rule-based pick shows first.

Prompts and the output schema are in [`src/server/prompts.ts`](src/server/prompts.ts). Claude never receives coordinates, addresses or IPs.

Photos go through `/api/photo` so the key stays server-side and the browser never contacts Google. Each one is a billed Places Photo call, so the route is rate-limited (120 a minute per IP) and the browser may keep a photo for an hour (`private`, so no CDN copies).

### Limits

Every API route has a per-IP limit per minute: picks 40, party actions 60, party polling 150, photos 120, MCP 120. With Upstash configured, the counts are shared by all server instances. If Upstash can't be reached, each instance falls back to its own in-memory count. Live searches from the MCP connector also have a daily ceiling across all callers (`MCP_DAILY_LIMIT`). Also set a daily quota on the Google key in Google Cloud as the final backstop.

## Finding the right food

- **Where:** a line under the moods shows where the search is centered ("San Francisco (approx.)" for the IP estimate, "Near you" for the device location). **Change** opens the neighborhood/ZIP field or "Use my location". A typed area replaces the device location.
- **Craving:** tap the search button (center) and type, hold it and speak, or tap a shortcut (they change with the meal: coffee and bagels in the morning, pizza and ramen at dinner; meat-led ones are hidden for vegetarian and vegan diets). The craving shows as a chip next to the area and applies to every refill until you clear it with ✕. Switching mood keeps it.
- **Rating:** the card shows the Google rating and count ("★ 4.6 (1.2k)"). Claude and the rule-based ranking use it only as a tie-breaker.
- **Menu, photos and reviews:** a link on the locked-in screen opens the place on Google Maps.
- **Every chip is a way forward:** the dish type and health labels on the card are buttons. "More noodles" searches for noodles nearby, and "Protein", "Veg" and "Whole grain" search for high-protein, veggie and whole-grain places. They set the craving, so ✕ on the craving chip goes back to the mood. (In a party they're plain labels, since cravings are solo-only.)
- **Notices float, nothing jumps:** "Got it: fewer salads" and other notices appear over the top of the photo, in place of the swipe-count badge, and **Back** sits in the photo's top-left corner whenever there's a pick to return to. Neither pushes the card or the buttons around.
- **Out of picks:** the empty screen offers a short drive (when on foot), other moods, clearing the craving, or ordering in, instead of a dead end.

## The queue

- The phone holds ~10 picks so skips never wait. When 3 remain it quietly asks for more, excluding everything already seen.
- **Skip signals:** each pick has a coarse dish category. After 2 skips of the same kind, the phone forms a hint ("fewer noodles", "shorter walks", "cheaper places"). It reorders what's left right away and sends the hint with the next request. Skips themselves never leave the device.
- **Moods:** switching re-sorts the picks already loaded, so it's instant, then streams mood-specific picks behind them.
- **Shake:** two sharp jolts trigger a wildcard pick from another mood. iOS needs motion permission, which is requested on the first tap of **Surprise** (on the area line).
- **Voice:** holding the search button uses the Web Speech API with `processLocally = true`. The spec requires on-device recognition in that mode and fails rather than uploading audio. Browsers without on-device speech (currently Safari, Firefox and older Chrome) open the text field instead. Only the transcribed text is sent.

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

## Privacy and accessibility

[PRIVACY.md](PRIVACY.md) lists exactly what is processed and where. The short version is also in the app at `/privacy`.

- **"What we sent":** the footer's lock button opens a receipt built from the exact request body that last left the phone. It shows the rounded area on a drawn map (your exact spot as a dot that stays on the phone), the time without a date, mood, diet, craving and skip hints. It also lists what wasn't sent, which services got what, and the raw JSON.
- **Nothing persisted** except the opt-in "Remember my dietary needs on this device" (`localStorage` key `zesthunt:dietary:v1`, diet and allergy selections only). **Forget me** deletes it instantly.
- **Dietary needs are hard rules:** places that can't meet them are filtered out. Any suggestion naming meat or fish that the diet excludes is replaced. With allergies set, the locked-in screen says "Check allergens with the restaurant."
- **Strict headers:** a same-origin-only Content-Security-Policy, `frame-ancestors 'none'`, `nosniff`, COOP, a minimal `Permissions-Policy`, `Referrer-Policy: no-referrer` on every response, and `no-store` on the API.
- **Logs** never include request bodies. Failures log only the error type or a service status like `places 403`.
- **Accessibility:** real buttons and labels throughout, 44px minimum touch targets, keyboard support (← → Backspace, arrow keys in the mood tabs), live regions for notices, focus moved to the locked-in heading, AA contrast on the colour pairs we checked, and `prefers-reduced-motion` turns off the photo develop-in, confetti and route animations.

## AI assistant connector (MCP)

`POST /mcp` is a Streamable HTTP MCP server: stateless, no sign-in, and a fresh server for every request. Add `https://zesthunt.com/mcp` as a custom connector in Claude or ChatGPT.

| Tool | What it does |
| --- | --- |
| `find_food_now` | Places open now near an area, with walk and closing times and Google ratings, ranked for meal, mood and diet. An optional `craving` ("ramen") searches for places serving it. Read-only. |
| `start_hunt_party` | Opens a 10-minute room with no host and returns a `/#p=CODE` link. Everyone joins from the link, and two or more "go" swipes on the same place make a match. |

Privacy is in the schema: the tools accept only an area (words, or coordinates rounded to ~1 km), the local time, a mood, an optional craving and dietary filters. There is no field for a name, address or account. The server instructions ask assistants never to send a home address. The user's own assistant does the ranking, so Claude isn't called and no other AI sees the request. IP-based location is never used here, because the caller is the assistant's server. Each answer carries a `privacy` line.

Test it locally with the MCP Inspector (`npx @modelcontextprotocol/inspector`, then connect to `http://localhost:3000/mcp`).

## Deploy to Vercel

1. Push the repo and import it in Vercel (framework: Next.js, no build settings needed).
2. Add `GOOGLE_MAPS_API_KEY` and `ANTHROPIC_API_KEY` under Project → Settings → Environment Variables.
   For party rooms, add an Upstash Redis database (Vercel Marketplace → Upstash) (it sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` for you, which the app reads; `UPSTASH_REDIS_REST_*` also work).
3. Deploy. In Google Cloud, restrict the key to the three APIs above and set a daily quota on each one, so a traffic spike can't run up an open-ended bill.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Let's go (lock in) | swipe right / **Let's go** | → |
| Another (skip) | swipe left / **Another** | ← |
| Back to the previous pick | **Back** in the photo's top-left corner | Backspace |
| More like this | tap a chip on the card ("More noodles", "Veg") | Tab to it, Enter |
| Change mood | tap a mood (all five always fit on screen) | Tab to the moods, ← → |
| Diet and allergies | **Diet** (top right; shows e.g. "Vegan +1" when set) | Tab to it, Enter |
| Start a hunt party | **Party** (top right) | Tab to it, Enter |
| Search a craving | tap the search button (center) | Tab to it, Enter |
| Surprise (wildcard) | **Surprise** on the area line, or shake the phone | Tab to it, Enter |
| Speak a craving | hold the search button (it turns into a mic while listening) | (typing is the keyboard path) |

## Project layout

- `src/components/ZestApp.tsx`: in-memory session state (queue, skips, rewind, mood, 10-minute idle clear)
- `src/components/PickCard.tsx`: full-screen pick and its skeleton
- `src/components/Controls.tsx`: thumb-reach controls and the countdown ring
- `src/components/LockedIn.tsx`: the screen after Go
- `src/lib/`: types, time framing, map and order links, the `/api/picks` client, mock data
- `src/server/`: Places, Routes, the Claude ranking, prompts, in-memory cache, rate limits, and the shared Upstash client (`upstash.ts`)
- `src/app/api/picks`, `src/app/api/photo`, `src/app/api/party`: the API routes
- `src/app/mcp` and `src/server/mcp.ts`: the AI assistant connector
- `src/components/PrivacyReceipt.tsx`, `src/components/AreaVisual.tsx`: the "What we sent" receipt and the rounded-area drawing
- `src/app/privacy`: the in-app privacy page
