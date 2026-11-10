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

## Making money

Two kinds, both off until you set them, and neither tracks anyone:

- **Referral links.** "Order to go" (DoorDash, Uber Eats) and **Book a table** (an OpenTable search, shown only when Google says the place takes reservations) can carry your referral tag. Join each partner's affiliate program, then set `NEXT_PUBLIC_REFERRAL_DOORDASH`, `NEXT_PUBLIC_REFERRAL_UBEREATS` and `NEXT_PUBLIC_REFERRAL_OPENTABLE` in Vercel and redeploy. Each is either a tracking link with `{url}` where the destination goes, or plain parameters to append (`ref=zesthunt`); see `tagLink` in `src/lib/links.ts`. While any is set, the Let's go menu and the journey screen say "Zesthunt may earn a small fee from some links. Your price doesn't change." (needed for affiliate disclosure rules). The restaurant's own ordering site is never tagged.
- **Sponsored deals (our own ads).** Restaurants pay you directly to show a deal on their own card: a labeled **Sponsored** line ("10% off with code ZEST", optionally linked) on the card, in the Let's go menu and on the journey screen. It appears only when that place comes up on its own: it's attached after ranking (`src/server/sponsors.ts`), so a sponsor is never moved up, added, or shown to the ranker. Set `SPONSORS` in Vercel to a JSON list of `{ "placeId", "deal", "url"?, "until"? }` (the Google place ID; `until` is the last day, `YYYY-MM-DD`) and redeploy. Bad entries are skipped. No ad network, no scripts, no cookies: the deal is plain text sent with the pick.

`/api/health` shows how many sponsors are set up and which referral partners are tagged (yes or no). The privacy page explains both.

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

Photos go through `/api/photo` so the key stays server-side and the browser never contacts Google. Each one is a billed Places Photo call, so the route is rate-limited (120 a minute per IP) and the browser may keep a photo for an hour (`private`, so no CDN copies). A card's photo loads only after the card has been on screen for 0.4 seconds, so quickly skipped picks cost nothing; photos are fetched 800 px wide (sharp on phones, about half the bytes of 1200), and the place's color and food symbol stay up until the photo has actually arrived, then it fades in over a quarter of a second. Real places show Google's required credit on the photo: the photographer's name and "Google Maps".

`GET /api/health` reports what the deployment is running on (places, walk times, ranking, rooms) and returns 503 if it has fallen back to demo places or in-memory rooms. Point an uptime monitor at it.

### Limits

Every API route has a per-IP limit per minute: picks 40, party actions 60, party polling 150, photos 120, MCP 120. With Upstash configured, the counts are shared by all server instances. If Upstash can't be reached, each instance falls back to its own in-memory count. Live searches from the MCP connector also have a daily ceiling across all callers (`MCP_DAILY_LIMIT`). Also set a daily quota on the Google key in Google Cloud as the final backstop.

## Start simple, ask as you get closer

**On the journey screen:** **Want to come? Send to a friend** shares one place (name, dish, closing time, Maps link; never your location) from your own share sheet, lighter than a party. **Remember [place] for next time** (off by default) saves it on this phone only (`localStorage` key `zesthunt:wins:v1`, up to 5); next session, if it's open nearby, it comes first with "Your pick last time". ⋯ → Forget remembered places clears them.

Little touches along the way: the first card of a session leans left and right once so swiping is discovered rather than explained; the loading screen keeps you company ("Sniffing out what's open nearby…"); the journey screen notes how quickly you decided ("decided in 42 seconds", worked out on the phone); and a party reveal opens with a short "Counting the votes…" drum roll. Motion is skipped with `prefers-reduced-motion`.

