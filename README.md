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

With no keys, the app runs in **demo mode**: the same `/api/picks` stream serves fictional places, and a "Demo" badge shows next to the logo.

For real places, copy `.env.example` to `.env.local` and fill in:

| Variable | What it's for |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Places API (New) and Geocoding API (plus Routes API if `USE_ROUTES_API=true`). Server-side only. |
| `ANTHROPIC_API_KEY` | Ranks and describes picks. Without it, picks use rule-based descriptions from the place type. |
| `ANTHROPIC_MODEL` | Optional. Which model ranks picks: `haiku` (default, about $1 per 1,000 searches), `sonnet` (about $20), `opus` (about $35), `off` (free rule-based picks, no AI), or any full model ID. Rough costs; for comparison, the Google place search is about $35–40 per 1,000 after the free tier. On Vercel, change it under Settings → Environment Variables and redeploy; `/api/health` shows which one is live. |
| `USE_ROUTES_API` | Optional. `true` uses the paid Google Routes API for walk and drive times. Off by default: times are estimated from distance and shown with "~". |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Party rooms and rate limits. Needed on Vercel; locally, both live in memory. |
| `MCP_DAILY_LIMIT` | Optional. Most live place searches the `/mcp` connector may run per UTC day, across all callers. Defaults to 2000. |

Locally there is no IP geolocation, so the app asks for a neighborhood or ZIP (or your location) on first open. On Vercel it starts from the city-level `x-vercel-ip-*` headers.

## How a pick is made

`POST /api/picks` streams newline-delimited JSON (`meta`, `pick`…, `done`):

1. **Where:** the device location rounded to ~1 km, else a typed neighborhood/ZIP (Geocoding), else the platform's city-level IP estimate, else ask.
2. **What's open:**
   - **With a craving** ("ramen"): Places Text Search for it, open now, near the area. Two or more matches within 1.5 km → walk; otherwise matches within 8 km → drive. No (more) matches → everything open, starting close by again, and the phone says so ("Nothing for “ramen” open nearby, so here's what is", or "That's every “ramen” place nearby. Here's everything else open.") and drops the craving. Craving searches are never cached.
   - **Otherwise, ring by ring** (`src/lib/reach.ts`): walking distance (1.5 km), a short drive (8 km), a longer drive (20 km), a long drive (50 km, the Places maximum). In each ring: the 20 nearest (on foot) or most popular (driving) open places. When fewer than 10 are new after the phone's exclude list, it adds the other 20, then a Text Search for the mood ("salad poke healthy bowl" for Fresh, and so on), then the other moods' searches. Still thin (under 5 on foot, under 3 driving) → the next ring out, keeping what it found. The phone sends back the ring it reached, so refills never search closer rings again, and says when it goes farther ("You've seen what's open within walking distance. Now looking a short drive away."). "Try a short drive" asks for the 8 km ring directly. The `/mcp` connector stops at a short drive.
   - Cached per ~1 km area for 5 minutes. The field list includes rating, rating count and the Google Maps link, which are in the same billing tier as the fields already requested.
3. **How far:** estimated from straight-line distance by default (free, shown with "~"). With `USE_ROUTES_API=true`, the Routes API route matrix (walking), falling back to the estimate if it fails.
4. **Rank and describe:** Claude picks only from those places, with output streamed as structured JSON. Each pick is sent to the phone as soon as its object closes, then validated with Zod. Invented IDs, duplicates, "they serve…" claims, and calorie or diet talk are dropped or replaced. If Claude is slower than 2.5 s for the first pick, a rule-based pick shows first.

Prompts and the output schema are in [`src/server/prompts.ts`](src/server/prompts.ts). Claude never receives coordinates, addresses or IPs.

Photos go through `/api/photo` so the key stays server-side and the browser never contacts Google. Each one is a billed Places Photo call, so the route is rate-limited (120 a minute per IP) and the browser may keep a photo for an hour (`private`, so no CDN copies). A card's photo loads only after the card has been on screen for about a second, so quickly skipped picks cost nothing. Real places show Google's required credit on the photo: the photographer's name and "Google Maps".

`GET /api/health` reports what the deployment is running on (places, walk times, ranking, rooms) and returns 503 if it has fallen back to demo places or in-memory rooms. Point an uptime monitor at it.

