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
