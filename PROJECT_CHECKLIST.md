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

### Mobile Phase AF: Real Brand Icons for the Share Menu (simple-icons), Instagram Added

Status: Complete (pending final visual re-check — a stray Kakao login popup from an earlier manual test blocked browser automation; verify KakaoTalk badge rendering once closed)

Scope — user explicitly asked not to hand-draw share icons and to use "정식 아이콘 이미지" (official icon assets), plus add Instagram:

- Installed `simple-icons` (CC0-licensed, `github.com/simple-icons/simple-icons`) as a real dependency rather than fetching arbitrary image files from the internet. Added `src/features/mobile/brand-icons.tsx` with `XIcon`/`FacebookIcon`/`InstagramIcon`/`WhatsAppIcon`/`KakaoTalkIcon` — each the exact official path data from that package, `fill="currentColor"` so badge color comes from the wrapping button like every other icon in this app.
- Replaced the hand-coded letter glyphs ("X", "f") and repurposed generic icons (`TalkBubbleIcon` for Kakao, `CommentIcon` for WhatsApp) in `trip-detail-sheet.tsx`'s share popover with the real brand marks. Corrected Facebook's badge color to their current official blue (`#0866FF`, from simple-icons' own data — the `#1877F2` used before was their previous brand blue).
- Added a dedicated Instagram badge (its own tooltip/aria-label take over from the old generic "share" one) using the classic recognizable orange→pink→purple gradient background with the white Instagram glyph on top — since Instagram (like TikTok) has no public share-intent URL, this button and the original generic one both trigger the same `shareTrip()` OS share sheet; there's no other way to reach either platform from a website.

Verification:

- Passed: `pnpm exec tsc --noEmit`
- Passed: `pnpm lint` (same 2 pre-existing `no-img-element` warnings as Phase AE, unrelated to this change)
- Pending: full browser re-check of all 5 badges rendering correctly, especially KakaoTalk's icon (a combined app-icon-shape path relying on subpath winding to render its cutout correctly) — blocked mid-verification by a leftover Kakao login popup from earlier manual testing that the automation can't dismiss

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