**The card leads with the place.** The restaurant's name is the headline, with its rating, price and closing time right under it (no tap needed). The dish line shows only when it's specific to the place (from the AI ranking or the demo data); when it would only be a guess from the place's type, the card shows the type instead ("Indian restaurant") rather than presenting the guess as fact (`guessed` and `kind` on each pick). The first pick's photo loads straight away; later ones wait 0.4 seconds so quick skips cost nothing. On the first pick, four short tips show how it works (swipe for another, pull the card down or hold Let's go to aim and shoot, more or less like this, tap for more photos) until the first swipe or "Got it"; they're kept in memory only, so nothing is saved. When the area is only a rough guess, the area line offers **Use my location** in one tap.

The first screen is one pick, **Let's go** just above the bottom row, and three buttons: **👎 Less like this**, **search** and **👍 More like this**. Nothing to set up. The buttons sit beside the gestures, not instead of them:

- **Swipe left** for the next pick, **swipe right** to go back to the previous one. The whole card (photo and details together) moves and tilts. It works from the photo or the details (whose up-and-down scrolling stays separate). Just above the bottom buttons, one row is always in the same place: **‹ Back** on the left (faded on the first pick), and the keyboard's ← → do the same.
- **Telling picks apart.** A committed swipe throws the card off the side it was swiped to, and the next one slides in from the other side (from the left when going back), so moving on never looks like the same card springing back. While a photo loads (it waits 0.4 seconds so quick skips cost nothing), each place shows its own color and a big symbol for its food (🌮 🍜 🍣 🍕 🥗 ☕ …, from the category, place type or name; `src/lib/look.ts`), and the same symbol sits by the line under the name.
- **👍 More like this** (right of search, or press M) likes a pick: it's saved for this visit and the next one comes up; on a pick you already liked the button reads **Liked**, and tapping it takes it off. **Liked (n)** on the right of the row above opens "Places you liked": tap one to go back to it, ✕ to remove it. The search uses them: upcoming picks that look like what you liked (the same kind of food first, then price) move up straight away (`applyMaybes` in `src/lib/categories.ts`), the next searches send short hints like "more noodles", "around $$" (`likeSignals`; shown under "Liked hints" in What we sent) so the ranker and the rule-based order lean that way, and if you run out of new places your liked ones come back first. A like isn't a skip, so it never counts toward "fewer noodles". Likes live in memory only.
- **👎 Less like this** (left of search, or press L) moves on and steers away at once: one tap is enough to send "fewer tacos" for that kind of food (`lessSignals`), the places waiting in line move that kind behind the rest straight away, and "Got it: fewer tacos." confirms it. A plain swipe still moves on without saying anything; only repeated skips of the same kind add a hint ("fewer noodles" after two). Going back to a pick takes its "less like this" back too.
- **Pull the card down and let go**, like drawing a bow: from the photo, or from the details while they're closed, or open and scrolled to their top: there a downward drag draws the bow instead of rubber-banding the details (on iPhone too, where the touch is held back from scrolling only when it starts at the top and moves down; scrolling the details up stays native). The whole card, photo and details, stretches down with the pull. There are no words for it: the first pick leans left and right, then dips down once. While pulling, the card dims and the targets fan out in an arc across the top; a bow sits on the card with an arrow nocked on its string, the string drawing back as you pull, and a faint curve shows where the arrow will fly to the aimed target, whose ring fills as the pull tightens. Once letting go will fire, the ring, arrow and target turn orange, the target wiggles, a "Let go: Directions" tag appears and the phone buzzes; it also ticks each time the aim moves to another target. On release the string snaps, the card springs back, and the arrow flies the curve and strikes the target, which shakes and turns into a ✓ with a little burst of the place's food symbol and a buzz (about 0.6 seconds in all). **Moving sideways aims** (`src/lib/aim.ts`): straight down is **All options** (the journey screen), a little left is **Directions** (opens your maps app), further left is **Order to go** (the restaurant's site, or the journey screen with DoorDash / Uber Eats showing), and right is **Call** ("Call to reserve" when Google says it takes reservations). The aimed target grows, turns orange with a buzz once the pull is far enough, and fires on release; every choice also opens the journey screen. Targets that don't apply (no phone number, dine-in only) aren't shown. **Let's go** does both: a quick tap (or ↓) opens the same choices as a menu (Head there, Order to go, Call to reserve, All the details), and **pressing and holding** draws the same bow over the card: the button fills as the string draws back ("Aim…", then "Let go to shoot" with a buzz once it's full), sliding your finger left or right aims, and letting go shoots at the aimed choice. Letting go before it's drawn puts the bow down without doing anything (`src/components/BowButton.tsx`).
- **Searching** fades everything else back: just "What sounds good?", the quick cravings, the box and the search button. Tap outside or press Escape to close. The browser's own pull-to-refresh is turned off so it doesn't get in the way.
- **Swipe up on the details** (while closed) to open them.
- **Tap the photo** to flip through the place's photos (dots show how many). Google doesn't say which photos show food, so the order is a free best guess (`foodFirst` in `src/server/places.ts`): photos posted by visitors first (diners mostly photograph their plates), then the business's own, and Google's cover photo (usually the storefront) last. The storefront itself appears in the details.
- **The journey screen** puts the actions first: the place's storefront (or photo) at the top, then **Head there**, **Order to go** and **Call to reserve** (or **Call them**), and **Book a table** when Google says it takes reservations. How to pay, sending it to a friend, splitting the bill and "Remember for next time" sit under one **More** row. Phone number and reservations come from the same Places request as everything else, at no extra cost.

Options arrive when behaviour says they'd help:

1. **Open:** the photo, the walk time, the dish, the place and when it closes. Everything else (what you eat, parties, privacy receipt, area, steering) is in the **⋯** menu. The ⋯ shows a small count when food choices are on.
2. **After three skips in a row:** one small chip appears over the photo with a single guess from what the last three skips have in common (`src/lib/steer.ts`): "Not quite? **Something cheaper?**" if most were pricey, "Something quicker?" if most were far, otherwise the other way from what they lean toward (heavy skips → "Something lighter?"), or "Surprise me?" when there's no clear lean. One tap steers, with a short vibration, a soft wash of colour over the next pick and "Lighter it is. New picks on the way." The sliders button opens the full row (**Lighter, Heartier, Quicker, Cheaper, A treat, Surprise me**). An ignored chip fades after 6 seconds and stays away for four more skips, and it never shows while the details are open. "Can't eat here?" now lives in a pick's details, and "Somewhere else" on the area line and in the menu. The full row is always in the menu as "Steer the picks".
   - **Can't eat this** skips the pick and opens "What do you eat?" with what that dish hints at offered first ("Based on this pick, maybe: No meat or fish / Keep away from shellfish"). So food needs are asked for when they matter, not up front.
3. **Lingering on a pick** (4 seconds) or tapping **Details** opens the rest, in its own panel below the photo: rating, price, payment, the "More like this" chips and the plate estimate, then (scrolling) the About section with the storefront photo, the address with a **Map** link, hours, what it offers and links to the menu and website.
4. **After going:** if no allergies are set, **"Anything to keep away from?"** with one-tap chips (picks refresh when you go back), and **"Eating with others? Decide together"**, which opens a party with this pick in the deck.

The area line appears only when it matters: a rough IP guess ("San Francisco (approx.) · Change"), a search that has gone farther than a walk ("· short drive", "· longer drive"), or an active craving.

## Finding the right food

- **Where:** when the area is a rough guess or widened to a drive, a line under the top bar says so ("San Francisco (approx.) · Change"). **Change**, the menu's "Change area" or "Somewhere else" opens the neighborhood/ZIP field or "Use my location". A typed area replaces the device location.
- **Craving:** tap the search button (center) and type, hold it and speak, or tap a shortcut (they change with the meal: coffee and bagels in the morning, pizza and ramen at dinner; meat-led ones are hidden for vegetarian and vegan diets). The craving shows as a chip under the top bar and applies to every refill until you clear it with ✕. Steering (Lighter, Heartier…) keeps it.
- **Rating:** the card shows the Google rating and count ("★ 4.6 (1.2k)"). Claude and the rule-based ranking use it only as a tie-breaker.
- **Menu, photos and reviews:** a link on the locked-in screen opens the place on Google Maps.
- **Every chip is a way forward:** the dish type and health labels on the card are buttons. "More noodles" searches for noodles nearby, and "Protein", "Veg" and "Whole grain" search for high-protein, veggie and whole-grain places. They set the craving, so ✕ on the craving chip goes back to plain picks. (In a party they're plain labels, since cravings are solo-only.)
- **Notices float, nothing jumps:** "Got it: fewer salads" and other notices appear over the top of the photo, in place of the swipe-count badge, and **Back** sits in the photo's top-left corner whenever there's a pick to return to. Neither pushes the card or the buttons around.
- **All about the place:** opened details scroll on their own (the photo stays the swipe surface): Google's short description, the address and how far, hours, takeout / delivery / vegetarian options, and links to the menu, photos and reviews on Google Maps and to the restaurant's site. Only what Places reports is shown.
- **Never out of picks:** refills go one ring farther whenever the closer ones have been seen, and say so. After the farthest ring, the hunt goes round again: "That's everything open around you. Here's a second look at the ones you passed." Each passed place comes back once per round, marked "Second look", in the order first shown (with skip signals still applied); only a place that would now close before you got there is left out. The empty screen (short drive, other directions, ordering in) is left for when nothing at all is open within 50 km.

## The queue

- The phone holds ~10 picks so skips never wait. When 3 remain it quietly asks for more, excluding everything already seen.
- **Skip signals:** each pick has a coarse dish category. After 2 skips of the same kind, the phone forms a hint ("fewer noodles", "shorter walks", "cheaper places"). It reorders what's left right away and sends the hint with the next request. Skips themselves never leave the device.
- **Moods (steering):** Lighter, Heartier, Quicker, Cheaper and A treat map to the fresh, comfort, fast, cheap and treat moods. Switching re-sorts the picks already loaded, so it's instant, then streams mood-specific picks behind them.
- **Shake:** two sharp jolts trigger a wildcard pick from another mood. iOS needs motion permission, which is requested on the first tap of **Surprise me**.
- **Voice:** holding the search button uses the Web Speech API with `processLocally = true`. The spec requires on-device recognition in that mode and fails rather than uploading audio. Browsers without on-device speech (currently Safari, Firefox and older Chrome) open the text field instead. Only the transcribed text is sent.

## Hunt party

The headline feature, so it has its own button: **Hunt together** in the top bar (also in the ⋯ menu and on the journey screen). A group works like solo: the same swipes, the same photo, the same search.

1. **One tap to start.** The room opens with the picks in hand and the invite shows straight away: a **QR code** (drawn on the phone, for friends standing nearby), the code, **Share link** (share sheet, or copies the link) for everyone else, and the name you were handed (**"You're Ramen to the group" · Rename**). Links look like `zesthunt.com/#p=CODE`; the code sits after the `#`, so it never reaches the server or its logs.
2. **No form to join.** Opening the link joins straight away with a food name ("Taco", "Dumpling"…), renamable from Invite.
3. **Answering is one tap.** Every place gets three always-visible buttons: **Not for me**, **👍 OK** and **♥ Love it** (or press 1 / 2 / 3; pulling the photo down is Love it). Answering moves on to the next place. Your answer shows on the card ("♥ You love it") and stays highlighted on its button; go back (swipe right or ‹) and tap another to change it ("Changed to OK."). Swiping left moves on without answering.
   **Wishes.** When you join (or start) a group, a quick sheet asks what would work for you: budget ($ / $$ / $$$ / Any), how far (walking distance / a short drive / either) and up to three food words from the fixed shortcut list (`src/lib/wishes.ts`). Each person's wishes are stored separately, but the room only ever returns a combined, nameless summary: the lowest budget, walking if anyone wants to walk, and the most-wanted food words. The party bar shows it ("Group wishes: $$ or less · walking distance · ramen"), places that fit get a **✓ Fits the group's wishes** chip, and the host's phone adds up to six places that fit everyone to the end of the list. **Wishes** in the bar changes yours any time.
   **Anyone can add a place.** **+ Add** in the bar searches ("ramen"); swipe through what turns up and pull one down (or **Add**) to add it to everyone's list with your Love it (`add` action; a place already on the list just gets it). Everyone else sees a quiet "A new place was added to vote on: Rice & Ramen Co.", never who added it.
4. **Secret ballot.** Nobody sees anyone else's answers until the result, so one person's pick can't sway the rest. The server enforces it: room state carries only your own answers (`myAnswers`) until there's a result.
5. **How it ends, fast.** As soon as enough people **love** the same place (everyone up to 3 people, all but one from 4) it's an instant match. Otherwise, **the moment everyone has answered every place** the result shows, with no waiting for the timer: most points win (Love it 2, OK 1, Not for me 0), then fewer "Not for me", then whichever came first. If time runs out first, the same rule picks from what's been answered (12 seconds before the end); **Reveal now** ends it early, and in the last 2 minutes the bar also offers a one-time **+5 min**. The results screen shows "The group picked…", "1 love it · 1 OK of 2", who was in, and the runners-up with their love / OK counts, then **Let's go to …**. If you finish first: "You've answered every place." with who you're waiting on ("Waiting on 1 person · 1 of 2 done. The result shows by itself when everyone's finished."), then **Show the result now**, explained underneath ("Ends the vote for everyone and picks the place with the most points so far"), which takes a second tap to confirm ("Tap again to end the vote for everyone" / Keep waiting), plus **+ Add a place** and **Go back through them**. In a group, the row above the answers shows **‹ Back**, where you are ("3 of 8") and **Skip ›** (move on without answering).
6. **You decide what you can eat; we never remove a place on a guess.** Each phone reads the cards against its owner's "What I eat" (`src/lib/partyFit.ts`: Google's vegetarian flag, plus the place's name, type and dish) and shows a **private note** on cards that might not fit: "Heads up: this looks meat-focused. It may still work for you. Only you see this." Beside it, **Can't eat this? Remove it for everyone** lets the person decide. Removals are anonymous (`unfit` action, card IDs only): the place drops out for everyone, doesn't count toward "voted", can't match or win, and everyone sees "1 place removed: someone can't eat there, or it closes too soon." If removals leave fewer than 6 places, the host's phone fetches more.
7. **Time to get there.** The only automatic removal, and only when it's certain: a place you'd reach (after the 10-minute vote and your own trip) with under 10 minutes before closing. Shorter-than-comfortable windows stay, with a private "Heads up: it closes about 20 min after you'd get there." Solo uses the same rule: places you'd reach with under 10 minutes left are left out; the rest keep their "Closes in N min" warning.
8. **An open list.** The list starts with the picks in hand and grows when someone adds a place or makes a request.
9. **Requests.** **Request** in the party bar (or ⋯ → Request something different) opens "Ask the group for something different": Lighter, Heartier, Quicker, Cheaper or A treat. Only that word goes to the room. The host's phone (the one with a location) fetches a few places that fit and adds them to the end of everyone's list, so nothing is skipped and everyone still votes on every card. Everyone sees "Taco asked for heartier places…" and then "4 heartier places added to the end of the list." Rooms opened by an AI assistant have no host, so Request isn't offered there.
10. **Privacy.** Rooms have a hard 10-minute TTL from creation (15 with the one-time extension) that activity doesn't extend. Starting a group is one sheet: the host's own wishes sit at the bottom of the invite sheet; guests get the wishes sheet as they join. The bar shows "2 of 3 done" (who has answered every place, never what they answered). A room holds only the code, nicknames (plus a hashed join key), restaurant cards, answers, each person's wishes (budget, distance, food words from a fixed list; only a nameless summary is ever returned), the match, the latest nudge word, whether time was added, and which places don't fit someone (no who, no why). Never location, cravings, typed text or travel times; each device works out its own walk time.
11. Party traffic goes through one `POST /api/party` endpoint (create, join, state, swipe, wishes, cards, add, rename, reveal, extend, steer, unfit) so codes and keys stay out of URLs. Members poll every 2 s.

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
| Next pick | swipe left (on the photo or the details), or **Next** in a group | → |
| Less like this (move on and steer away) / More like this (like it, save it, lean that way) | **👎 Less like this** / **👍 More like this** beside search | L / M |
| Back to the previous pick | swipe right, or **‹** on the photo | ← or Backspace |
| Go (start the journey) / vote in a group / add a searched place | pull the card down and let go, or tap **Let's go** (a menu of choices) / **Vote** / **Add** | ↓ |
| Aim at directions, ordering or calling | while pulling down, or holding **Let's go**, move left (directions, further for ordering) or right (call) before letting go | (the journey screen has them all) |
| Next photo of the place | tap the photo | (each photo is described for screen readers) |
| Search for more of one kind | tap a chip on the card ("More noodles", "Veg") | Tab to it, Enter |
| Steer (Lighter, Heartier…) | **Not quite?** chip after three skips (sliders for all choices), or ⋯ → Steer the picks | Tab to it, Enter |
| See details | tap **Details**, or linger on a pick | Tab to it, Enter |
| What you eat and allergies | ⋯ → **What I eat** (a small count shows how many choices are on, never the choices themselves), or **Can't eat this** | Tab to it, Enter |
| Start a hunt party | **Hunt together**, ⋯ → **Hunt together**, or on the journey screen | Tab to it, Enter |
| Search a craving (in a group: find a place to add) | tap the search button (center) | Tab to it, Enter |
| Surprise (wildcard) | **Surprise me** in the full steer row, or shake the phone | Tab to it, Enter |
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
