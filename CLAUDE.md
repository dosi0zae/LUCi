# Trip Chain

Korean-first Next.js 16 (Turbopack) + TypeScript + Tailwind app that recommends cultural-tourism courses ("체인") across Seoul. Start with `docs/HANDOFF.md` for current state, decisions, and next steps.

## Working on it

- The active product is the mobile app at `/mobile` (`src/components/layout/mobile-app-shell.tsx`, `src/features/mobile/`). The desktop web app at `/` and `src/features/map/` are frozen — don't extend them.
- Package manager is pnpm via corepack. `pnpm` may not be on PATH in the shell, so use `corepack pnpm ...`.
- Dev server: `corepack pnpm dev -p 3002` (matches `.claude/launch.json`). Next 16 allows only one `next dev` per project directory, so stop any old one first.
- Verify with `corepack pnpm exec tsc --noEmit` and `corepack pnpm lint`. Both must pass before reporting work done.
- Secrets live in `.env.local` (gitignored, copy it by hand between machines). `.env.example` lists the variable names. `NEXT_PUBLIC_KAKAO_MAP_APP_KEY` is used for both Kakao Maps and KakaoTalk sharing.
- All user data (likes, saves, bookmarks, comments, published trips) is client-local in `localStorage` key `tripchain:profile`. There is no backend.
- Every UI string goes through i18n (`src/features/mobile/i18n/translations.ts`, ko/en/ja/zh). Adding a key to `ko` makes TypeScript require it in the other three.

## Conventions the user has asked for

- Reply in Korean, short, and report after each finished step.
- Keep UI consistent with what exists: flat 2D stroke icons from `app-icons.tsx` (no emoji), the segmented-control style used for the list/map and ranking toggles, and the dropdown-menu pattern used by the trip-detail "⋯" menu. Avoid one-off brand colors on whole buttons.
- When two class sets set the same CSS property, use a ternary, never base + override (Tailwind stylesheet order, not JSX order, decides the winner).
- Document each finished batch in `PROJECT_CHECKLIST.md` as a "Mobile Phase" entry.

## Browser-testing gotchas

- HMR churn makes ref/coordinate clicks flaky and the console log is cumulative. Confirm "no errors" on a freshly opened tab, and check state with scripted `element.click()` plus class/text assertions.
- React controlled inputs: use real typing (`computer` type), not setting `.value` from JS.
- The KakaoTalk share popup (`sharer.kakao.com`) blocks all browser-tool navigation until it is closed.
- In PowerShell 5.1, don't redirect native-command stderr with `2>&1`; write to a file with `*>` and read the exit code.
