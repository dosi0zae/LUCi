# Trip Chain handoff (2026-09-22)

Summary of the working sessions with Claude so a new session on another machine can continue. Read `CLAUDE.md` first for setup and conventions, and `PROJECT_CHECKLIST.md` (Mobile Phases S–V) for per-phase verification notes.

## Set up on a new machine

1. `git clone https://github.com/dosi0zae/LUCi.git`, then `corepack pnpm install`.
2. Copy `.env.local` from the old machine by hand (it is not in git). It needs `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` and `GEMINI_API_KEY`; see `.env.example`.
3. `corepack pnpm dev -p 3002`, open `http://localhost:3002/mobile`.
4. For KakaoTalk sharing to work, the "카카오톡 공유" product must be enabled on the Kakao app, and the domain you browse from (e.g. `localhost:3002`) must be registered as a Web platform in the Kakao Developers console.

## What the product is now

Mobile-first app (`/mobile`) that turns a free-text prompt into a walkable course across Seoul's real POIs (TourAPI + heritage data in `src/features/mobile/seoul-places.json`, synced by `scripts/sync-seoul-places.mjs`). Gemini (`gemini-flash-lite-latest`, `/api/recommend`) extracts intent; `recommend-engine.ts` scores places, picks around an anchor within a radius (or a named district) and orders by shortest route. UI is in ko/en/ja/zh. The old Seongsu/Hongdae/Gangnam-only design is gone.

## Done in the last sessions

- **Old backlog (Phase U)**: liked-courses list, place bookmarks ("찜한 장소" in profile), KakaoTalk share (`kakao-share.ts`), AI-vs-basic course badge with fallback notice. Backlog #7 (course stuck in one district) was already fixed by the city-wide pivot.
- **Code review pass**: fixed the AI badge showing on non-AI courses, Kakao SDK loaders never retrying after one failure and hanging on `Kakao.init` errors, duplicated `haversineKm`, a dead alias in `trip-feed-list.tsx`.
- **Phase V**: overlapping numbered map markers (two seed places share identical coordinates, so chips are now fanned ~12m apart while the route line keeps real coordinates); profile sub-tabs are an icon segmented control (MY / bookmark / heart / eye); real trip comments (seed comments via `getSeedComments`, user comments in localStorage, counts folded into `allTrips`); KakaoTalk share moved into the "공유하기" popover menu; comment count uses a 2D `CommentIcon`.
- **Housekeeping**: removed a stale merged git worktree that polluted lint/tsc; `.env.example` is now tracked (`!.env.example` in `.gitignore`).

## Known open items (from the code review, not fixed)

- No sequencing between concurrent course generations (quick-browse, locate-nearby, AI search, refresh); a slow earlier call can overwrite a newer result.
- `constellation-card.tsx` builds the Kakao map once against `containerRef`; if the chain drops below 2 stops and returns, the map can stay bound to a detached div.
- Refactor candidates: the sheet-close animation logic is copied across `category-sheet`, `place-sheet`, `publish-sheet`, `language-menu-button`; the place-card markup is copied in three files; the lat/lng projection is duplicated between `constellation-card.tsx` and `trip-detail-sheet.tsx`; `getCurrentLocation()` isn't reused by `locateNearby` and the explore effect.
- Comments can't be deleted or replied to; there are no place-level reviews.

## Suggested next steps

1. Place-level reviews/ratings, paired with the existing place bookmarks.
2. A real backend (auth + DB, e.g. Supabase) so likes/saves/comments/published trips survive device changes. This is the largest piece and touches most of the shell's state.

## Done since (2026-09-22)

- **Mobile Phase W**: fixed `changeRadius` dropping the district constraint — `/api/recommend` now returns `areaFilter`, kept in a new `courseAreaFilter` state and passed into `buildChain` on every 반경 wider/narrower tap. See `PROJECT_CHECKLIST.md`.
