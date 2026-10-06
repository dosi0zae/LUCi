# Trip Chain Implementation Checklist

This project is implemented one phase at a time. A phase must be initialized, reviewed, and verified before the next phase begins.

## Phase Gate Rules

- Do not generate the whole product at once.
- Keep each phase scoped to the MVP order from the product brief.
- After each phase, review architecture, readability, scalability, and maintainability.
- Record verification commands and any known limitations before moving on.

## MVP Phases

- [x] 1. Initialize project
- [x] 2. Design system
- [x] 3. Global layout
- [x] 4. Fullscreen interactive map
- [x] 5. Marker system
- [x] 6. Place detail cards
- [x] 7. Trip Chain builder
- [x] 8. Trip publishing
- [x] 9. Trip detail page
- [x] 10. Explore feed
- [x] 11. User authentication
- [x] 12. User profiles
- [x] 13. Social features
- [x] 14. Ranking
- [x] 15. Database integration
- [x] 16. Admin dashboard
- [x] 17. Optimization
- [x] 18. Refactoring
- [x] 19. Documentation

## Phase Reviews

### Mobile Phase AZ: "체인" → "코스" Wording and Intro Splash

Status: Complete

- [x] Replaced user-facing "체인" with "코스" across ko strings (hero, placeholder, aria labels, tour, empty states, publish/delete copy), fixed Korean particles, and the seed trips in `mobile-data.ts`; en/ja leftovers ("chain"/"チェーン") now say course/コース.
- [x] "체인" now surfaces only subtly: hero tagline ("체인처럼 이어, 코스로 추천합니다", with en/ja/zh equivalents), and the Trip Chain brand. (A chain-link icon between cards was tried and removed — it looked off.)
- [x] Reused the desktop `IntroSplash` (blue blur + bloom logo) as the mobile app's initial transition screen.
- [x] Intro splash is contained to the phone-sized frame (`IntroSplash contained`) with the logo at half size; hero tagline reworded to "서울의 매력적인 장소와 경험을 잇고, 하나의 여행으로 연결합니다." (4 locales).
- [x] A chain loading overlay was prototyped and removed (user didn't like the look). Real `/api/recommend` latency measured at ~2.6–3.7s (two Gemini calls).
- [x] `tsc --noEmit` and `lint` pass (2 pre-existing `no-img-element` warnings).

### Mobile Phase AY: "근처" Panel on Each Chain Card (meeting item 4)

Status: Complete

Scope — meeting feedback that the bottom "다른 장소도 볼까요?" area feels detached from the chain and the map: let a stop's own card unfold its nearby options, show them on the map, and add one straight into the chain.

- The toggle is a map-pin-with-plus icon button (`MapPinPlusIcon`) at the left end of each card's button group, same 28px square style as pin/swap/delete (order: nearby · pin · swap · delete); open state gets a blue outline. It went through two earlier looks first — a plain blue "근처 ▾" text link on the subtitle line (read as part of the place's description, not an action) and an outlined "＋ 근처" pill (still not icon-like) — before landing on an icon after comparing six candidates side by side. Four buttons fit on a 375px card with names still readable. i18n key is now `nearbyToggleAria` (label/tooltip only). It opens an accordion panel (one at a time) under that card listing the 5 closest places not already in the chain — never on a stop's exact coordinate, and inside the named district if the course has one — each with a photo, distance ("229m"/"1.2km"), a letter A–E and a "+ 담기" button. Tapping the row opens the place sheet.
- **Map link**: `ConstellationCard` takes a new `suggestions` prop and draws those places as white, blue-ringed lettered markers (A–E; letters so they can't be mistaken for the numbered stops) and widens the view to include them; closing the panel removes them. The shell memoizes the prop, and `ConstellationCard` uses a shared empty default, because `suggestions` is an effect dependency — a fresh array per render would rebuild the overlays and reset any pan/zoom on every re-render.
- Adding from the panel goes through the normal `addToChain` (so it lands in its shortest-walk slot, pins respected) and the panel stays open with the next-nearest options, so several can be added in a row. Panel opening animates `grid-template-rows` 0fr→1fr (`nearby-panel-in`, reduced-motion aware), so the cards below follow it down smoothly.
- The FLIP slide cache goes stale when a panel moves cards without changing the order: it's dropped while a panel is opening and re-measured on its `animationend` (and immediately on close). Verified a delete after an open/close still slides the cards the right distance (70px = one card + gap).
- Gotcha found while testing: the global, unlayered `button { font: inherit }` beats Tailwind's layered utilities, so `text-sm font-extrabold` placed on a `<button>` silently does nothing — typography for the new buttons lives on inner spans (matching how the rest of this file already does it).
- i18n: `nearbyToggle`, `nearbyHeading` ("{name} 근처에서 더 담아보기"), `nearbyEmpty` in ko/en/ja/zh.

Verification:

- Passed: `pnpm exec tsc --noEmit`, `pnpm lint` (pre-existing `no-img-element` warnings only)
- Passed: browser — opening 건청궁's panel lists 5 places by distance with letters, A–E markers appear on the map, cards below shift down and the card above doesn't; "+ 담기" on A inserts it at its best slot (3rd) while the panel stays open with the next five; collapsing removes the markers
- Not checked: touch behavior and the panel on very small screens

### Mobile Phase AX: Chain Cards — Pin, Per-Stop Swap, and Real Reorder Motion

Status: Complete

Scope — from the 10/2 meeting (손잡이와 ↑↓ 중복, 카드 핀 고정, 카드별 새로고침) plus the user's note that drag-reordering gave no visible motion, so it was hard to tell it worked.

- ↑/↓ buttons replaced by **핀** (pin) and **교체** (swap); reordering is drag-only via the grip. Pinned stop: blue border, filled pin, grip and swap disabled. `reorderChainTo` keeps pinned stops in their slots and deals the unpinned ones into the rest (dragging past a pin hops over it); the "최적 경로" button now calls new `optimizeRoutePreservingPins` (recommend-engine.ts), which brute-forces the unpinned ordering (≤7) with pinned stops as fixed waypoints, else falls back to optimize-then-fill. Pins and swap history are dropped by a single `replaceChain()` that every wholesale chain replacement (new search, refresh, radius step, loaded trip, ...) now goes through.
- **Swap** (`pickReplacementStop`, local/instant, no Gemini): replaces just that stop in place with a nearby alternative — scored by distance to the neighbors/old stop, same category, and fameScore, respecting a named district; picks randomly among the top 4 and remembers places already swapped out so repeated presses cycle. No candidate → the existing inline message line says so.
- **Motion**: (1) FLIP in a `useLayoutEffect` on `chainIds` — any card whose slot changed (drag, delete, swap, insert) slides 240ms from its old position instead of teleporting; (2) the dragged card now follows the pointer (translateY + slight scale/shadow) with slot geometry taken from untransformed offsets so it can't feed back into its own hover target and flicker, then settles into its slot on release; (3) fixed a latent bug — the `chain-card-in` entrance class used to be on every card permanently, so DOM moves during a reorder could replay the fade-in; it's now dropped per card once its entrance finishes (`enteredIds`). `prefers-reduced-motion` skips the slides.
- Follow-up: the "최적 경로" button (and `OptimizeRouteIcon`, `optimizeRouteAria/Title`) is gone; shortest-walk order is now the default. `autoOrder()` runs whenever a stop is added or swapped in — insertion still goes through `findBestInsertionIndex`, then `optimizeRoutePreservingPins` re-sorts the unpinned stops (pinned ones stay put). Chains longer than `EXACT_ROUTE_MAX` (7, now exported) keep the cheapest-insertion order since the only optimizer left for them is a greedy approximation that would scramble a long hand-built chain. Not re-ordered automatically: deleting a stop, dragging, and loading a published/shared trip (the author's order is intentional) — and a hand-dragged order survives a later add only if the stops are pinned. The pin icon was redrawn as an actual thumbtack (flat head, flared base, needle).
- Follow-up (floating buttons legibility): once the "오늘은 어디로 갈까요?" title has scrolled up under the profile/explore buttons (title bottom within 56px of the scroll area's top, ≈30px of scrolling), a frosted fade fades in behind them — 5.25rem tall, `var(--background)` gradient (88% → 62% → clear) plus `backdrop-filter: blur(10px)` masked out toward the bottom edge so there's no hard line, `pointer-events-none`, 300ms opacity transition, theme-aware via the CSS variable. Shown only on the course-result home screen (where the buttons exist); driven by the scroll area's `onScroll`, setting state only when the boolean flips.
- Follow-up (compact logo): new `public/tripchain-logo-horizontal.svg` — the stacked logo's own glyph paths regrouped into "Trip" + "Chain" side by side (Chain shifted so its baseline sits just above Trip's), same `#4f8df7`, ≈3.5:1. It appears top-left, 22px tall, in the same fade-in as the frosted bar (so it only shows once the big title has scrolled away), vertically centered on the profile/explore buttons (measured: both centerY 32.0). The stacked `tripchain-logo.svg` is untouched and still used on the first screen and the tour intro.
- Bug fix (iPhone): the profile/explore buttons, the compact logo and the frosted bar were `absolute … top-3` / `top-0` inside the section, whose `padding-top: env(safe-area-inset-top)` does NOT shift absolutely-positioned children (they position against the padding edge). On a notched iPhone with `viewport-fit: cover` + `black-translucent` they therefore sat under the status bar — invisible until the page was pulled down. They now use `top: calc(0.75rem + env(safe-area-inset-top))`, and the frosted bar's height is `calc(5.25rem + env(safe-area-inset-top))` so it also covers the status bar zone. Desktop is unchanged (safe-area = 0: button offset still 12px, logo/button centers still equal). Not verified on a real iPhone from here — the safe-area inset can't be emulated in the desktop browser pane.
- Found while testing: React doesn't suppress pointer handlers on a disabled button, so a pinned card's greyed-out grip could still start a drag; `handleChainDragStart` now ignores pinned ids.
- i18n: removed `moveUpAria`/`moveDownAria`; added `pinStopAria`, `unpinStopAria`, `swapStopAria`, `swapStopNone` in ko/en/ja/zh. New `PinIcon`/`SwapIcon` in app-icons.tsx.

Verification:

- Passed: `pnpm exec tsc --noEmit`, `pnpm lint` (pre-existing `no-img-element` warnings only)
- Passed: browser — pin holds a card (swap/grip disabled), swap replaces a stop in place, a real mouse drag moves the last card to the top with pointer capture intact and the inline transform cleared on release, deleting a card starts a 240ms slide on the cards below it
- Not checked: the drag feel on a touch device, and a pinned card between two dragged-over slots on a slow phone (only the logic was exercised)

### Mobile Phase AW: Bottom Tab Bar Removed (Avatar, Floating Explore, Ranking Merged Into Explore)

Status: Complete

Scope — from the 10/2 team meeting feedback (탐색 vs 랭킹 indistinguishable, bottom bar fights the browser chrome) and the user's follow-up: drop the bottom nav entirely.

- `mobile-app-shell.tsx`: tabs reduced to `home | explore | profile`; the `<nav>`, `tabs` array, `showBottomNav`, the ranking view, `rankingTrips`/`rankingPeriod` are gone. Profile opens from a circular avatar button at the top-right of home; explore opens from a floating "탐색" pill at the bottom-right of the first (no-course) home screen. Once a course exists the pill would cover the chain cards' reorder/delete buttons, so there it becomes a compass icon button beside the avatar instead. The language globe on the first screen moved to the top-left (its overlay is full-screen, so position is free).
- Follow-up: the floating "탐색" pill was dropped — on the first screen it was redundant with the "바로 살펴보기" link. That link is now "바로 탐색하기 >" and opens explore directly (it used to build a "popular course" chain; `popularCoursePrompt` removed from all four locales). The compass icon beside the avatar remains for the course-result screen, where that link doesn't exist. Tour trimmed to 3 steps (search, 바로 탐색하기, profile avatar); `tourStep3*` removed, `tourStep2*` and `quickBrowse` reworded in ko/en/ja/zh.
- Second follow-up: the first screen is now bare — no avatar there; the avatar and the compass only appear once a course exists (profile is reachable after the first chain). Tour is therefore 2 steps (search, 바로 탐색하기); `tourStep5*` removed in all four locales. The language globe sits bottom-left, vertically centered on "바로 탐색하기 >" (both centers measured at the same y).
- Explore now owns ranking: a 전체 / 주간 랭킹 / 실시간 랭킹 segmented control next to the list/map toggle (same segmented style as before) re-sorts the same trip list; 전체 keeps the original order and un-numbered cards, the other two show rank numbers. Explore and profile each get a "← 뒤로" button back to home.
- `onboarding-tour.tsx`: tour is now 4 steps (search, quick-browse, explore button, profile avatar); the old nav-targeting and ranking steps are removed. i18n: removed `navHome`, `navRanking`, `rankingHeading`, `rankingEmpty`, `tourStep4*`; added `exploreSortAll`; updated tour step 3/5 copy in ko/en/ja/zh.

Verification:

- Passed: `pnpm exec tsc --noEmit`, `pnpm lint` (pre-existing `no-img-element` warnings only)
- Passed: browser walkthrough — home → explore (sort chips + list/map fit on one row, weekly sort shows rank numbers) → back → profile → back; course-result screen shows compass + avatar with nothing covered; first-visit tour runs all 4 steps; no console errors on a fresh tab
- Not yet done: real-device check of the floating button against iOS/Android browser chrome

### Mobile Phase AV: Seed/Explore/Ranking Sample Chains Now Fame-Aware

Status: Complete

Scope — user asked to update the sample "체인" chains shown in 탐색(explore)/랭킹(ranking) to reflect everything newly built this session (393 real photos, 165 Kakao-sourced places, fameScore), and to reconfigure ranking to match. Found `generateSeedTrips()` in `mobile-data.ts` — the 24 sample trips backing both the explore feed and the ranking tab are procedurally generated from the live `places` array, not hand-written, so they already picked up every place added since (confirmed: a 송파구 "서울 대표 명소 도장깨기" sample now genuinely includes 롯데월드 매직캐슬/매직아일랜드, both Kakao-sourced). Two things were still disconnected from the new data, though:

- Each sample's *starting* place was `places[(themeIndex * 37 + variant * 53) % places.length]` — a raw modulo index, blind to fameScore, so a "showcase" course could just as easily anchor on an obscure place as a landmark. Added `FAMOUS_ANCHOR_POOL` (places sorted by `fameScore` descending, top 60) and anchor from that instead — every sample course now starts from a genuinely well-known place; the rest of the route is still picked by the existing `nearestUnused` (walkability, not fame).
- `likes`/`comments`/`saved`/`rankScore` were pure seeded pseudo-random noise (`120 + seed * 9` etc.), with zero connection to what was actually in the course. Replaced with formulas driven by the course's own average `fameScore` (`avgFame`), with `seed` kept as a smaller jitter term so two similarly-famous courses don't look identical: `likes: 80 + avgFame*8 + seed%60`, `comments: 3 + avgFame/4 + seed%12`, `saved: 30 + avgFame*1.5 + seed%100`, `rankScore: avgFame + seed%15`. A course built from famous places now plausibly outranks one built from obscure ones, in both ranking modes (실시간 sorts by likes+saved+comments, 주간 sorts by rankScore).

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: browser walkthrough at `/mobile` — 탐색 feed spans 10 different districts (종로구/영등포구/중구/송파구/서대문구/강남구/마포구/광진구/성동구/성북구) instead of clustering on one; opened the 송파구 sample and confirmed real Kakao-sourced places (롯데월드 매직캐슬, 매직아일랜드) appear in it; 랭킹 tab's 주간/실시간 order both look sane; no console errors on a fresh tab (a 404 seen mid-session traced to the agent's own ad hoc debugging fetch, not the app)

### Mobile Phase AU: Real Photos for Kakao-Sourced Places (and a Naver Hotlink Trap)

Status: Complete

Scope — user noticed the places dug up via Kakao (Phase AS) had "이상한 사진" (weird photos) attached. Root cause: Kakao's Local keyword-search API (used to find the places themselves) returns no image field at all, and `getPlaceImageUrl()` (`mobile-data.ts`) falls back to `https://picsum.photos/seed/{id}/...` — a random, completely unrelated stock photo — whenever `place.image` is unset. All 165 Kakao-sourced places had no `image`, so every one of them was showing an arbitrary random photo.

- New `scripts/fetch-place-images.mjs`: for every place missing an `image`, queries the Kakao **Image** Search API (`dapi.kakao.com/v2/search/image`, same `KAKAO_REST_API_KEY` — no new credential) with `"{name} {area}"` and takes the best real-world result.
- First pass surfaced a second, worse problem: Kakao's image search indexes Naver blog/cafe photos, and **Naver's CDN (`pstatic.net` and friends) 403s any hotlinked request** — confirmed directly (fetched one with a `Referer` header, got a 403/empty response back). 98 of the first 161 "found" images were actually on a blocked Naver host, meaning they'd render as a blank box in the app despite the script reporting success. A domain-blocklist pass caught most of those, but then surfaced a *third* variant: some `t1.daumcdn.net/cafeattach/...` paths (Daum Cafe attachments) 403 the same way despite being a "safe" host. Domain-based guessing couldn't fully solve this, so the script now **actually fetches each candidate image** (with a `Referer` header, 5s timeout) and only accepts one that comes back `200` with an `image/*` content-type — verified true relevance of loading, not inferred from the hostname.
- Candidates are ranked blog > cafe > news before verification — a "news" hit can correctly text-match a place's name while showing an unrelated photo (e.g. "이랜드크루즈" pulled a news photo of two executives signing a contract); blog/cafe posts are much more likely to be an actual visit writeup with a real photo of the place. News is accepted only when nothing else validates — a known, documented remaining imperfection (visual relevance isn't guaranteed, only presence of *a* working photo).
- Final state: 393/413 places now have a real, loading image (148 of 165 Kakao-sourced ones); 20 Kakao-sourced places have no usable web photo for their name and still fall back to the random picsum placeholder — an honest degradation, not a broken link.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: random 15-place sample of Kakao-sourced images, each independently re-fetched — 15/15 returned `200` with an `image/*` content-type
- Passed: browser walkthrough at `/mobile` — "다른 장소도 볼까요?" grid for "한강변 체인" now shows a real 노들섬 잔디마당 photo instead of a random stock image; no console errors on a fresh tab

