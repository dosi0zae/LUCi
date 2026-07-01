# Trip Chain MVP Status

## Current Scope

Trip Chain is implemented as a client-side MVP. It supports:

- Kakao Map rendering through `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- Place markers and detail cards
- Trip Chain building with ordered places
- Chain preview with Kakao `Polyline`
- Publish draft preparation
- Trip detail preview
- Explore feed, mock auth/profile, social actions, ranking, and admin seed views

## Data Boundary

`src/features/map/local-database.ts` acts as the local data boundary for the current MVP. It contains:

- Seed feed trips
- Seed users
- Admin metrics helpers
- Draft-to-feed conversion
- Ranking helpers

This keeps UI components from owning raw fixture data and makes a future database adapter easier to introduce.

## Persistence Status

No real backend writes happen yet. The current implementation uses React state and seed data only.

Recommended future backend entities:

- `users`
- `places`
- `trips`
- `trip_places`
- `likes`
- `saves`
- `follows`
- `comments`
- `reports`
- `ranking_snapshots`

## Verification

The MVP should pass:

```bash
pnpm lint
pnpm build
```

## Next Real Integration Step

Phase 15 is represented by the local data boundary. To make it production-backed, replace `local-database.ts` helpers with API/database calls while keeping component props stable.