### Limits

Every API route has a per-IP limit per minute: picks 40, party actions 60, party polling 150, photos 120, MCP 120. With Upstash configured, the counts are shared by all server instances. If Upstash can't be reached, each instance falls back to its own in-memory count. Live searches from the MCP connector also have a daily ceiling across all callers (`MCP_DAILY_LIMIT`). Also set a daily quota on the Google key in Google Cloud as the final backstop.

## Start simple, ask as you get closer

**After Let's go:** **Want to come? Send to a friend** shares one place (name, dish, closing time, Maps link; never your location) from your own share sheet, lighter than a party. **Remember [place] for next time** (off by default) saves it on this phone only (`localStorage` key `zesthunt:wins:v1`, up to 5); next session, if it's open nearby, it comes first with "Your pick last time". ⋯ → Forget remembered places clears them.

Little touches along the way: the first card of a session leans left and right once so swiping is discovered rather than explained; the loading screen keeps you company ("Sniffing out what's open nearby…"); the locked-in screen notes how quickly you decided ("decided in 42 seconds, 3 swipes", worked out on the phone); and a party reveal opens with a short "Counting the votes…" drum roll. Motion is skipped with `prefers-reduced-motion`.

The first screen is one pick and three buttons: **Another**, **search** and **Let's go**. Nothing to set up. Options arrive when behaviour says they'd help:

1. **Open:** the photo, the walk time, the dish, the place and when it closes. Everything else (what you eat, parties, privacy receipt, area, steering) is in the **⋯** menu. The ⋯ shows a small count when food choices are on.
2. **After two skips in a row:** a **"Not quite? Steer the next picks"** row slides in under the logo: **Lighter, Heartier, Quicker, Cheaper, A treat** (the five moods, worded as a nudge), **Surprise me**, **Can't eat this** and **Somewhere else**. One tap closes it; ✕ hides it for a few more skips. It's always in the menu as "Steer the picks".
   - **Can't eat this** skips the pick and opens "What do you eat?" with what that dish hints at offered first ("Based on this pick, maybe: No meat or fish / Keep away from shellfish"). So food needs are asked for when they matter, not up front.
3. **Lingering on a pick** (4 seconds) or tapping **Details** opens the rest: rating, price, payment, the "More like this" chips and the plate estimate.
4. **After Let's go:** if no allergies are set, **"Anything to keep away from?"** with one-tap chips (picks refresh when you go back), and **"Eating with others? Decide together"**, which opens a party with this pick in the deck.

The area line appears only when it matters: a rough IP guess ("San Francisco (approx.) · Change"), a search that has gone farther than a walk ("· short drive", "· longer drive"), or an active craving.

## Finding the right food