### Mobile Phase AT: Gemini Picks the Final Chain, Not Just the Intent

Status: Complete

Scope — user asked whether Gemini could be involved in the actual place SELECTION, not just intent parsing, for "스마트하고 정합성 있는 코스" (smarter, more coherent courses). Previously: Gemini only turned the prompt into structured `categories`/`attributes`/`placeCount`/`area` + a one-sentence `reason` written *before* any place was chosen; the actual stops came from `scorePlace()` (category/attribute/fame scoring) plus `pickCandidate()` randomly sampling the top 6 per category slot — a locally-scored, partly-random pick with zero sense of whether the stops cohere as a day's course together. This is also the root cause behind this session's repeated "reason doesn't match the places" bugs: Gemini's `reason` was always written blind to the actual selection.

Constraint that shaped the design: `buildChain()` is called both server-side (`/api/recommend`) and client-side in `mobile-app-shell.tsx` (GPS "내 주변" start, the radius +/- control, and the fetch-failure fallback) — it has to stay a synchronous, zero-network, pure function for those call sites' speed/resilience to hold. So Gemini selection couldn't be pushed down into `buildChain()` itself.

- `recommend-engine.ts`: extracted the geographic/scoring half of `buildChain()` (area/landmark/한강/radius pool construction + per-place scoring) into a new exported `getScoredPool(intent)`, returning the same sorted `{place, score}[]` the picker consumes. `buildChain()` now calls it internally — behavior for every existing caller is unchanged.
- `route.ts`: after `buildChain(intent)` produces its usual (fast, always-available) local result, and only when that result's length already equals what was requested (a thin pool means there's no real second opinion to offer — the existing honest-shortfall note already covers that case), a new `selectChainWithGemini()` step runs: takes the top 24 pool candidates (deduped to one per coordinate, reusing the same guard `buildChain` applies internally), sends them (id/name/category/area/tags/120-char description/fameScore) plus the user's original prompt to Gemini, and asks it to choose exactly the requested count — instructed explicitly to optimize for thematic/mood coherence as a combination ("같은 테마/동선으로 이어지는 조합", avoiding e.g. mixing a quiet traditional space with a loud hotspot) — and to write one sentence explaining *that specific combination*. The response schema constrains `placeIds` to an `enum` of the real candidate ids; the code still independently verifies the count, uniqueness, and id membership before trusting it at all. A valid selection is re-ordered for walking distance via the existing `optimizeRoute()` and used in place of the local pick, including replacing the `reason` text (now grounded in the real picks instead of written blind). Any failure, timeout, or invalid output silently keeps the original local result — zero regression risk.
- Added `usedGeminiSelection: boolean` to the response alongside the existing `usedAI`, for visibility into which path a given recommendation took.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: direct `/api/recommend` calls — "종로구에서 조용한 전통 문화 코스" → 경복궁/창덕궁/운현궁/가회민화박물관 with a reason naming all four by name; "한강변 체인" → 잠원·반포·여의도한강공원 + 노들섬 with a matching reason; "서울 랜드마크 체인" → 창덕궁/경복궁/숭례문/남산공원; all three returned `usedGeminiSelection: true`
- Passed: browser walkthrough at `/mobile` — "핫플레이스" now returns a genuinely coherent 롯데월드 어드벤처/매직캐슬/매직아일랜드 cluster (a real, thematically consistent amusement-park "hot place" group) instead of an arbitrary mix, reason text matches; no console errors on a fresh tab

### Mobile Phase AS: Kakao Local API as a Second Data Source (한강공원 branches, 이태원/북촌/... neighborhoods)

Status: Complete

Scope — follow-on from Phase AR: with TourAPI's service key rejected (`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`, confirmed on both the new and an already-working endpoint — not fixable from code), the user asked to dig up real attractions a different way: via the Kakao Local API, and to mark which places came from it. Set up `KAKAO_REST_API_KEY` in `.env.local`/`.env.example` (a different key type than the existing `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`, from the same Kakao Developers app's "플랫폼 키" page) and verified it works against `dapi.kakao.com/v2/local/search/keyword.json`.

- New `scripts/dig-kakao-places.mjs` (one-off/refreshable): keyword-searches 21 terms (한강공원, 노들섬, 이태원, 북촌한옥마을, 홍대, 명동, 압구정로데오, 가로수길, 성수동, 여의도, 잠실, 삼청동, 인사동, 서울숲, 청계천, 남산, 북한산, 동대문, 익선동, 경리단길, 을지로) against Kakao Local, keeps results categorized as 관광명소(AT4)/문화시설(CT1) **or** carrying an empty `category_group_code` with a `category_name` starting with "여행" (hit mid-run: every 한강공원 branch comes back with an empty group code despite genuinely being a travel/park category — the first run silently dropped all of them until this was caught and the filter widened), restricted to Seoul addresses, and skips anything whose name already exists in the dataset. Kakao gives no description/fee/hours, so those are synthesized per place via Gemini (explicitly instructed not to invent specific facts — only general, safe description text) along with en/ja/zh translations, same pattern as `sync-seoul-places.mjs`. Every place this adds carries `source: "kakao"` (new optional field on `MobilePlace`) so it stays distinguishable from TourAPI/heritage rows.
- Ran it twice (second run after the empty-category-code fix): 300 → 320 → 413 places total, 165 of them now `source: "kakao"`. Confirmed live: 반포/여의도/뚝섬/이촌/망원/잠실/잠원/양화/강서한강공원 and 노들섬 are all now real dataset entries (none of them existed before this phase).
- Re-ran `enrich-place-fame.mjs` on the full 413-place dataset so the new entries are fame-scored on the same basis as everything else.
- `recommend-engine.ts`: expanded `SEOUL_HANGANG_PLACE_IDS` from the 3 placeholder entries in Phase AR to all 13 real river-adjacent places now in the dataset, spanning 10 districts (서초/영등포/광진/용산/마포/송파/강남/강서/강동/동작) end to end. This also crosses `MIN_POOL_SIZE` (13 ≥ 6), so `poolNear()`'s radius narrow/widen behavior is now meaningful for "한강변 체인" instead of always just returning everything — a natural side effect of having real data instead of a thin 3-entry placeholder.
- Checked the merged dataset for the same class of problem Phase AQ fixed: no (0,0) coordinates, no 3+-same-coordinate same-category clusters introduced by the Kakao batch (the few 2-place coincidental overlaps found — e.g. festivals sharing a plaza's coordinates with its venue — are genuinely distinct content, consistent with Phase AQ's category-homogeneity guard).

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: direct `/api/recommend` call for "한강변 체인" — now returns 4 real places spanning multiple districts (e.g. 망원한강공원/양화한강공원/노들섬/잠원한강공원), no honest-shortfall note needed since enough real candidates exist
- Passed: browser walkthrough at `/mobile` — searching "한강변 체인" renders 잠원한강공원/노들섬/노들나루공원/... as the chain with a working map, no console errors on a fresh tab

### Mobile Phase AR: Han River Gets a Curated Place List, Not a Single Anchor Point

Status: Complete

Scope — user noticed every "한강변 체인" result clustered near 이촌 (용산구) and asked why real Han River spots like 노들섬 never showed up. Root cause: Phase AN's fix anchored "한강" to one fixed coordinate (37.5125, 126.9966, near 이촌) and ran a radius search from there — but the Han River runs ~40km across Seoul through a dozen-plus districts, so a single point + radius can only ever surface whatever happens to be near that one spot, never the river's actual length. Checked the dataset directly: none of the well-known named 한강공원 branches (반포/뚝섬/여의도/잠실/이촌/망원 etc.) are in it at all — only 광나루한강공원(강동구)/난지한강공원(마포구)/노들나루공원(동작구, 바로 옆이 노들섬) exist, because the TourAPI sync's Seoul-wide attraction pull (`take: 70`) never surfaced them. 노들섬 itself isn't a standalone entry.

- Tried to pull the missing 한강공원 branches live via TourAPI's `searchKeyword2` before resorting to a code-only fix — it failed, and so did `areaBasedList2` (the same endpoint `sync-seoul-places.mjs` normally uses), both returning `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`. The TourAPI service key in `.env.local` currently is not accepted at all, not just for the new endpoint — needs to be refreshed/reactivated on data.go.kr before any more TourAPI data (한강공원 or otherwise) can be pulled. Flagged to the user; not something fixable from code.
- `recommend-engine.ts`: replaced 한강's point-anchor handling with the same curated-pool pattern as Phase AO's `landmarkOnly` — new `SEOUL_HANGANG_PLACE_IDS` (the 3 real entries above) and `intent.hangangOnly`, with its own `buildChain()` branch. With only 3 candidates (under `MIN_POOL_SIZE`), `poolNear()`'s own fallback ladder always bottoms out at "return all candidates" regardless of radius — so this reliably returns all 3, genuinely spanning 강동구/마포구/동작구, instead of a radius-bounded cluster near one point.
- `route.ts`: removed 한강 from the point-based `LANDMARK_ANCHORS` table; added `isHangangPrompt()` (same keyword list) setting `intent.hangangOnly`, checked ahead of the generic-landmark path and overridden by an explicit district match same as before.
- Since only 3 places exist for a 4-stop default chain, Phase AH's "couldn't fully meet requested count" honest note now correctly appears for this prompt (confirmed live).

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: direct `/api/recommend` call for "한강변 체인" — now returns 난지한강공원/노들나루공원/광나루한강공원 (마포구/동작구/강동구), with the "지금 조건에 맞는 장소를 최대로 담았어요" note attached
- Passed: browser walkthrough at `/mobile` — map now shows the 3 stops spanning the width of the city along the river instead of one tight cluster; no console errors on a fresh tab

### Mobile Phase AQ: Dataset Cleanup — Museum-Artifact Duplicates, Broken Coordinates, Same-Coord Chain Guard

Status: Complete

Scope — user flagged "핫플레이스" returning 내원사/경국사/길상사(서울)/훈민정음, none of them trendy or lively, and asked (1) how to generally improve recommendation quality and (2) to filter out "타당하지 않은" (not-legitimate) places from the data, confirming all 300 places had been shown to Gemini for fame-scoring. Root cause traced two ways:

1. **Data quality**: `sync-seoul-places.mjs` pulls 국보 (KDCD 11, "National Treasure") heritage entries one row PER ARTIFACT, not per site. 국립중앙박물관 alone backed 29 separate "places" in the dataset — a bronze mirror, a celadon jar, individual Buddha statues — each with its own 40-50min "duration" as if it were a standalone walkable stop, when they're really one indoor museum visit. 간송미술관 (8) and 삼성미술관 리움 (8) had the same pattern. A course that pulled 3 of these read as nonsense: 3 "stops" that are actually the same building. Also found: 3 heritage entries with literal (0,0) coordinates (never geocoded), which would plot on "null island" on the map.
2. **Selection logic**: when Gemini doesn't extract explicit categories (ambiguous prompts like "핫플레이스" don't map cleanly onto 문화재/관광지/문화시설/축제행사), `buildChain` round-robins through all 4 default categories regardless of fit — so even a "lively/trendy" request was guaranteed at least one 문화재 (heritage) pick, and before Phase AP's fameScore fix that pick was effectively random.

Fixes:

- New `scripts/dedupe-venue-clusters.mjs` (one-off, run after sync + fame-enrichment): drops (0,0)-coordinate places; collapses "venue clusters" down to their single highest-fameScore representative in two passes — (a) 3+ places sharing an exact coordinate, same category only (so a 축제행사/문화시설 cluster that coincidentally shares a district office's address, like 금천구, is correctly left alone — caught and fixed a first run that wrongly collapsed two real Geumcheon festivals into one, restored from git history and re-scored before re-running with the category guard added); (b) a second pass matching the venue name embedded in the address (국립중앙박물관/간송미술관/삼성미술관 리움/...) for 문화재-only places the exact-coordinate pass missed because the heritage API geocodes each artifact to a slightly different pin within the same museum grounds. Ran against the live dataset: 300 → 248 places (3 broken-coordinate drops, 49 venue-duplicate drops across both passes).
- `recommend-engine.ts`'s `buildChain()`: the chain-picking loop now also tracks coordinates already used and won't pick a second place at the same coordinate into one chain — defense in depth so a future `sync-seoul-places.mjs` re-run (which would reintroduce fresh per-artifact duplicates until dedupe is re-run) can't put two stops at the same building into a single course.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: dataset check post-cleanup — 0 places at (0,0), the only remaining 3+-member same-coordinate cluster (금천구청종합청사) is genuinely mixed-category and correctly preserved, all heritage-11 entries are now either a real standalone site (숭례문, 원각사지 십층석탑) or a single representative per museum
- Passed: direct `/api/recommend` calls — "핫플레이스" and "한강변 체인" no longer return multiple near-duplicate museum artifacts as separate chain stops
- Passed: browser walkthrough at `/mobile` — "핫플레이스" now returns 노원 불빛정원/고려대학교 박물관/경국사(서울)/... (distinct real places), no console errors on a fresh tab

### Mobile Phase AP: Gemini-Rated fameScore Replaces Guessing via savedBy

Status: Complete

Scope — user asked whether, instead of hand-curating landmark IDs/keywords per place (Phase AO), Gemini could just work out which places are well-known on its own. It can: the real problem isn't missing keywords, it's that `savedBy` — the only popularity-ish signal `scorePlace()` had — is `seededSavedBy(id)` in `sync-seoul-places.mjs`, a deterministic hash of the place id. It was never a real popularity number, so it's close to random with respect to actual fame; that's *why* Phase AO's bug happened (a minor statue outscored 경복궁) and it affects every prompt with no category/attribute/area to narrow on, not just ones that literally say "랜드마크". User chose to blend the new signal in alongside savedBy rather than replace it outright.

- New `scripts/enrich-place-fame.mjs` (one-off, re-run after `sync-seoul-places.mjs` refreshes the dataset): batches all 300 places (25/batch, 12 batches) to Gemini with name/category/area/tags/description, asking for a 0-100 "how well-known is this to an average Seoul visitor" rating per a defined rubric (90-100 = nationally/world-famous landmark, 60-89 = fairly well-known, 30-59 = niche/local, 0-29 = essentially unknown to tourists). Writes the result back as a new `fameScore` field on each place in `seoul-places.json`. Ran it once this session: all 300 places scored, 0 failed batches. Result sanity-checked — top 10 is now 경복궁(100)/강남(98)/숭례문·창덕궁·덕수궁·명동성당·국회의사당·남산공원 등(95), all genuinely well-known, vs. the old savedBy top-10 which included random statues and festivals above 경복궁.
- `mobile-data.ts`: added optional `fameScore?: number` to `MobilePlace`.
- `recommend-engine.ts`'s `scorePlace()`: replaced the flat `Math.min(20, savedBy / 100)` term with a blend — `savedByScore * 0.3 + fameScore * 0.7` (fameScore falls back to savedByScore when a place has no score yet, e.g. one added after the last enrichment run, so the old behavior is the fallback rather than a crash or zero).
- Phase AO's curated `SEOUL_LANDMARK_PLACE_IDS`/keyword detection stays as-is — it's still a stronger, more precise signal for a prompt that explicitly says "랜드마크". fameScore is the general-purpose fix for every other prompt with nothing else to go on.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: `node scripts/enrich-place-fame.mjs` — 300/300 scored, output top-10 list sanity-checked
- Passed: direct `/api/recommend` calls with no area/category signal at all — "아무거나 추천해줘" now anchors on 국립현대미술관 서울 (National Museum of Modern and Contemporary Art), "오늘 뭐하지" anchors on 국립극장 (National Theater of Korea); both genuinely well-known venues, replacing the previous near-random picks

### Mobile Phase AO: Curated Landmark List for Generic "랜드마크" Prompts

Status: Complete

Scope — user tested "서울 랜드마크 체인" right after Phase AN shipped and got 광나루안전체험관/고하송진우선생동상/더페이지갤러리/디뮤지엓 (a safety-experience center, a minor statue, two galleries, none of them landmarks) with `reason` still claiming "서울을 대표하는 주요 랜드마크". Unlike the Phase AN case, this isn't a geo-anchor gap — "랜드마크" is a generic word, not a place Phase AN's table could match. Root cause traced via direct API calls plus a dataset dump: with no categories/attributes/area extracted (the taxonomy has no "landmark" concept), `scorePlace()`'s only signal is `Math.min(20, place.savedBy / 100)`, and `savedBy` in this dataset doesn't track real fame — e.g. "나석주의사동상" (a minor independence-era statue) scores 1405 while 경복궁 scores only 618. So `buildChain`'s fallback anchor (`scoredAll[0]`) landed on whatever had the highest essentially-random `savedBy`, nowhere near an actual landmark.

- `recommend-engine.ts`: added `SEOUL_LANDMARK_PLACE_IDS`, a curated set of 13 genuinely iconic place IDs confirmed to exist in the dataset — the five grand palaces (경복궁/창덕궁/창경궁/덕수궁/경희궁지), 종묘, 숭례문, 명동성당, 문묘와 성균관, 운현궁, 구 서울역사, 남산골한옥마을, 남산공원. Added `intent.landmarkOnly`; `buildChain()` gets a third branch (same shape as the existing areaFilter/district branch) that pools from this curated list via `poolNear()` — radius buttons still narrow/widen within it — instead of falling through to the broken savedBy-based fallback.
- `route.ts`: added `isGenericLandmarkPrompt()`, a keyword check (랜드마크/대표 명소/유명한 곳/유명 관광지/landmark/iconic) mirroring the existing district/landmark-anchor detectors. Only sets `landmarkOnly` when no district and no specific landmark (Phase AN) already matched — a more specific signal always wins over the generic one.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: direct `/api/recommend` call for "서울 랜드마크 체인" — now returns 운현궁/덕수궁/남산골한옥마을/남산공원 (previously 광진구/성동구 obscure places)
- Passed: browser walkthrough at `/mobile` — searching "서울 랜드마크 체인" renders 남산공원(서울)/남산골한옥마을/창경궁/경희궁지 as the chain, no console errors on a fresh tab

### Mobile Phase AN: Landmark Anchors for Cross-District / Sub-District Prompts

Status: Complete

Scope — user noticed "한강변 체인" recommended Jongno-area places with no relation to the Han River. Root cause: "한강" isn't one of the 25 `SEOUL_DISTRICTS`, so both the deterministic district check and Gemini's own `area` field correctly return null for it — but with no `areaFilter` and no client GPS anchor, `buildChain()` fell back to `anchor = scoredAll[0]?.place`, the single highest-scored place in all of Seoul, unrelated to the prompt. Gemini's free-text `reason` field still said "한강변을 따라 산책하며..." — it understood the intent, it just had no schema field to express "anchor near this landmark" through. User then asked to generalize this to other landmarks, not just 한강.

- `route.ts`: added `LANDMARK_ANCHORS`, a table of landmark/neighborhood name+alias → representative coordinate, checked the same way as the existing `DISTRICT_ROMANIZATIONS` table via `detectLandmarkAnchorFromPrompt()`. When a landmark matches and no district does, `normalizeIntent()` uses the landmark's coordinate as `anchor` (same override priority as a named district: wins over device GPS, since naming a landmark is a stronger signal than ambient location). Keyword groups added (Korean + common romanization aliases):
  - 한강 (Han River; genuinely spans multiple districts) — `한강`, `한강변`, `한강공원`, `hangang`, `han river`
  - 남산 (spans 용산구/중구) — `남산`, `남산타워`, `n서울타워`, `namsan`
  - 청계천 (spans 종로구/중구/성동구/동대문구) — `청계천`, `cheonggyecheon`
  - 북한산 (spans 강북구/은평구/도봉구/성북구) — `북한산`, `bukhansan`
  - 홍대 (마포구) — `홍대`, `홍대입구`, `hongdae`
  - 이태원 (용산구) — `이태원`, `itaewon`
  - 명동 (중구) — `명동`, `myeongdong`
  - 강남역 (강남구) — `강남역`, `gangnam station`
  - 압구정 (강남구) — `압구정`, `압구정로데오`, `apgujeong`
  - 가로수길 (강남구) — `가로수길`, `garosu-gil`, `garosugil`
  - 성수동 (성동구) — `성수동`, `성수`, `seongsu`
  - 여의도 (영등포구) — `여의도`, `yeouido`
  - 잠실 (송파구) — `잠실`, `jamsil`
  - 북촌한옥마을 (종로구) — `북촌`, `북촌한옥마을`, `bukchon`
  - 삼청동 (종로구) — `삼청동`, `samcheong-dong`, `samcheongdong`
  - 인사동 (종로구) — `인사동`, `insadong`
  - 서울숲 (성동구) — `서울숲`, `seoul forest`
  - 동대문/DDP (중구) — `동대문`, `ddp`, `동대문디자인플라자`, `dongdaemun` (checked only when no exact district matches first, so "동대문구" still resolves as the district, not this point anchor)
  - 롯데월드 (송파구) — `롯데월드`, `lotte world`
- Live-tested after adding the full list: for most of these (홍대, 이태원, 성수동, 남산, 청계천, 북한산, 강남구 control case), Gemini's own `area` field already resolves them to the correct containing district on its own, so `areaFilter` wins and the landmark anchor is never actually used — which is the better outcome anyway (a full district pool beats a single point+radius). The landmark table only actually fires as the anchor when Gemini can't collapse the prompt to one district and returns `area: null`, confirmed live for "한강 체인" (`areaFilter: null`, `anchor: {37.5125, 126.9966}`). For 남산/청계천/북한산, Gemini currently guesses one bordering district rather than returning null (e.g. 남산 → 중구, missing the 용산구 side) — that's existing Gemini area-inference behavior, not something this table changes; the entries still stand ready as a fallback if the AI call fails or a future model guess differs.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (pre-existing `no-img-element` warnings only, unrelated to this change)
- Passed: direct `/api/recommend` calls — "한강 체인"/"한강변 체인" now anchor at `{37.5125, 126.9966}` (was the 강북구 cemetery), returning 국립중앙박물관, 경리단길, etc. in 용산구 near the river; spot-checked 홍대/이태원/성수동/남산/청계천/북한산/강남구 prompts all resolve to a sensible `areaFilter`

### Mobile Phase AM: AI-Summary Badge + Seasonal Hours Formatting

Status: Complete

Scope — user feedback right after Phase AL shipped: the AI summary had no visible label (looked identical to the old raw text), and the operating-hours block was a single run-on line that squeezed "n명이 저장" into a 1-character-wide column next to it.

- Added a small "AI 요약" pill (same white/blue-border style as the category-sheet place badges) shown only while the AI summary is actually what's displayed (not while loading the clamped-placeholder text, not while expanded to the full description).
- `place-sheet.tsx`: `splitHoursLines()` splits the synced hours string (one `[계절 범위] 시간 (설명)` segment per season, back to back with no separator) into one line per segment via a lookahead split on `[`; a plain string with no brackets (e.g. "상시 개방") passes through unchanged. The hours block was restructured from a single flex row to a labeled ("운영 시간") stacked block, with the saved-count moved to its own `shrink-0` line so it can never be squeezed again regardless of how long the hours text is.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — 서울 육상궁 (simple "상시 개방" hours) renders one clean line; 건청궁 (5-season hours) renders 5 separate lines with "571명이 저장" intact on its own line instead of vertically stacked one-character-per-line; "AI 요약" badge shows above the summary and disappears when "자세히 보기" expands to the full text; no console errors on a fresh tab

### Mobile Phase AL: Real AI Summary for Place Descriptions, Full Text on Demand

Status: Complete

Scope — user-requested: the place-detail description was just the raw synced text hard-clamped to 3 lines, so it visibly cut off mid-sentence (e.g. "...1895년(고종 32) 곤녕합 옥호루에서 명성황후"). Wanted a real AI-written summary shown by default, with "자세히 보기" revealing the full original text.

- Added `POST /api/summarize-place` (`src/app/api/summarize-place/route.ts`), same Gemini setup as `/api/recommend`/`/api/translate-trip` (`gemini-flash-lite-latest`, `GEMINI_API_KEY`, 8s timeout) — asks for a fresh 2-3 sentence/~130-char summary in the requested locale, not a truncation. Falls back to `fallbackSummary()` (cuts at the last sentence-ending period within the window, or a word boundary as a last resort — never mid-word) whenever Gemini is unavailable, so the endpoint always returns something displayable.
- `place-sheet.tsx`: only fetches a summary when the description is actually long enough to need one (reuses the existing `isDescLong` >90-char gate — short descriptions skip the API call entirely). Caches the result in `localStorage` (`tripchain:placeSummaries`, keyed `${locale}:${placeId}`) so revisiting the same place/locale is instant with no repeat call. While the summary is loading, the existing 3-line-clamped raw text is shown as a placeholder (unchanged from before) so there's no layout jump; once the summary arrives it replaces that with the short AI text, unclamped. "자세히 보기" now toggles to the full original description (also unclamped) instead of just un-clamping the same text.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (one real `react-hooks/set-state-in-effect` catch along the way — a synchronous `setState` reading the localStorage cache inside the effect — resolved the same way the profile-hydration effect in `mobile-app-shell.tsx` already does, with a scoped disable + comment, not by suppressing the rule blindly)
- Passed: browser walkthrough on 건청궁 — description initially showed the old clamped raw text, then swapped within ~2s to a genuinely rewritten 2-sentence summary ("경복궁 북쪽에 위치한 건청궁은..."); "자세히 보기" revealed the complete original text and the button flipped to "접기"; confirmed `localStorage["tripchain:placeSummaries"]` holds the cached summary keyed `ko:tour-1604652`; no console errors on a fresh tab

### Mobile Phase AK: "Other Places" Prioritizes Proximity, Adds Why-Shown Badges

Status: Complete

Scope — user-requested: "다른 장소도 볼까요?" and its "더보기" full list should favor places near the current chain first, and each card in the full list should show a small badge explaining why it's there.

- `otherPlacesByCategory` (the home-screen preview row) and `viewingCategoryPlaces` (the CategorySheet "더보기" full list) both sorted by `savedBy` before; both now sort by distance to the nearest current chain stop (`distanceToChainKm`, reusing `haversineKm`) — someone already headed to the current 4 stops is far more likely to add a 5th one nearby than a merely popular spot across town.
- Added a `viewingCategoryBadges` memo classifying every place in the open category sheet into exactly one of three `PlaceBadgeKind`s: `"near"` (within 1km of a current stop — `NEAR_CHAIN_BADGE_RADIUS_KM`), else `"popular"` (at/above that category list's own median `savedBy` — relative to the list itself, not a global cutoff, so it stays meaningful whether the category has 5 or 50 candidates), else `"recommended"` as the catch-all. Rendered as a small dark pill (`bg-black/55` + white text, not a pastel `Badge` tone) in each photo's top-right corner in `category-sheet.tsx`, since a translucent dark overlay stays legible over any photo instead of risking a light pastel blending into a bright image.
- `PlaceBadgeKind` and its 4-locale labels (주변/인기/추천) exported from `category-sheet.tsx` / added to `translations.ts`.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough on "종로구에서 역사 탐방 코스" — "다른 장소도 볼까요?" 관광지 row changed from popularity-sorted (나석주의사동상 등, across the district) to proximity-sorted (경희궁 흥화문 / 경희궁공원, both steps from the current chain's 건청궁 stop); 더보기 full sheet showed the same two places tagged "주변", then further-away 중구 spots tagged "추천"/"인기" further down the list; no console errors on a fresh tab

### Mobile Phase AJ: Radius Steps Remember the Chain Last Seen at Each One

Status: Complete

Scope — user-reported: stepping 4km → 8km → back to 4km showed a completely different chain than the one originally seen at 4km, even without touching refresh.

- Root cause: `changeRadius()` always called `buildChain()` fresh, and `scorePlace`/`pickCandidate` both have randomized elements (a random score nudge, and a random pick among the top few candidates per category) — so revisiting an already-seen radius produced a new random draw instead of the same result.
- Fix: added `radiusChainCacheRef` (`mobile-app-shell.tsx`), a `Map<radiusKm, placeIds>` scoped to the current course. A `useEffect` keyed on `[hasResult, radiusKm, chainIds]` snapshots the current chain into the cache for the active radius on every change — covering not just radius-button transitions but also manual edits (drag-reorder, add/remove a stop), so whatever the user was actually looking at at a given radius is what comes back, not just the originally-generated pick. `changeRadius()` checks the cache before calling `buildChain` and restores a hit outright. The cache is cleared at the top of `startCourse`/`startCourseFromPrompt` — i.e. a brand-new search or explicitly hitting "다른 체인 추천받기" (refresh) is still the only way to get a genuinely new chain at a given radius, matching what the user asked for.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — searched "지금 열리는 축제 위주로 체인 짜줘", widened 1km→4km→8km (each step a different 4-place set as expected), then narrowed 8km→4km and got back the *exact* same 4 places seen at 4km the first time; refresh at the same 4km then produced a genuinely new set; no console errors on a fresh tab

### Mobile Phase AI: English Badge Wrapping + Untranslated District Name in Phase AH's Note

Status: Complete

Scope — two issues the user spotted immediately after Phase AH shipped, both in the English UI:

- **"AI Recommended Course" wrapped onto 2 lines**, pushing the radius/refresh/navigate/optimize-route button row down awkwardly. `en`/`ja`/`zh`'s `aiCourseBadge`/`basicCourseBadge` still had the long form ("AI Recommended Course" / "AIおすすめコース" / "AI推荐路线") — only `ko` had been shortened in an earlier phase (Phase AF-adjacent commit "Shorten AI/basic course badge text"). Shortened all three to match ko's pattern of dropping the trailing "코스"/"course": `en` → "AI Recommended" / "Basic Recommended", `ja` → "AIおすすめ" / "基本おすすめ", `zh` → "AI推荐" / "基础推荐". That alone didn't fix the wrap, though — `Badge` (`components/ui/badge.tsx`) had no `whitespace-nowrap`/`shrink-0`, so as a flex child it could still shrink and wrap even short text. Added both.
- **Phase AH's new "max shown" note left the district name in raw Korean** inside an otherwise-English sentence (e.g. "...Showing every place available in 성동구."), because `intent.areaFilter` is always the Korean district string (it's the ground-truth key used to filter `places`) and was interpolated directly with no translation step. Added `localizeDistrictName(area, locale)` to `recommend-engine.ts` — looks up any place in that district and reads its own per-place `translations[locale].area` (data that already exists for every place, e.g. "Jongno-gu"/"鍾路区"/"钟路区") instead of hand-maintaining a separate district-name table that could drift from it. Wired into `route.ts` before building the note.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: live `/api/recommend` call with `locale: "en"` for "5 spots to go near seongsu" — note now reads "Showing every place available in Seongdong-gu." instead of "...성동구."
- Passed: browser walkthrough in English — "AI Recommended" badge renders on one line, radius/action buttons stay on the same row, no console errors on a fresh tab

### Mobile Phase AH: Honest Note When a Requested Place Count Can't Be Met

Status: Complete

Scope — user-reported: asking for "성수 근처 다섯개 장소 코스" (5 places near Seongsu) only returned 4, with no explanation.

- Traced with temporary debug logging (removed after): Gemini correctly parsed `placeCount: 5` every time (verified with a standalone script calling the Gemini API directly, bypassing the app, for 3 different phrasings) and `buildChain` correctly built a chain from it — the shortfall wasn't a logic bug. The actual cause: 성동구 (Seongdong-gu, where Seongsu-dong sits) has only **4** places in the entire synced dataset (`seoul-places.json`), so a 5-place pool literally doesn't exist there. Checking coverage across all 25 districts found a wide imbalance — 종로구/용산구/성북구 have 50+, while 성동구/도봉구/은평구/영등포구/중랑구 have 1-4 — a data-completeness gap in `scripts/sync-seoul-places.mjs`'s source APIs, not something fixable in the recommendation logic itself. Flagged as a separate, larger follow-up (re-sync or supplement the thin districts) rather than fixed here.
- Fix scoped to what's fixable now: `buildChain` returns a new `requestedCount` (the same clamped count it already computed internally) alongside `placeIds`, so a caller can tell "got fewer than asked for" apart from every other reason a count might come up short. `/api/recommend` compares `result.placeIds.length` against `result.requestedCount` and, when short, appends a locale-aware note to `reason` — framed as "we've shown the maximum available" (user's explicit direction) rather than an apology, e.g. ko: "{구}에 있는 장소를 최대로 담았어요." / a generic form when there's no named district.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: standalone script confirmed Gemini's raw structured output for "성수 근처 다섯개 장소 코스" (and two other phrasings) always returns `placeCount: 5`
- Passed: `grep -c '"area": "성동구"' seoul-places.json` → 4, confirming the data-scarcity root cause
- Passed: live `/api/recommend` calls — "성수 근처 다섯개 장소 코스" now returns 4 places with the reason ending in "성동구에 있는 장소를 최대로 담았어요."; "종로구에서 5곳 코스" (a district with plenty of data) returns all 5 with no such note appended
- Passed: browser walkthrough confirming the note renders in the course card's reason text; no console errors on a fresh tab

### Mobile Phase AG: Radius Buttons Were a No-Op on District-Anchored Courses

Status: Complete

Scope — user-reported: 반경 좁게/넓게 didn't seem to actually change a district-anchored course. Reproduced by narrowing "종로구에서 역사 탐방 코스" to 0.5km and getting stops several km apart within 종로구 — the labeled radius had zero effect.

- Root cause: `buildChain` (`recommend-engine.ts`) has always used the *entire* named district as the pool whenever `intent.areaFilter` is set, ignoring `radiusKm`/`strictRadius` completely (by design — Phase W added this specifically so a district-scoped course couldn't silently spill into a neighboring district on a radius tap). `changeRadius()` in `mobile-app-shell.tsx` passed the current `courseAreaFilter` into every radius-button call, so every tap just re-rolled a random 4-of-~150 sample from the same unfiltered district pool — the "km" label changed, nothing else did.
- First fix attempt dropped `areaFilter` from `changeRadius()` entirely, so radius became a plain distance filter from the district's centroid — real, but able to spill into a neighboring district at a wide setting (confirmed live: 반경 4km on "종로구에서 역사 탐방 코스" pulled in 중구's 남대문 갈치조림골목). Asked the user first, they initially said leaving the district was fine — then, seeing the actual spillover in a screenshot, reversed that: naming a district should cap how far wide can go, not just suggest it.
- Final fix: generalized `poolNear()` (`recommend-engine.ts`) to take its candidate list as a parameter instead of always searching the global `places`. `buildChain`'s district branch now calls `poolNear(areaPlaces, anchor, radiusKm, strict)` — radius genuinely narrows/widens the pool, but every fallback step (including the final "just use everything" one) is bounded to `areaPlaces`, so it can never escape the named district no matter how wide the setting gets. The non-district branch is unaffected (still searches the full `places` list). Restored `courseAreaFilter` state and passed it back into `changeRadius()`'s `buildChain` call.
- Follow-up (same phase, user feedback after the fix above): once the current radius already covers every place in scope (the whole district, or — for a non-district course — every place in Seoul), pressing "넓게" again used to still visibly change the course, because `buildChain` re-samples randomly from the same unchanged pool. That reshuffle looked like real widening even though nothing was actually added. Added `isRadiusAtMaxCoverage` (`mobile-app-shell.tsx`) — compares how many places in scope already fall within the current radius against the total in scope — and used it to (a) disable the 넓게 button once coverage is already complete and (b) short-circuit `changeRadius()` with a new `radiusNoWiderRoom` message ("더 넓힐 수 있는 곳이 없어요...") instead of calling `buildChain` again, so the radius label and course both stay exactly as they were rather than faking a change.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough on "종로구에서 역사 탐방 코스" — initial 1km result stayed all-종로구; narrowing to 0.5km produced a real tight cluster (한양도성·국립현대미술관 서울·국제갤러리·갤러리도올, all Samcheong/Sogyeok-dong); widening to 8km already disabled the 넓게 button (종로구's full extent was already covered); force-invoking the handler anyway surfaced the new radiusNoWiderRoom message without changing the radius label or the course; no console errors on a fresh tab (one `candidates.filter is not a function` seen mid-edit was stale HMR history from the brief window between changing `poolNear`'s signature and updating its call sites, confirmed gone on a fresh tab)

### Mobile Phase AF: Real Brand Icons for the Share Menu (simple-icons), Instagram Added

Status: Complete

Scope — user explicitly asked not to hand-draw share icons and to use "정식 아이콘 이미지" (official icon assets), plus add Instagram:

- Installed `simple-icons` (CC0-licensed, `github.com/simple-icons/simple-icons`) as a real dependency rather than fetching arbitrary image files from the internet. Added `src/features/mobile/brand-icons.tsx` with `XIcon`/`FacebookIcon`/`InstagramIcon`/`WhatsAppIcon`/`KakaoTalkIcon` — each the exact official path data from that package, `fill="currentColor"` so badge color comes from the wrapping button like every other icon in this app.
- Replaced the hand-coded letter glyphs ("X", "f") and repurposed generic icons (`TalkBubbleIcon` for Kakao, `CommentIcon` for WhatsApp) in `trip-detail-sheet.tsx`'s share popover with the real brand marks. Corrected Facebook's badge color to their current official blue (`#0866FF`, from simple-icons' own data — the `#1877F2` used before was their previous brand blue).
- Added a dedicated Instagram badge (its own tooltip/aria-label take over from the old generic "share" one) using the classic recognizable orange→pink→purple gradient background with the white Instagram glyph on top — since Instagram (like TikTok) has no public share-intent URL, this button and the original generic one both trigger the same `shareTrip()` OS share sheet; there's no other way to reach either platform from a website.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (same 2 pre-existing `no-img-element` warnings as Phase AE, unrelated to this change)
- Passed: browser re-check on a different machine/session (fresh `pnpm install`, no leftover popup) — all 5 badges (Instagram, KakaoTalk, X, Facebook, WhatsApp) render correctly, KakaoTalk's cutout renders cleanly, no console errors

### Mobile Phase AE: Real Brand Icons for Map/Share Badges, Per-SNS Share Icons

Status: Complete

Scope — follow-up polish after Phase AD, driven directly by user feedback on how the new icon badges looked:

- The Kakao/Google navigate-menu badges from Phase AD both used the same generic outline pin (`MapPinIcon`), differing only by badge color — genuinely hard to tell apart, per user feedback with a screenshot. First pass: hand-drawn SVG replacements (a Kakao-style blue-pin-on-yellow, a Google-style rainbow gradient pin). The Google gradient initially rendered as solid red due to an SVG bug (`gradientUnits` defaults to `objectBoundingBox`, so raw viewBox-scale coordinates like `x1="3" x2="21"` were being read as fractions far outside 0–1 — fixed by adding `gradientUnits="userSpaceOnUse"`, though the deeper issue was approximating a brand mark by hand at all.
- User then explicitly asked to use their own reference images directly rather than an approximation. They're now saved as real assets (`public/map-icons/kakao-map-pin.png`, `public/map-icons/google-maps-pin.jpg`) and rendered via `<img>` (`object-cover`, clipped to the same circular badge every other icon button uses) instead of hand-coded SVG — both hand-drawn icon components were removed once the real assets were wired in.
- Scope note: this pass only touched the navigate-menu's Kakao/Google badges, since those were the ones with user-supplied reference images. The share menu's X/Facebook/WhatsApp badges (added in Phase AD) stay as coded letter/icon glyphs.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (2 pre-existing-pattern `@next/next/no-img-element` warnings, same as the already-committed logo `<img>` elsewhere in this file — not errors, doesn't fail the lint command)
- Passed: browser walkthrough — navigate menu shows the actual supplied Kakao and Google Maps pin images, correctly clipped into matching circular badges; no console errors

Follow-up polish (same phase, immediately after): first pass scaled the Google image *up* (`scale-125`) assuming the pin should fill the badge like Kakao's does — backwards. The user meant the opposite: shrink the rainbow pin so *it* (not the badge frame) matches the size of the blue pin inside the Kakao icon. Switched to `scale-75`, which both shrinks the pin to a comparable size and naturally reveals the white background behind it (the same effect the yellow margin has in the Kakao badge).

Second follow-up: with a plain white fill and a faint `border-border/60`, the Google badge's own circular boundary nearly disappeared against the white popover panel behind it, making the whole badge read as noticeably smaller than Kakao's solid yellow circle even though both are the same 36px box — a contrast problem, not an actual size difference. Switched to `bg-surface-muted` (a visibly distinct light gray, not pure white) and a full-strength `border-border-strong`, so the badge's outer circle is now clearly legible and reads as the same size as Kakao's.

Re-verified in-browser after each round, no console errors.

### Mobile Phase AD: Foreign-Visitor District Matching, SNS-First Sharing, Multi-App Navigate Menu

Status: Complete

Scope — three user-requested items in one batch:

- **Romanized district matching**: `detectAreaFromPrompt` in `/api/recommend/route.ts` only ever matched literal Korean district names, so a non-Korean prompt naming its own district (e.g. "let's explore Jongno-gu") had no deterministic fallback and depended entirely on Gemini catching it — the exact failure mode the Korean check exists to avoid. Added `DISTRICT_ROMANIZATIONS`, a standard-romanization alias table for all 25 Seoul districts, checked with word-boundary regex after the Korean check. "중구" deliberately has no bare-word alias ("jung" is too generic/common to safely match). Verified with an isolated test: correctly matches "Jongno-gu"/"jongno"/"Gangnam"/"Jung-gu", correctly rejects "Jongnoville" and "jungle" (no false positives on partial words).
- **SNS-first share menu**: reordered `trip-detail-sheet.tsx`'s share popover so "인스타그램 · 틱톡 등으로 공유" (the Web Share API path, which is what actually surfaces Instagram/TikTok/etc. as OS-level share targets, image card included) leads, with "카카오톡 공유" demoted to second — matching the product's shift toward prioritizing SNS reach over the Korea-specific KakaoTalk integration. Renamed the copy across all 4 locales to name the actual platforms instead of a generic "share another way".
- **Multi-app navigate menu**: the 길찾기 button previously opened Kakao Map directly with no choice. It's now a toggle that reveals a small row of icon-only badges below it (yellow Kakao badge, blue Google badge) — clicking picks that app. Added `buildGoogleMapsWalkingRouteUrl()` alongside the existing Kakao builder, consolidated into a new `route-links.ts` (replacing the old Kakao-only `kakao-navigate.ts`, since it now covers both providers). Same popover/backdrop pattern already used for the share menu.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: isolated regex test for the district-romanization matcher (6/6 cases, including false-positive guards)
- Passed: live `/api/recommend` call with an English prompt ("Let's explore Jongno-gu for a history walk") confirmed `areaFilter: "종로구"`
- Passed: browser walkthrough — 길찾기 button reveals both map badges; captured the actual `window.open` call for the Google badge and confirmed a correct `google.com/maps/dir/?...&travelmode=walking&origin=...&destination=...` URL; share popover on a real trip shows the SNS option first, KakaoTalk second; no console errors in a fresh tab

### Mobile Phase AC: Optimize-Route Button

Status: Complete

Scope — user-requested after noticing a recommended/loaded course's stop order can be geographically unreasonable:

- A course's stop order isn't always a real shortest walk. `buildChain` already brute-forces the optimal order (`orderByRoute`) for a *freshly generated* course, but two other paths bypass that entirely: manually adding stops one at a time (`findBestInsertionIndex` only ever finds the best spot for the *new* stop, never re-checks the rest) and loading a shared/published course (whichever order its original author left it in — see Phase Z).
- Added `optimizeRoute()` to `recommend-engine.ts`: brute-forces the exact shortest order (reusing `orderByRoute`) for chains up to 7 stops, and falls back to a greedy nearest-neighbor walk for anything longer — a manually-built chain has no upper bound the way a generated course does, and brute-forcing beyond ~7 stops (5,040+ permutations) would freeze the browser.
- Added an "최적 경로" icon button (new `OptimizeRouteIcon` in `app-icons.tsx`, a 3-point route glyph) next to the 길찾기 button, shown whenever a course has 3+ stops (below that there's only one possible order). Reorders the *current* stops in place — doesn't change which places are in the chain, add/remove anything, or touch the anchor/radius state.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — built a deliberately zigzagging 5-stop course via a `?course=` link (stops ordered to cross the walking path back and forth on the map), confirmed the route line visibly crossed itself before, and clicking 최적 경로 reordered the stops into a clean, non-crossing west-to-east walk with no console errors

### Mobile Phase AB: Honest "예매하기" Placeholder

Status: Complete

Scope — fifth item off the feature-development brainstorm ("예약/티켓 연동"), explicitly requested as a placeholder after confirming there's no real ticketing data source or payment integration to wire up: the dataset (`seoul-places.json`) has no reservation/booking URL field at all, and only 26/300 places even carry a real fee value, so a genuine booking flow isn't buildable right now without a real ticketing partner.

- `place-sheet.tsx` now shows a "예매하기" button for the ~27/300 places that are either paid (`fee` isn't "무료"/"정보 없음") or explicitly require reservation (`hours` contains "예약") — checked against the raw Korean place fields, not the per-locale translated ones, since the substring match only works on the original text.
- Clicking it shows an honest "예매 연동은 준비 중이에요" (booking isn't hooked up yet) toast — reusing the same `share-toast` animation class already used elsewhere — rather than faking a completed booking or navigating anywhere. No real transaction, no misleading confirmation.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough on a paid place (가회민화박물관, 5,000원) — confirmed the button appears only for reservation/fee-flagged places, and that clicking it renders the placeholder toast (verified by batching the click and a DOM read together, since the toast's 2.2s auto-dismiss was shorter than the round-trip of separate tool calls)
- Note: while testing this, the browser tab that had been open across this entire long session (many edits + HMR reloads) started throwing a stale `ReferenceError: derivePreference is not defined` from an unrelated earlier phase's compiled chunk. A brand-new tab against the same (even cache-cleared) dev server had zero errors, confirming it was leftover client-side HMR state in that one old tab, not a real code defect — worth knowing about if a future session sees a confusing error that a fresh tab makes disappear.

### Mobile Phase AA: Weather-Aware Recommendations

Status: Complete

Scope — fourth item off the feature-development brainstorm ("날씨/시간 연동 추천 강화"):

- `/api/recommend/route.ts` now checks current weather via Open-Meteo (`api.open-meteo.com`, no API key needed) at the request's anchor coordinate (or a fixed Seoul city-center fallback when the prompt named its own district, since the route sends `anchor: null` in that case and weather is roughly uniform across the city). Rain is detected either by `precipitation > 0` or a WMO `weather_code` matching drizzle/rain/showers/thunderstorm.
- When it's raining, "실내" is folded into `intent.preferredTags` — reusing the same scoring-nudge mechanism added for personalization in Phase Y, rather than adding a new bonus path — and a short note ("비 소식이 있어 실내 위주로 담아봤어요.") is appended to the response's `reason` text so the user sees *why*.
- Guarded so it never overrides what the user actually asked for: skipped entirely if the prompt's own parsed attributes already include "실내" or "실외". The weather lookup is best-effort (4s timeout, catches all errors) and never blocks or fails the recommendation.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: live-API walkthrough against the running dev server (today's Seoul weather is clear, so the branch couldn't be exercised locally) — confirmed the WMO rain-code classification against real current conditions in Singapore (drizzle, code 53) and Bangkok (rain showers, code 81) vs. clear conditions in Taipei/Tokyo, then called `/api/recommend` with the anchor set to Bangkok's real-time-rainy coordinates and confirmed the response's `reason` picked up the indoor note; a follow-up call with the same rainy anchor but an explicit "실외에서 야외 산책하고 싶어" prompt confirmed the note is correctly suppressed when the user asked for outdoor

### Mobile Phase Z: Shared Course Links Actually Resolve

Status: Complete

Scope — third item off the feature-development brainstorm ("공유 링크로 초대"), scoped down from real-time collaborative editing (which needs a backend the app doesn't have) to fixing what was actually broken: **every existing share button already claimed to share a specific course, but silently didn't.**

- Found while starting this item: `trip-detail-sheet.tsx`'s `shareTrip()` (Web Share/clipboard) and `shareToKakao()` both built their link as `${window.location.origin}/mobile` — the bare app URL, no reference to the trip at all. Opening a shared KakaoTalk card or copied link just landed on the empty home screen; the recipient never saw the course that was supposedly shared.
- Added `src/features/mobile/course-share.ts`: `buildCourseShareUrl()` encodes a course as `?course=<comma-joined place ids>&title=<title>`, and `decodeCourseFromLocation()` reverses it, validating every id against the live `places` list. Since place ids are static bundled data (not server-stored), the link is fully self-contained — it resolves correctly for anyone with the app, no backend required.
- Wired both share functions in `trip-detail-sheet.tsx` to use it. Added a mount effect in `mobile-app-shell.tsx` that decodes `?course=` on load, hydrates the course straight into the home view (skipping the first-run tutorial if one was pending), and strips the param via `history.replaceState` so a later refresh/radius change doesn't keep reloading the same shared course.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — opened a seed trip ("고궁과 박물관을 잇는 하루"), captured the actual share URL via `다른 방법으로 공유` (`?course=heritage-11-...,tour-130285,...&title=...`), then loaded that exact URL in a fresh navigation and confirmed the course view rendered immediately with the correct title and all 4 original stops, with the query param cleanly stripped afterward

### Mobile Phase Y: Personalized Recommendation Scoring

Status: Complete

Scope — second item off the feature-development brainstorm ("개인화 추천 고도화"):

- Added `derivePreference(bookmarkedPlaceIds)` to `recommend-engine.ts`: a pure function turning a user's bookmarked places into a lightweight taste profile (their most-common category and up to 5 most-common tags among those bookmarks), capped so a handful of bookmarks can't dominate every future recommendation.
- `RecommendIntent` gained optional `preferredCategories`/`preferredTags`; `scorePlace` adds a modest bonus for a match (+12 category, +6/tag) — well below an explicit category/attribute match from the prompt itself (+50/+20), so this nudges scoring rather than overriding what the user actually typed or asked for.
- No backend needed: the non-AI course path (`startCourse` in `mobile-app-shell.tsx`) derives preference from the existing client-local `bookmarkedPlaceIds` state and passes it straight into `buildChain`. The AI path (`startCourseFromPrompt`) can't do that server-side (the `/api/recommend` route has no access to the browser's localStorage), so it sends `bookmarkedPlaceIds` in the request body instead; the route derives the same preference and folds it into the intent in `normalizeIntent`.
- `changeRadius` also carries the preference through, so a wider/narrower course stays personalized too.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: a scripted statistical check (temporary, not committed) confirmed `derivePreference` extracts the right category/tags from a sample bookmark set, and that a preference-aware `buildChain` call shifts its top-ranked place toward the bookmarked category in ~99% of trials (298/300) vs. a roughly even split with no preference (113/70/117) — the current live dataset's near-total lack of per-place tag variety within a category (a data-quality gap already tracked separately) meant the category-level signal, not tag-level, was the one with enough live data to demonstrate; the tag path is exercised by the same code and will show once place-level tagging improves
- Passed: browser walkthrough — bookmarked a place, then captured the actual `fetch` call to `/api/recommend` and confirmed its body carries `"bookmarkedPlaceIds":["tour-130938"]`

### Mobile Phase X: Real Kakao Map Walking Directions

Status: Complete

Scope — first item off the feature-development brainstorm (functional development, "실제 길찾기 연동"):

- Added `buildKakaoWalkingRouteUrl()` in `src/features/mobile/kakao-navigate.ts`, building Kakao Map's public "길찾기" web link (`https://map.kakao.com/link/by/walk/{name},{lat},{lng}/...`, confirmed against `apis.map.kakao.com/web/guide/`) — one path segment per course stop. This link is Kakao-hosted: it opens the installed Kakao Map app when present or falls back to their web map otherwise, so no app-scheme/install-detection logic was needed on our side. Supports up to 5 via points (7 stops total); `buildChain` already caps a course at 6, so no truncation is ever hit in practice.
- Added a `NavigationIcon` to `app-icons.tsx` (flat 2D stroke, matching the existing icon set) and a new circular icon button next to the radius/refresh controls in `mobile-app-shell.tsx`'s course card header, opening the route link in a new tab for the current `chainPlaces`.
- Added `navigateCourseAria`/`navigateCourseTitle` to all four locales in `translations.ts`.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — captured the `window.open` call for a real 4-stop course and confirmed the decoded URL carries the exact stop names/coordinates in order (남산케이블카 → 환구단 → 공평도시유적전시관 → 모인화랑)

### Mobile Phase W: Fix `changeRadius` Dropping the District Constraint

Status: Complete

Scope — the one known-open item from the Phase V code review flagged as small:

- `/api/recommend`'s `POST` handler computed `intent.areaFilter` (a district the prompt named explicitly, e.g. "종로구") to build the chain but never returned it in the JSON response, so the client had no way to know a course was district-anchored. Added `areaFilter` to the response payload in `src/app/api/recommend/route.ts`.
- `mobile-app-shell.tsx` tracked only `courseAnchor` (a lat/lng point) for the current course, not the district. `changeRadius()` (the 반경 −/+ buttons) rebuilt the chain from `courseAnchor` alone, so a district-scoped AI course silently fell back to a plain radius pool around the anchor point on the first wider/narrower tap — able to pull in places from a neighboring district. Added `courseAreaFilter` state, set from the new `areaFilter` response field in `startCourseFromPrompt` (cleared on its fallback path and in the plain, non-AI `startCourse`), and passed into `buildChain()` inside `changeRadius`. `buildChain` already treated `areaFilter` as ground truth over any radius (`recommend-engine.ts`), so no engine change was needed — just plumbing the field through.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — prompted "종로구에서 역사 탐방 코스", confirmed the `/api/recommend` response carries `"areaFilter":"종로구"` and the initial 4 stops are all in 종로구; tapped the 반경 + button (1km → 2km) and confirmed the resulting stops (경희궁 흥화문, 서울 운현궁, ...) stayed within 종로구 instead of spilling into a plain-radius pool

### Mobile Phase V: Overlapping Markers, Profile Icon Tabs, Trip Comments

Status: Complete

Scope — three items that came up live while reviewing Phase U's work in the browser:

- **Overlapping constellation-card markers**: a user screenshot showed a numbered map marker fully hidden behind another. Root cause: two seed places (경희궁공원 / 경희궁 흥화문) share byte-identical coordinates in the synced data, so their 24px `CustomOverlay` marker chips rendered exactly on top of each other regardless of the fixed `zIndex: 10` every marker used. Fixed in `constellation-card.tsx` with `spreadOverlappingMarkers()`: any stop within 20m of an earlier stop gets its *marker chip* (not the route line or map bounds, which still use real coordinates) fanned out by ~12m at a golden-angle offset, so 2+ clustered numbers stay legible. Verified by computing real haversine distances for the exact reported places (0m apart before, ~12m after).
- **Profile sub-tab row → icon buttons**: replaced the 4 text pills ("만든 체인" / "저장한 체인" / "좋아요한 체인" / "최근 본 체인") in `profile-tab.tsx` with an icon-only segmented control (matching the existing list/map and ranking-period toggle style already used elsewhere) — a "MY" monogram, `BookmarkIcon`, `HeartIcon` (filled when active), and a new `EyeIcon` (added to `app-icons.tsx`). `aria-label`/`title` keep the full text for accessibility. Verified all 4 states toggle correctly and independently via direct DOM assertions (the browser automation's ref/coordinate clicks were flaking against this session's rapid hot-reload churn, so verification switched to scripted `element.click()` + class checks instead of trusting screenshots alone).
- **Trip comments (new feature)**: the 💬 count on every trip card was pure decoration — no comment content, no way to read or post one. Added a real (still client-local, no backend) commenting feature: `TripComment` type and a deterministic `getSeedComments(tripId)` in `mobile-data.ts` (hash-based, no `Math.random`, only applies to generated `seed-*` trips — never to a user's own freshly published trip) drawing from a small pool of generic Korean comment templates/handles; `userComments` state in `mobile-app-shell.tsx` persisted in the existing `tripchain:profile` localStorage blob; a comment list + input form added to `TripDetailSheet`. The displayed comment count everywhere (feed cards, ranking, profile) now folds in the user's own additions via a single change to the `allTrips` memo, rather than threading a new prop through every `TripFeedList` call site.
- **KakaoTalk share folded into the generic share button**: the standalone brand-yellow "카카오톡 공유" button looked visually out of place next to the app's otherwise neutral icon-button footer. Removed it as its own button (and the now-unused `kakao` `Button` variant) and instead made the existing "공유하기" button open a small popover menu with two options — "카카오톡 공유" (yellow only on the small icon badge) and "다른 방법으로 공유" (the original Web Share/clipboard flow) — reusing the same dropdown-menu visual pattern already used for the trip-detail header's "⋯" delete menu. Footer is back to 5 evenly balanced buttons.
- **Comment count icon → flat 2D**: the 💬 count on feed/ranking cards used a colorful emoji glyph that clashed with the app's flat stroke-icon style (bookmark, heart, etc.). Added an outline `CommentIcon` to `app-icons.tsx` matching the existing icon convention and swapped it in.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough — marker spread confirmed via exact-coordinate distance calculation, all 4 profile icon tabs toggle correctly, a posted comment appears immediately and increments the count consistently across the trip detail sheet and the explore feed card, comments persist across a reload via localStorage, share menu opens with both options and the feed comment icon renders as a flat outline glyph

### Mobile Phase U: Remaining Phase R Backlog (7, 10-13)

Status: Complete

Scope — closed out the last open items from Phase R's gap review, re-checked against the codebase after the intervening global-culture pivot (Phase "Pivot mobile app to global cultural tourism..."):

- **7 (코스가 지역 하나에 갇힘)**: already resolved by the pivot — `recommend-engine.ts`'s `buildChain` now pools candidates by a radius around an anchor (or a named district) across the full city-wide place set, with a user-facing 반경(radius) widen/narrow control, instead of being confined to one of the old fixed Seongsu/Hongdae/Gangnam areas. No code change needed, just re-verified.
- **10 (좋아요한 코스 목록 없음)**: added a `likedTrips` derived list (`mobile-app-shell.tsx`) and a "좋아요한 체인" sub-tab in `ProfileTab`, mirroring the existing "저장한 체인" pattern exactly.
- **11 (장소 자체 북마크 없음)**: added a separate `bookmarkedPlaceIds` set (persisted in the same `tripchain:profile` localStorage blob), a bookmark-ribbon toggle button in `PlaceSheet`'s header, and a "찜한 장소" horizontal-scroll section in `ProfileTab` for viewing/reopening them.
- **12 (카카오톡 공유 없음)**: added `src/features/mobile/kakao-share.ts`, a loader for Kakao's official JS "카카오톡 공유하기" SDK (`Kakao.Share.sendDefault`, Feed template) — separate product from the Kakao Maps SDK already loaded elsewhere, but same app JavaScript key (`NEXT_PUBLIC_KAKAO_MAP_APP_KEY`; documented in `.env.example`). Wired into `TripDetailSheet`'s footer as a new yellow "카카오톡 공유" button (new `kakao` `Button` variant, new `TalkBubbleIcon`). Verified end-to-end in-browser: the Kakao sharer popup opened and reported "공유 성공" with the correct trip title/description.
- **13 (AI 폴백 여부가 안 보임)**: the `/api/recommend` route already returned a `usedAI` flag, but the client silently dropped it — worse, the "AI 추천 체인" badge was hardcoded to show for every AI-path search regardless of whether the AI call actually succeeded. Added a `usedAI` state in `mobile-app-shell.tsx`; when `isAiCourse && !usedAI`, the badge now reads "기본 추천 체인" (neutral tone) instead of "AI 추천 체인" (blue), and a small notice line explains the fallback. Verified both states in-browser (real AI success, and a fetch-mocked `usedAI:false` fallback).

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint`
- Passed: browser walkthrough of all five items on the actual project dev server (port 3002 per `.claude/launch.json`) — liked-trip round-trip through the new profile tab, place bookmark toggle + profile section, KakaoTalk share popup success, and both the AI-success and AI-fallback badge/notice states

Housekeeping: also removed a stale, fully-merged leftover git worktree (`.claude/worktrees/global-culture`, branch `worktree-global-culture`) from an earlier session — it was polluting `pnpm lint`/`tsc` with thousands of errors from its own generated `.next` type output, since neither `eslint.config.mjs`'s ignores nor `tsconfig.json`'s excludes accounted for a nested worktree directory.

### Mobile Phase S: Feature Backlog Items 1-4

Status: Complete

Scope — implemented the top 4 items from the Phase R backlog:

- 저장한 코스 목록: `ProfileTab`에 "만든 코스 / 저장한 코스" 서브탭 추가, `savedTrips` derived list를 `mobile-app-shell.tsx`에서 넘김
- 코스 공유: `TripDetailSheet`에 공유하기(`navigator.share` → 클립보드 폴백) + 이미지로 저장(SVG→canvas→PNG 다운로드) 버튼 추가
- 수동 코스 빌더 진입점: 이미 존재하던 `addToChain(!hasResult)` 경로 자체는 그대로 두고, 첫 화면 링크는 다시 "바로 살펴보기" 하나로 정리 (진입은 결과 화면 노출 후 탐색 탭을 통해)
- 지도 리셋 버튼: `ConstellationCard` 줌 컨트롤에 "전체 동선 보기" 버튼 추가, `setBounds` 재호출로 원래 뷰 복귀

Verification: `pnpm lint` / `tsc --noEmit` passed; each item click-tested live in the browser.

### Mobile Phase T: Backlog Items 5/6/8/9 + Per-Place Menu Likes

Status: Complete

Scope — implemented backlog items 5, 6, 8, 9, plus a new feature requested alongside them (menu-level likes per place):

- **로그인/내 데이터 영속화 (5)**: 실제 백엔드/OAuth는 아직 없음(범위 밖) — 대신 `isSignedIn`, `publishedTrips`, `likedIds`, `savedIds`, `likedMenuIds`, `recentSearches`를 `localStorage`(`tripchain:profile`)에 저장하고 마운트 시 복원. SSR과의 hydration mismatch를 피하려고 초기 렌더는 항상 빈 상태로 시작하고, 마운트 후 effect에서 복원 (`react-hooks/set-state-in-effect` 규칙은 이 1회성 hydration에 한해 명시적으로 disable).
- **크리에이터 프로필 (6)**: 새 `creator-profile-sheet.tsx` 추가. `TripDetailSheet`에서 작성자 이름을 누르면 그 사람이 만든 코스 전체 + 합산 좋아요 수를 보여주는 전체화면 시트가 뜸.
- **최근 검색어 (8)**: 검색 성공 시 `recentSearches`에 push(중복 제거, 최대 5개, localStorage 저장). 첫 화면에서 기록이 있으면 로테이팅 예시 문구 대신 "최근 검색" 칩으로 바뀌어 보여줌 — 기록이 없으면 기존 로테이팅 문구 그대로.
- **GPS 기반 내 주변 (9)**: 검색창 안에 위치 아이콘 버튼 추가. `navigator.geolocation`으로 좌표를 받아 `nearestAreaId()`(하버사인 거리 계산, `mobile-data.ts`)로 성수/홍대/강남 중 가장 가까운 지역을 골라 바로 코스를 생성. 권한 거부/미지원 시 조용히 실패(스피너 해제)하도록 처리.
- **장소별 메뉴 + 좋아요** (신규 요청): 카페 카테고리 장소에 한해 메뉴 4~6개를 결정론적으로 생성(`getCafeMenu()`, place id 해시 기반 — Math.random 없음, hydration-safe)하고, 장소 상세 시트에 메뉴 목록 + 하트 좋아요 버튼을 추가. 좋아요 수 기준 정렬, 1위 메뉴에 "인기" 배지. `likedMenuIds`는 `{placeId}:{menuName}` 키로 저장/영속화.

Verification: `pnpm lint` / `tsc --noEmit` passed. Browser-tested: recent-search chip persists across reload; sign-in state persists across reload; geolocation denial resets the spinner without hanging; creator profile shows correct aggregated trips/likes; menu heart toggle updates count and re-sorts, and the liked key round-trips through localStorage.

Known gaps not covered here: item 7 (코스가 지역 하나에 갇힘) and items 10-13 below remain open.

### Mobile Phase R: Feature Backlog (compared against the web app at `/`)

Status: Notes only — items 1-4 done in Phase S, 5/6/8/9 done in Phase T, 7 and 10-13 still open

Scope: reviewed the frozen web app (`/`, `interactive-map.tsx` and friends) against the current mobile app (`/mobile`) to find functional gaps worth developing next.

7. **코스가 지역 하나에만 갇혀 있음** — 성수/홍대/강남 중 한 곳으로만 코스가 만들어진다. 인접 지역을 넘나드는 하루 코스는 현재 구조상(카테고리 안에서만 장소 pool을 뽑음) 불가능.
10. **좋아요한 코스 목록도 없음** — Phase S에서 "저장한 코스"는 만들었지만, `likedIds`(하트)는 여전히 카운트로만 쓰이고 별도로 다시 볼 목록이 없다. 저장 탭과 같은 패턴으로 바로 추가 가능.
11. **장소 자체를 북마크하는 기능이 없음** — 장소 카드의 "담기" 라벨은 사실 클릭해도 상세 시트를 열 뿐, 코스에 넣기 전 장소만 따로 찜해두는 기능은 없다. "코스는 아직 안 정했지만 이 장소는 나중에 가보고 싶다" 케이스를 못 다룸.
12. **카카오톡 공유가 없음** — Phase S에서 넣은 공유는 Web Share API/클립보드 기반인데, 한국 사용자 앱이라 카카오톡 공유하기가 훨씬 자연스럽다. 이미 카카오 지도 SDK 키를 쓰고 있어서, 카카오 디벨로퍼스 콘솔에서 카카오톡 공유 API를 같은 앱에 활성화하면 붙일 수 있음.
13. **AI 추천 실패 시 폴백 여부가 사용자에게 안 보임** — `/api/recommend`가 이미 `usedAI` 플래그를 응답에 담아 보내는데, 프론트엔드에서 그 값을 아예 안 쓰고 버린다. AI가 실패해서 기본 추천으로 대체된 경우에도 사용자는 평소와 똑같이 보여서, 왜 이유(reason)가 안 보이는지 알 길이 없음 — 작은 신뢰성 개선 포인트.

### Mobile Phase Q: Home/Explore/Ranking Polish Batch

Status: Complete

Scope — a large batch of small UI fixes/additions requested together:

- **Real bug found and fixed**: the 성수/홍대/강남 selector chips (and the same pattern on the explore area chips, list/map toggle, and publish-sheet visibility options) went invisible when active — white text landed on a white background. Root cause: `cn()` was layering an "active" class (`bg-primary text-white`) on top of a "base" class (`bg-surface text-muted-strong`) that sets the *same* CSS properties; Tailwind's generated stylesheet order (not JSX class order) decided which one won, and `bg-surface` was winning. Fixed by making every such pair mutually exclusive via a ternary instead of `base + conditional-override`, everywhere this pattern appeared.
- **Home results header**: the "OO 중심 코스" heading now shows the user's actual submitted prompt in bold instead; the AI's `reason` text below it had its own box/padding removed so it lines up flush-left with everything else in the card (this was never a `text-align` bug — both were already `text-align: start`, the reason box's own `p-3` padding was just indenting it further than its neighbors).
- **Chain cards redesigned**: 위로/아래로/삭제 replaced with compact icon buttons (`ChevronUpIcon`/`ChevronDownIcon`/`TrashIcon`) sitting beside the place name instead of a full-width button row below — cuts each card from two rows to one. Added real drag-to-reorder via a grip handle (`GripIcon`) using Pointer Events + `setPointerCapture` (not native HTML5 `draggable`, which doesn't work reliably on touch) — works for both mouse and touch.
- **"OO의 다른 장소" capped**: was showing every remaining place in the area (up to 46); now shows the top 3 per category (by save count) instead, so at most ~12 instead of dozens.
- **Constellation card added to Home results** (`src/features/mobile/constellation-card.tsx`): a scaled-down inline version of the web app's SNS-share "별자리 카드" — same dark/glow aesthetic, place coordinates normalized into an SVG viewBox and connected with a glowing lime polyline, numbered stops as glowing dots. Inserted directly under the "OO 일대" coverage line, not a downloadable image like the web version — just a live visual.
- **Place detail sheet**: tapping the dark backdrop now closes it the same as the × button, with a slide-down + fade exit animation (new `sheet-panel-out`/`sheet-backdrop-out` keyframes) instead of an instant unmount.
- **"바로 살펴보기 >" link** added at the bottom of the pre-search hero, in `--success` green at low opacity — routes straight to the 탐색 (Explore) tab for people who'd rather browse existing courses than type a prompt. (Interpreted this as the intent behind "굳이 검색 안 하고 싶은 사람들" — flagging in case a literal "찾아보기 without typing" flow inside Home itself was actually meant instead.)
- **Ranking tab rebuilt**: added a 주간 랭� / 실시간 랭킹 toggle (weekly = existing `rankScore`; real-time = a mock "activity" sort by likes+saves+comments, since there's no real time-series data yet) and an area filter chip row (전체/성수/홍대/강남), matching the explore tab's pattern.
- **Ranking card width bug fixed**: cards were rendering 423px wide inside a 390px track (33px horizontal overflow, visible as cards bleeding off the right edge). Root cause: a classic CSS Grid gotcha — the `<article>` grid item had no `min-width: 0`, so unwrapped `truncate` title text forced the item's min-content size past its track width. Fixed by adding `min-w-0` to the grid item itself (not just descendants) — also applied proactively to the home chain cards and "다른 장소" list items, which had the same latent (if not yet visibly triggered) issue.
- **Card alignment fixed between Explore and Ranking**: ranking cards had an inline rank-number badge before the thumbnail that explore cards didn't, pushing all ranking-card content 40px further right than explore-card content even though each card was internally consistent. Moved the rank number onto the thumbnail as a small overlay badge (same pattern already used on the home chain cards) so both tabs' cards now start content at the identical x-position (verified: both at 91px from card edge).

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser checks for every item above — chip contrast (`background: rgb(79,141,247)`, `color: rgb(255,255,255)` when active), bold prompt heading, capped "다른 장소" count (12), constellation SVG rendering, backdrop-click-close (dialog fully removed after ~200ms), "바로 살펴보기" routing to Explore, ranking toggle + area filter text updating live, ranking card width (390px, matches its track) and title left-offset (91px, matches explore)

### Mobile Phase P: Real AI Recommendations (Gemini)

Status: Complete

Scope:

- Added `POST /api/recommend` (`src/app/api/recommend/route.ts`), a Next.js API route that calls Gemini server-side (key never exposed to the client) to turn the user's free-text sentence into structured intent, then hands that intent to a new local scoring engine to actually pick and order the chain — replacing the old `inferArea()`-only + fixed-first-4 logic for real submissions.
- New pure module `src/features/mobile/recommend-engine.ts`: defines the shared attribute taxonomy (mirrors Phase M's place tags), scores every place in the target area (category match +50, each attribute-tag overlap +20, popularity as a small tiebreaker), then greedily builds the chain by rotating through the requested categories so it doesn't return 4 cafes in a row.
- Model chosen: `gemini-flash-lite-latest`, not `gemini-flash-latest` — benchmarked both directly against the API first. The lite model responded in ~1.4s using ~270 tokens with equally good structured output, versus ~4.7s and ~1270 tokens (mostly an internal "thinking" pass) for the non-lite alias. `thinkingConfig.thinkingBudget: 0` was tried to speed up the non-lite model but returned `400 INVALID_ARGUMENT`, so lite was the right call rather than fighting that.
- Client (`mobile-app-shell.tsx`): `recommend()` and the rotating-example tap now both call the API via a new async `startCourseFromPrompt()`, with a spinner in place of the arrow/lightbulb icon while in flight. `chooseArea()` (the area chip on the results screen) intentionally still uses the old synchronous `startCourse()` — switching area tabs should feel instant, not wait on a network round trip.
- Robustness: if the Gemini call fails, times out (8s `AbortSignal.timeout`), returns malformed JSON, or `GEMINI_API_KEY` is unset, the API route itself falls back to the old `inferArea()` + local scoring (still runs through the same scoring engine, just with an empty intent) and always returns a valid 200 response — the client never has to distinguish AI vs fallback beyond an informational `usedAI` flag. The client also wraps the fetch in try/catch as a second safety net.
- Surfaced the AI's one-line `reason` text under the quoted prompt on the results screen, so the recommendation doesn't feel like a black box.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build` (confirms `/api/recommend` registers as a dynamic server route)
- Passed: direct `curl` test against `/api/recommend` — correct area + 4 relevant, non-duplicate place ids + reason text, `usedAI: true`
- Passed: browser test — submitting "강남에서 쇼핑하고 분위기 좋은 저녁" correctly routed to Gangnam, picked a category-varied 4-place chain, and displayed the AI's reason line; no flash of an empty/incomplete results screen while the request was in flight (this was a real bug caught and fixed during this pass — `submittedPrompt` was originally set before the fetch resolved, flipping the layout to "results" before there were any results to show)

Known limitation (not fixed this pass): the scoring engine doesn't account for geographic proximity between picks within an area — a recommended chain can span sub-areas that aren't realistically walkable together in one outing (e.g., 건대 + 자양 + 서울숲 in one Seongsu chain). The original static "first 4 places" design had the same issue; worth revisiting once there's a reason to prioritize it.

### Mobile Phase O: 신사 → 신논현

Status: Complete

Scope:

- Follow-up to Phase N: moved all 15 places still labeled 신사 over to 신논현 (Sinnonhyeon), per explicit instruction to fully commit to the 강남역/신논현 side rather than keep a 신사 remnant.
- Relocated coordinates to real 신논현역/봉은사로 streets, renamed anything 신사/도산-specific (e.g. "프릳츠커피 도산" → "프릳츠커피 신논현", "세로수길 뒷골목" → "신논현 뒷골목길"), and updated descriptions that named 신사/도산 explicitly.
- Updated `areaMeta.gangnam.coverage` ("강남역 · 신사 · 역삼 · 논현" → "강남역 · 신논현 · 역삼 · 논현 일대") and recomputed `center`.
- Updated `inferArea()`'s Gangnam keyword regex: dropped the stale 압구정/청담 keywords (no place data has backed them since Phase N) and added 신논현/역삼/논현.
- Fixed the seed trip title/description again (now "강남역에서 신논현까지 잇는 프리미엄 데이트") since two more of its referenced places moved.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: no duplicate ids, 150 places total
- Passed: browser check — sub-area distribution now 신논현 15 / 강남역 9 / 논현 8 / 가로수길 11 / 역삼 7 = 50; coverage text and default recommended course both reflect 신논현

### Mobile Phase N: Gangnam Re-centered on the 강남역~신사 Line

Status: Complete

Scope:

- Gangnam beta area was skewed toward 신사~압구정 (Sinsa-Apgujeong); re-centered it on the 강남역~신사 corridor per explicit product direction.
- Kept 신사 (15 places) and 가로수길 (11 places) as the northern anchor, unchanged.
- Replaced the 압구정 (12 places) and 청담 (12 places) clusters — the previous southern/eastern anchor — with three new sub-areas along real Gangnam-daero/Teheran-ro geography: 강남역 (9), 역삼 (7), 논현 (8), for the same 50-place total.
- Relocated coordinates to real Gangnam-station-district streets, renamed places where the old name was neighborhood-specific (e.g. "카페 온리 로데오" → "카페 온리 강남대로"), and rewrote descriptions that referenced 압구정/청담 by name.
- Updated `areaMeta.gangnam.coverage` ("신사 · 압구정 · 가로수길" → "강남역 · 신사 · 역삼 · 논현 일대") and `center` (shifted south toward the new midpoint).
- Fixed a consistency gap this surfaced: the `seed-gangnam-shopping` feed trip's title/description still said "신사 압구정" even though 2 of its 4 referenced places had moved — updated to match.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: no duplicate ids, 150 places total, confirmed via grep count
- Passed: browser check — sub-area distribution confirmed (신사 15 / 강남역 9 / 논현 8 / 가로수길 11 / 역삼 7 = 50), coverage text and default recommended course both reflect the new corridor

### Mobile Phase M: Place Naming + Attribute Tags (prep for AI matching)

Status: Complete

Scope:

- Renamed all 150 places from generic "지역+장르" labels (e.g. "서울숲 브런치") to realistic-sounding business names, mixing invented independents with recognizable franchises for flavor (e.g. "프릳츠커피 뚝섬점", "나이키 라이즈 성수", "국제갤러리 신사") — explicitly mock/placeholder content per product direction, not factual claims about real locations.
- Added a structured attribute-tag layer on top of the existing 2 flavor tags per place (now 4 tags each), drawn from a fixed taxonomy so natural-language intent can actually match against them later:
  - 실내/외: 실내 · 실외 · 테라스
  - 상황: 데이트 · 혼자 · 친구모임 · 가족동반 · 반려동반
  - 분위기: 조용함 · 활기참 · 감성적 · 고급스러운 · 캐주얼 · 한적함
  - 목적: 포토존 · 휴식 · 체험형 · 쇼핑
- Tags assigned per-place based on each entry's actual description/category (e.g. outdoor-seating cafes got 실외, quiet work cafes got 혼자+조용함, pet popups got 반려동반), not applied uniformly.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: no duplicate place ids; exactly 150 place entries confirmed via grep count
- Passed: browser check — new names render throughout (chain builder, "다른 장소" list, place detail sheet), and the detail sheet correctly shows all 4 tags per place

Architecture Notes:

- This directly unblocks the next phase (real AI recommendations): the plan is for the recommendation API to have Gemini extract structured intent from the user's sentence, then score/filter locally against these tags — mirroring `parseSearchIntent`/`scorePlaceForSearch` already proven out in the web app's `src/features/map/interactive-map.tsx`.
- `.env.local` now also holds `GEMINI_API_KEY` (validated working against the `gemini-flash-latest` model — `gemini-2.0-flash` returned a quota error on this key's project, so `gemini-flash-latest` is the one to use in the API route).

### Mobile Phase L: Place Catalog Expansion (5 → 50 per area)

Status: Complete

Scope:

- Expanded `placesByArea` from 5 to 50 places per area (성수/홍대/강남), 150 total, ahead of wiring up a real AI recommendation step.
- Seongsu: kept the original 5 curated places first (so the default auto-picked course and `seedFeedTrips` references stay stable), then added 45 more adapted from the web app's existing rich Seongsu dataset (`src/features/map/interactive-map.tsx`) — reused real content/coordinates rather than authoring from scratch, since that catalog already covers the same "건대·서울숲·뚝섬" footprint.
- Hongdae and Gangnam: 45 new places each, hand-authored across their sub-areas (합정/망원/연남/연희/상수 · 신사/가로수길/압구정/청담) with plausible real-world coordinates.
- Bumped the explore map's single-area zoom level (6 → 7) after noticing the map only shows pins inside its current viewport — Seongsu's real footprint now spans ~5km (Seoul Forest to Guui/Jayang), so a chunk of the far pins were being panned out of view at the old zoom.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: no duplicate place ids (checked via grep across the whole file)
- Passed: browser check — home screen's "다른 장소" list shows all 46 non-default Seongsu places (46 + 4 in the default chain = 50); explore list/map correctly reflect the larger catalog

Note (not a bug, just an observation for later): the explore map only renders pins inside the current Kakao Maps viewport/zoom, so at the default zoom for a single area you won't see literally all 50 pins at once — same as any map app. Zoom bump above helps but doesn't fully solve it; worth revisiting once real AI recommendations reduce how much a user needs to browse the raw map.

### Mobile Phase K: Search Input Polish + Icon Revert

Status: Complete

Scope:

- Copy fix: "오늘은 어디를 갈까요?" → "오늘은 어디로 갈까요?"
- Reverted the submit-button icon for non-empty input from the magnifying-glass back to an arrow (`ArrowRightIcon`), because it visually duplicated the search icon already sitting on the left side of the same input. Empty-input state keeps the lightbulb icon from Phase H.
- Recolored the native search-input clear ("×") button to a neutral gray tone instead of its default OS/browser accent color, via `input[type="search"]::-webkit-search-cancel-button { filter: grayscale(1) opacity(0.55); }`.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: confirmed the icon swap logic and the new CSS rule are present in the served stylesheet

Debugging note (important for future sessions): the first attempt at the clear-button fix used a `mask-image: url("data:image/svg+xml,...")` data URI. That version built fine with `next build` but was silently dropped by the Turbopack **dev**-mode CSS pipeline specifically — it never appeared in the dev-served stylesheet even after edits and dev-server restarts, while `next build`'s output had it correctly. Root cause suspected to be the mixed double/single-quote nesting inside the data URI tripping up Turbopack dev's CSS transform. Switched to a `filter`-based approach (no data URI) and it now appears correctly in both dev and production output. If a CSS/JS change ever "doesn't show up" despite the source file being correct, verify by fetching the actual served chunk (`fetch(url, {cache:'no-store'}).then(r=>r.text())`) rather than trusting the DOM/CSSOM — and don't assume a dev-server restart fixes it if the underlying rule itself may be the problem.

Separately, during this same investigation a real dev-server process-management bug was found and fixed: the restart script (`Stop-Process` by port lookup + immediately `Start-Process` on the same port) could silently fail to release port 3000 in time, leaving an old process serving stale content while later "restarts" no-op. Confirmed via `Get-NetTCPConnection -LocalPort 3000` before assuming a restart succeeded; a `Get-Process node` StartTime check across multiple "restarts" showed the same PID/StartTime still listening. Fix: kill by PID from `Get-NetTCPConnection`, wait, confirm the port is free, only then start, and confirm the "Ready" log line appears before trusting the new server.

### Mobile Phase J: Copy Update + Blue/Green Blobs Meeting

Status: Complete

Scope:

- Copy changes on the hero and results header: "원하는 하루를 말해보세요." → "오늘은 어디를 갈까요?"; "...코스를 추천합니다." → "...체인을 추천합니다."; search placeholder "예: 성수 팝업 보고 조용한 카페" → "원하는 체인을 말해보세요."
- Diagnosed why the blue (primary, top-left) and green (success, bottom-left) blobs never met after the Phase I containment fix: their vertical excursion was capped at ~70px while they sit roughly 470px apart vertically, so they could never reach each other.
- Gave blob-a (blue) and blob-c (green) much larger vertical reach (up to ~190-195px toward each other, timed to peak around the same point in their cycle) so they periodically overlap, while blob-b and blob-d also got noticeably more vertical travel (~120-175px) for the general "more up/down movement" ask.

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser check confirming updated copy text and placeholder render correctly, and the new blob keyframe rules (larger vertical translate values) are present in the served stylesheet

### Mobile Phase I: Blob Overlap + Beta Label Tweak

Status: Complete

Scope:

- Raised the "Beta" label closer to the logo (`-mt-3` instead of `mt-1`)
- Redesigned all 4 blob paths to stay closer to their own corner (amplitude reduced from up to 140px back to ~40-70px) instead of sweeping across the whole container, cutting down how often they visually overlap
- Added a springy/back-out `animation-timing-function` at each path's outer keyframe stops so the motion reads as bouncing outward and snapping back rather than a smooth drift
- Fixed the "겹치면 색이 너무 진해짐" (overlaps looking too dark/muddy) complaint at the root: added `isolation: isolate` on `.hero-blobs` and `mix-blend-mode: screen` on `.hero-blob` so any residual overlap lightens/blends instead of stacking opacity into a darker patch

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser check confirming `isolation: isolate` / `mix-blend-mode: screen` are applied and the Beta label now sits directly under the logo with a tight negative gap

### Mobile Phase H: Background Blobs + Recommend Icon

Status: Complete

Scope:

- Replaced the recommend/auto-generate icon (shown when the search input is empty) with a lightbulb icon (`LightbulbIcon`, `app-icons.tsx`); the search icon still shows once the user types something
- Gave each of the 4 background blobs its own distinct animation path (`blob-drift-a/b/c/d`, one new keyframe added) with 4-5 keyframe stops instead of 2-3, moving both horizontally and vertically (up to ~140px) and pulsing scale far more dramatically (0.6x-1.45x instead of 0.8x-1.28x)
- Staggered each blob's duration (12s-16s, all different) so their paths desync over time and cross paths in the middle of the container, reading as if they bump past each other rather than moving in lockstep
- Enlarged the blobs themselves (160-220px → 190-260px) for more visual presence

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser check on a fresh tab confirming all 4 blobs have unique `animationName`/`animationDuration` values and the new sizes, and the submit button renders the lightbulb icon when empty

### Mobile Phase G: Landing Screen Polish Round 2

Status: Complete

Scope:

- Bottom nav (홈/탐색/랭킹/프로필) is now hidden entirely on the pre-search hero screen; it mounts with a spring/bounce "pop up" entrance (`nav-pop-in` keyframe, back-out easing) the moment a course result appears
- Reworked hero layout to true full-height centering: header (logo/Beta/title/subtitle) is pinned near the top via `position: absolute`, and the search form + rotating example are independently centered at `top: 50%` of the full hero container — so the search bar's vertical position no longer shifts when the header's content (e.g. logo size) changes
- Logo enlarged 4x (32px → 128px) and placed above a standalone "Beta" label (replacing the "Trip Chain Beta" text on this screen only; the post-search screen still shows "Trip Chain Beta" as before); tightened the logo-to-label gap by making the image `block` (removes inline baseline whitespace) instead of relying on negative margin
- Made the rotating example line lighter (`text-muted`, `font-medium` instead of `text-muted-strong`/`font-semibold`) and gave it more breathing room from the search bar (`mt-7` instead of `mt-5`)
- Increased the background blob animation amplitude/speed (translate distance roughly doubled, duration cut from 16-20s to 10-13s, blur reduced 48px→40px, opacity raised slightly) so the movement is clearly visible instead of barely perceptible

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser check on a fresh tab — nav absent pre-search, `nav-pop-in` animation confirmed on the nav element right after a search is submitted, logo confirmed at 128px height, search form center measured at ~46% of hero height (vs ~55-61% before this fix), blob animation confirmed running at the new faster duration

Architecture Notes:

- Home tab now renders two structurally distinct layouts (pre-search hero vs post-search results) via a ternary at the top of the `activeTab === "home"` block, instead of one shared container with conditional classes — the two screens diverge enough (absolute-centered hero vs normal-flow list) that sharing one container was fighting the layout rather than helping.
- The shared search form JSX was extracted into a `searchForm` local variable so both branches render identical markup without duplication.

### Mobile Phase F: Landing Screen Refinement

Status: Complete

Scope:

- Fixed the background blob animation actually not rendering: the running dev server (Turbopack) had gotten stuck serving a stale CSS chunk after an earlier duplicate-variable compile error and never recovered on its own. Restarted the dev server (with a clean `.next` cache) to resolve it — confirmed by inspecting the served CSS chunk directly, not just the DOM.
- Added the `tripchain-logo.svg` wordmark above the "Trip Chain Beta" label on the pre-search hero screen
- Re-laid-out the pre-search hero: heading/subtitle/logo now sit near the top (`pt-10`), while the search bar + rotating example are wrapped in their own centered flex block so the search bar lands near the vertical middle of the screen regardless of header height
- Replaced the ambiguous circular arrow button with a state-aware icon: sparkles icon + "코스 자동 추천 받기" label when the input is empty, magnifying-glass icon + "이 문장으로 코스 검색" label once the user types something

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: browser check on a fresh tab confirming blob CSS is present in the served stylesheet and animating (`getComputedStyle().animationName`), logo renders, submit icon/aria-label swap correctly between empty and non-empty input, and search bar sits near the vertical center (~55% of screen height)

Architecture Notes:

- New icons (`SparklesIcon`) added to `src/components/layout/app-icons.tsx` alongside the existing icon set.
- If a future edit to `globals.css` or a component stops showing up despite the file being correct on disk, suspect a stuck Turbopack dev process (check the served asset directly with `fetch(...).then(t => t.text())` before assuming the code is wrong) and restart the dev server as done here.

### Mobile Phase E: Landing Screen Redesign

Status: Complete

Scope:

- Rewrote the pre-search hero copy: "원하는 하루를 말해보세요." / "성수, 홍대, 강남 중심으로 코스를 추천합니다."
- Added an animated gradient-blob background (4 soft blurred circles using the brand palette: `--primary` #4f8df7, `--primary-strong` #2f6fe4, `--warning` #b7e86b, `--success` #8fbf45) that drifts slowly via CSS keyframes, shown only on the pre-search hero screen
- Replaced the static 3-button example list with a single rotating suggestion line (no background box) that cycles through 5 example prompts every 5 seconds with a fade/slide-up transition; tapping it still starts a course with that example
- Made the prompt submit button circular with an arrow icon instead of a rectangular "추천" label

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: manual browser check — hero text, blob elements, circular button, and rotating example line all confirmed present and advancing on a fresh tab with a clean console

Architecture Notes:

- Blob and rotator animations live in `globals.css` (`.hero-blob*`, `.example-rotator`) and respect `prefers-reduced-motion`.
- The blob layer only mounts pre-search (`!hasResult`) to keep the post-search list screens focused; content siblings use `relative z-10` to stack above it.

### Mobile Phase D: Explore Map + Visual Polish

Status: Complete

Scope:

- Added a real Kakao Maps embed to the 탐색 (explore) tab, reusing the app's existing `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`, with a self-contained loader (`kakao-loader.ts`) kept independent from the web-only loader in `src/features/map/interactive-map.tsx`
- Added lat/lng to every mobile place (`mobile-data.ts`) using approximate real-world coordinates for each Seongsu/Hongdae/Gangnam sub-area, plus an area center/coverage lookup used to recenter the map
- Added list/map toggle, a search box, and area filter chips (전체/성수/홍대/강남) to the explore tab
- Tapping a map marker opens the same `PlaceSheet` used elsewhere; adding a place to the chain from outside an active home course now auto-starts a course context (fixes a gap where "담기" from explore had nowhere to land)
- Design polish pass to address the "투박한" feedback: added a category-colored icon thumbnail (`place-thumb.tsx`, `place-icons.tsx`) used consistently across chain stops, other-place rows, feed cards, and trip itineraries instead of plain text rows; added slide-up/fade-in animation for both bottom sheets and a slide-in for the trip detail page (`globals.css`)

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: manual browser walkthrough — explore map renders 15 markers across all areas, Kakao SDK loads with the existing app key, marker tap opens place detail with thumbnail, area/search filters narrow the list correctly

Architecture Notes:

- Kakao SDK types/loader are duplicated (not imported) between `src/features/map` (web, frozen) and `src/features/mobile` (mobile, active) by design, per the earlier decision to keep the two surfaces decoupled.
- Category color/icon system now lives in `mobile-data.ts` (`categoryTone`) and `place-icons.tsx`, shared by the map markers and the `PlaceThumb` component so visuals stay consistent.
- Next candidates: category filter chips on the explore list (not just the map), a real AI-driven recommendation instead of keyword-based area inference, and backend persistence.

### Mobile Phase C: Full Mock Product Loop

Status: Complete

Scope:

- Ported the web product's direction into `/mobile` as a simplified single-screen mock, per explicit product decision to keep data fake for now and prioritize showing the intended experience
- Added a self-contained mobile data layer at `src/features/mobile/mobile-data.ts` (place seed data per beta area, feed trip seed data) so mobile stays decoupled from the web-only `src/features/map` code
- Added a mobile place detail bottom sheet (`place-sheet.tsx`) reachable by tapping any course stop or "다른 장소" item, with an add-to-chain action
- Added a mobile publish flow (`publish-sheet.tsx`) with title/description/visibility and minimum-place validation
- Added a full-screen trip detail view (`trip-detail-sheet.tsx`) with itinerary, stats, like, and save actions
- Added bottom tab navigation: 홈 (prompt + builder), 탐색 (feed), 랭킹 (sorted by score), 프로필 (mock auth + my trips)
- Added a shared feed list component (`trip-feed-list.tsx`) reused by explore, ranking, and profile
- Intentionally left out of this mobile mockup: a real interactive map surface and an admin dashboard, since the product ask was to keep this simple and consumer-facing
- All data remains client-local/session-only; no backend or persistence yet

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: manual browser walkthrough on a 375x812 viewport — prompt submit, area switch, place detail sheet, add-to-chain, publish with validation, trip detail, explore feed (shows new + seed trips), ranking sort order, profile stats and my-trips list

Architecture Notes:

- Mobile feature code lives under `src/features/mobile`, independent from `src/features/map` (web-only, frozen).
- `MobileAppShell` owns all cross-tab state (chain, published trips, likes, saves, auth) and passes it down; child components stay presentation-focused.
- Next phase should be decided by the user: candidates include a simplified mobile map view, real AI-driven recommendations, or backend persistence.

### Mobile Pivot Preview

Status: Complete

Scope:

- Stop extending the desktop web surface from this point forward
- Preserve the existing web home at `/` without further product changes
- Recompose the current product into a single mobile-sized screen
- Add the mobile/app preview at `/mobile`
- Keep local preview available through the existing Next.js dev server
- Treat this as a mobile web/PWA prototype before choosing a native app stack

### Mobile-Only Direction

Status: In progress

Scope:

- Continue product work only under `/mobile`
- Make the mobile first screen a blank AI-prompt style entry point
- Recommend beta courses for three regions: Seongsu, Hongdae, and Gangnam
- Define Seongsu coverage as Geondae, Seoul Forest, and Ttukseom
- Define Hongdae coverage as Hapjeong, Mangwon, Yeonnam, Yeonhui, and Sangsu
- Define Gangnam coverage as Sinsa, Apgujeong, Garosu-gil, and nearby premium areas
- Keep recommendations local/mock until real AI and persistence are introduced

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: `/mobile` responds with 200

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
- Passed: `/` web home responds with 200
- Passed: `/mobile` mobile preview responds with 200

### Phase 1: Initialize Project

Status: Complete

Scope:

- Next.js app with App Router
- TypeScript
- Tailwind CSS
- ESLint
- pnpm package manager
- Git repository initialized on `main`

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Keep application code under `src`.
- Future phases should use feature-based folders under `src/features`.
- Shared UI primitives should live under `src/components`.
- External integrations should be isolated under `src/services` or `src/lib`.
- Next phase should establish design tokens, theme primitives, and base reusable components before app screens are implemented.

### Phase 2: Design System

Status: Complete

Scope:

- Korean-first metadata and page language
- Global color, radius, shadow, typography, and dark mode tokens
- Shared utility helper: `cn`
- Base UI primitives: `Button`, `Card`, `Badge`
- Browser-visible design system board replacing the default English template

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Design primitives live under `src/components/ui`.
- Non-visual shared helpers live under `src/lib`.
- The home screen is still a Phase 2 preview board, not the final product home.
- Next phase should compose the global app layout shell without implementing the map yet.

### Phase 3: Global Layout

Status: Complete

Scope:

- Korean-first application shell for the home surface
- Top search area
- Left discovery panel
- Right quick actions
- Bottom navigation
- Placeholder map canvas reserved for Phase 4
- Shared icon button primitive

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Global shell lives under `src/components/layout`.
- Page route stays thin and only renders the shell.
- Map implementation is intentionally deferred to Phase 4.
- Marker and place-card logic remain deferred to Phase 5 and Phase 6.

### Phase 4: Fullscreen Interactive Map

Status: Complete

Scope:

- Replaced the central placeholder with a fullscreen-style Kakao Map canvas
- Added automatic Kakao Maps JavaScript SDK loading
- Added environment-based app key setup through `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- Added custom zoom in, zoom out, and reset controls
- Hid Kakao native map type, skyview, scale, and zoom controls to avoid duplicate UI
- Kept the marker system and place detail cards deferred to Phase 5 and Phase 6

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Map behavior lives in `src/features/map/interactive-map.tsx`.
- `AppShell` remains responsible for global layout and only composes the map feature.
- The map currently uses Kakao Maps JavaScript SDK and requires a Kakao JavaScript app key.
- `.env.example` documents the required `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` variable.
- Kakao app key issuance still requires the user's Kakao Developers account and registered Web platform domain.
- Next phase should introduce a marker data model and marker interactions without mixing place-card state into the map canvas.

### Phase 5: Marker System

Status: Complete

Scope:

- Added a typed place marker data model
- Rendered Kakao custom overlays as category-colored map markers
- Added category filters for all, exhibition, cafe, popup, and walk markers
- Added selected marker state and map recentering from marker/list interactions
- Kept rich place detail cards deferred to Phase 6

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Marker data currently lives beside the map component as seed MVP data.
- Marker rendering uses Kakao `CustomOverlay` so the visual system can be branded without relying on default pin assets.
- Phase 6 should move selected marker details into a dedicated place-card component rather than expanding the map component further.

### Phase 6: Place Detail Cards

Status: Complete

Scope:

- Added a dedicated `PlaceDetailCard` component
- Extended seed marker data with address, description, distance, duration, price, tags, hours, and save count
- Opened the detail card from marker and place-list interactions
- Added close and reopen behavior for the selected place card
- Kept actual Trip Chain candidate mutation deferred to Phase 7

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Place detail display is separated from Kakao map setup in `place-detail-card.tsx`.
- The map component still owns selection and focus state until Phase 7 introduces builder state.
- The "candidate add" button is a UI affordance only; Phase 7 should wire it to Trip Chain builder state.

### Phase 7: Trip Chain Builder

Status: Complete

Scope:

- Added a dedicated `TripChainBuilder` component
- Wired the place detail card's candidate action to real chain state
- Prevented duplicate place additions and showed added state in the detail card
- Added ordered chain display with focus, move up, move down, remove, clear, and preview affordances
- Added Kakao map polyline preview that connects chain places in the selected order
- Added estimated total dwell-time summary for the current chain

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Builder state currently lives in `InteractiveMap` because publishing and persistence are deferred.
- `TripChainBuilder` is presentation-focused and receives all mutation handlers as props.
- Chain preview uses Kakao `Polyline` and is cleared when the chain has fewer than two places.
- Phase 8 should convert the in-memory builder state into a publishable draft with title, description, visibility, and validation rules.

### Phase 8: Trip Publishing

Status: Complete

Scope:

- Added a dedicated `TripPublishPanel` component
- Added publish preparation from the current in-memory Trip Chain
- Added title, description, and visibility fields
- Added validation rules for minimum places, title length, and description length
- Added a publish-ready confirmation state without writing to a backend

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Publishing is still client-local and does not persist data.
- The panel receives the current chain as props and does not mutate map state.
- Phase 9 should use the publish draft shape to render a Trip detail page preview or route.

### Phase 9: Trip Detail Page

Status: Complete

Scope:

- Added a shared `TripDraft` shape for publish output
- Added a dedicated `TripDetailPreview` component
- Connected publish draft submission to a full-page detail preview
- Rendered title, description, visibility, place count, total duration, ordered itinerary, and summary rail
- Kept permanent route, sharing URL, comments, likes, and persistence deferred to later phases

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Trip detail is currently an overlay preview rather than a Next.js route.
- Draft creation is still client-local and suitable for UI validation only.
- Phase 10 should introduce an Explore feed using seed/published trip cards without requiring backend persistence yet.

### Phase 10: Explore Feed

Status: Complete

Scope:

- Added `CommunityHub` overlay
- Added feed cards for seed Trip Chains
- Surfaced the latest locally published draft at the top of the feed
- Added like and save actions as local UI state

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 11: User Authentication

Status: Complete

Scope:

- Added mock guest/signed-in state
- Added a Kakao-style sign-in action placeholder
- Kept real OAuth, token handling, and session persistence deferred

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 12: User Profiles

Status: Complete

Scope:

- Added profile summary surface
- Added local stats for published trips, saves, likes, and following
- Connected profile state to local social actions

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 13: Social Features

Status: Complete

Scope:

- Added local like, save, and follow interactions
- Added social summary cards with comments, likes, and saves
- Kept real comments, notifications, and backend counters deferred

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 14: Ranking

Status: Complete

Scope:

- Added weekly ranking tab
- Added seed ranking scores
- Sorted local and seed trips by ranking score

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

Architecture Notes:

- Phases 10-14 are implemented as client-local MVP surfaces inside `CommunityHub`.
- These phases intentionally avoid persistence and server identity until database integration.
- Phase 15 should introduce a data model and persistence boundary for users, trips, social actions, and ranking inputs.

### Phase 15: Database Integration

Status: Complete

Scope:

- Added `local-database.ts` as the MVP data boundary
- Centralized seed trips, seed users, admin metrics, draft-to-feed conversion, and ranking helpers
- Kept real backend reads/writes deferred behind the new boundary

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 16: Admin Dashboard

Status: Complete

Scope:

- Added an Admin tab to `CommunityHub`
- Added local metrics for trips, users, saves, comments, and reports
- Added a review queue placeholder for moderation operations

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 17: Optimization

Status: Complete

Scope:

- Kept Kakao SDK loading behind a shared promise
- Preserved cleanup for custom overlays and chain polylines
- Added `performance-notes.ts` with optimization checkpoints
- Reduced fixture duplication by centralizing local seed data

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 18: Refactoring

Status: Complete

Scope:

- Refactored feed seed data out of `CommunityHub`
- Split local database helpers from presentation components
- Kept typed draft and feed conversion boundaries stable

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`

### Phase 19: Documentation

Status: Complete

Scope:

- Added `docs/MVP_STATUS.md`
- Documented current MVP scope, data boundary, persistence status, future backend entities, and verification commands

Verification:

- Passed: `pnpm lint`
- Passed: `pnpm build`