- **Where:** when the area is a rough guess or widened to a drive, a line under the top bar says so ("San Francisco (approx.) · Change"). **Change**, the menu's "Change area" or "Somewhere else" opens the neighborhood/ZIP field or "Use my location". A typed area replaces the device location.
- **Craving:** tap the search button (center) and type, hold it and speak, or tap a shortcut (they change with the meal: coffee and bagels in the morning, pizza and ramen at dinner; meat-led ones are hidden for vegetarian and vegan diets). The craving shows as a chip under the top bar and applies to every refill until you clear it with ✕. Steering (Lighter, Heartier…) keeps it.
- **Rating:** the card shows the Google rating and count ("★ 4.6 (1.2k)"). Claude and the rule-based ranking use it only as a tie-breaker.
- **Menu, photos and reviews:** a link on the locked-in screen opens the place on Google Maps.
- **Every chip is a way forward:** the dish type and health labels on the card are buttons. "More noodles" searches for noodles nearby, and "Protein", "Veg" and "Whole grain" search for high-protein, veggie and whole-grain places. They set the craving, so ✕ on the craving chip goes back to plain picks. (In a party they're plain labels, since cravings are solo-only.)
- **Notices float, nothing jumps:** "Got it: fewer salads" and other notices appear over the top of the photo, in place of the swipe-count badge, and **Back** sits in the photo's top-left corner whenever there's a pick to return to. Neither pushes the card or the buttons around.
- **Never out of picks:** refills go one ring farther whenever the closer ones have been seen, and say so. After the farthest ring, the hunt goes round again: "That's everything open around you. Here's a second look at the ones you passed." Each passed place comes back once per round, marked "Second look", in the order first shown (with skip signals still applied); only a place that would now close before you got there is left out. The empty screen (short drive, other directions, ordering in) is left for when nothing at all is open within 50 km.

## The queue

- The phone holds ~10 picks so skips never wait. When 3 remain it quietly asks for more, excluding everything already seen.
- **Skip signals:** each pick has a coarse dish category. After 2 skips of the same kind, the phone forms a hint ("fewer noodles", "shorter walks", "cheaper places"). It reorders what's left right away and sends the hint with the next request. Skips themselves never leave the device.
- **Moods (steering):** Lighter, Heartier, Quicker, Cheaper and A treat map to the fresh, comfort, fast, cheap and treat moods. Switching re-sorts the picks already loaded, so it's instant, then streams mood-specific picks behind them.
- **Shake:** two sharp jolts trigger a wildcard pick from another mood. iOS needs motion permission, which is requested on the first tap of **Surprise me**.
- **Voice:** holding the search button uses the Web Speech API with `processLocally = true`. The spec requires on-device recognition in that mode and fails rather than uploading audio. Browsers without on-device speech (currently Safari, Firefox and older Chrome) open the text field instead. Only the transcribed text is sent.

## Hunt party

The headline feature, so it has its own button: **Hunt together** in the top bar (also in the ⋯ menu and on the screen after Let's go).

1. **One tap to start.** The room opens with the picks in hand and the invite shows straight away: a **QR code** (drawn on the phone, for friends standing nearby), the code, **Share link** (share sheet, or copies the link) for everyone else, and the name you were handed (**"You're Ramen to the group" · Rename**). Links look like `zesthunt.com/#p=CODE`; the code sits after the `#`, so it never reaches the server or its logs.
2. **No form to join.** Opening the link joins straight away with a food name ("Taco", "Dumpling"…), renamable from Invite.
3. **Clear voting.** In a party the bottom bar is **Pass** and **♥ Vote for it** (swipe left/right works too, stamped PASS / VOTE), with "3/8 voted" in the middle. A one-line tip says so when you start or join.
4. **Secret ballot.** Nobody sees anyone else's votes until the result, so one person's pick can't sway the rest. The server enforces it: room state carries only your own votes (`myVotes`) until there's a match. The bar shows only who's finished ("🔒 Votes are secret · 2 of 3 done", ✓ on avatars), and going Back to a card you voted for shows "♥ You voted".
5. **The reveal.** A card everyone's in on (all but one from 4 people) is an instant match. Otherwise, when you've voted on every card, **Reveal results** (with who's still voting, if anyone) picks the most-liked card. In the last 2 minutes the bar offers Reveal results and a one-time **+5 min**. The results screen shows "The group picked…", how many voted for it and who, and the runners-up, then **Let's go to …**.
6. **You decide what you can eat; we never remove a place on a guess.** Each phone reads the cards against its owner's "What I eat" (`src/lib/partyFit.ts`: Google's vegetarian flag, plus the place's name, type and dish) and shows a **private note** on cards that might not fit: "Heads up: this looks meat-focused. It may still work for you. Only you see this." Beside it, **Can't eat this? Remove it for everyone** lets the person decide. Removals are anonymous (`unfit` action, card IDs only): the place drops out for everyone, doesn't count toward "voted", can't match or win, and everyone sees "1 place removed: someone can't eat there, or it closes too soon." If removals leave fewer than 6 places, the host's phone fetches more.
7. **Time to get there.** The only automatic removal, and only when it's certain: a place you'd reach (after the 10-minute vote and your own trip) with under 10 minutes before closing. Shorter-than-comfortable windows stay, with a private "Heads up: it closes about 20 min after you'd get there." Solo uses the same rule: places you'd reach with under 10 minutes left are left out; the rest keep their "Closes in N min" warning.
8. **A fixed ballot.** The deck is the picks the party started with, so everyone can finish it. New cards arrive only from a request.
9. **Requests.** **Request** in the party bar (or ⋯ → Request something different) opens "Ask the group for something different": Lighter, Heartier, Quicker, Cheaper or A treat. Only that word goes to the room. The host's phone (the one with a location) fetches a few places that fit and adds them to the end of everyone's list, so nothing is skipped and everyone still votes on every card. Everyone sees "Taco asked for heartier places…" and then "4 heartier places added to the end of the list." Rooms opened by an AI assistant have no host, so Request isn't offered there.
10. **Privacy.** Rooms have a hard 10-minute TTL from creation (15 with the one-time extension) that activity doesn't extend. A room holds only the code, nicknames (plus a hashed join key), restaurant cards, swipes, the match, the latest nudge word, whether time was added, and which places don't fit someone (no who, no why). Never location, cravings, typed text or travel times; each device works out its own walk time.
11. Party traffic goes through one `POST /api/party` endpoint (create, join, state, swipe, cards, rename, reveal, extend, steer, unfit) so codes and keys stay out of URLs. Members poll every 2 s.

## Paying (without Zesthunt touching money)

There's no checkout, no stored cards and no payment processor. Three things only:

1. **How to pay:** from Google Places `paymentOptions`, shown where it helps rather than on the photo: a quiet "Pays by tap or card" line in a pick's Details ("Cash only" stands out, since it can change your mind), and chips on the locked-in screen ("Tap to pay", "Cards", "Cash only", plus "Online ordering"). In a party it's hidden while voting and appears on the results screen. If Places doesn't say, nothing is shown.
2. **Split the bill:** on the locked-in screen (open by default after a party match, with the head count prefilled). Type the total and the number of people, and the phone works out each share in whole cents that add up exactly. **Send the split** opens the native share sheet with a ready message for Venmo, Cash App, Apple Cash or a text (or copies it where sharing isn't supported). Nothing is sent to the server. Amounts are shown in USD for now.
3. **Order ahead:** links to the restaurant's own site when Places says it does takeout or delivery, otherwise to a DoorDash or Uber Eats search for that place. If Places says neither, it just says "Dine-in only". Payment happens on those sites.

## Privacy and accessibility

[PRIVACY.md](PRIVACY.md) lists exactly what is processed and where. The short version is also in the app at `/privacy`.

- **"What we sent":** the footer's lock button opens a receipt built from the exact request body that last left the phone. It shows the rounded area on a drawn map (your exact spot as a dot that stays on the phone), the time without a date, mood, diet, craving and skip hints. It also lists what wasn't sent, which services got what, and the raw JSON.
- **Nothing persisted** except the opt-in "Remember this on this device" under **What I eat** (`localStorage` key `zesthunt:dietary:v1`, diet and allergy selections only). **Forget me** deletes it instantly.
- **What you eat is a hard rule:** the panel asks "What do you eat?" and words every choice as food ("No meat or fish", "Nothing from animals", "No gluten"; allergies under "Keep away from"), never as a label for the person. The stored values (`Vegetarian`, `Vegan`…) are unchanged, so saved choices and server rules still work. Places that can't meet a choice are filtered out, and any suggestion naming meat or fish that it excludes is replaced. With allergies set, the locked-in screen says "Check allergens with the restaurant."
- **Strict headers:** a same-origin-only Content-Security-Policy, `frame-ancestors 'none'`, `nosniff`, COOP, a minimal `Permissions-Policy`, `Referrer-Policy: no-referrer` on every response, and `no-store` on the API.
- **Logs** never include request bodies. Failures log only the error type or a service status like `places 403`.
- **Accessibility:** real buttons and labels throughout, 44px minimum touch targets, keyboard support (← → Backspace, Escape closes the menu and sheets), live regions for notices, focus moved to the locked-in heading, AA contrast on the colour pairs we checked, and `prefers-reduced-motion` turns off the photo develop-in, confetti and route animations.

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
| Steer (Lighter, Heartier…) | **Not quite?** row after two skips, or ⋯ → Steer the picks | Tab to it, Enter |
| See details | tap **Details**, or linger on a pick | Tab to it, Enter |
| What you eat and allergies | ⋯ → **What I eat** (a small count shows how many choices are on, never the choices themselves), or **Can't eat this** | Tab to it, Enter |
| Start a hunt party | ⋯ → **Decide with friends**, or after Let's go | Tab to it, Enter |
| Search a craving | tap the search button (center) | Tab to it, Enter |
| Surprise (wildcard) | **Surprise me** in the Not quite? row, or shake the phone | Tab to it, Enter |
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
