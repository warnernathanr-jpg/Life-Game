# PROGRESS.md

Where the project stands. Read with [PROJECT.md](./PROJECT.md) at the start of every session, and update this file
when a piece of work is finished.

_Last updated: 2026-11-19_

## Done

### 1. Tracker, coins and a playable city (2026-11-19)
- **Auth:** email + password sign-up and sign-in (`/signup`, `/login`), `/auth/confirm` for email links (works whether
  or not the Supabase project requires email confirmation). The browser's time zone is saved at sign-up.
  `src/proxy.ts` refreshes the session and sends signed-out visitors from `/today`, `/city`, `/coins` to `/login`;
  pages and actions also check (`requireUser()`).
- **Database** (`supabase/migrations/20261119000000_initial_schema.sql`): `profiles` (time zone, city name, size, land
  purchases), `tasks`, `task_completions` (one per task per period: the day, the Monday for weekly, ever for one-off,
  in the user's time zone), `coin_ledger`, `building_types` (15 buildings seeded), `placed_buildings`. Functions:
  `complete_task`, `undo_task`, `buy_building`, `move_building`, `sell_building` (half back), `buy_land`
  (8×8 start, +2 per purchase up to 30×30, 300 × 1.6ⁿ coins), `my_progress`, `my_tasks`. New users get 100 coins.
  2×2 buildings (apartments, office tower, factory) with overlap checks in SQL.
- **Today** (`/today`): to-do / done / archived lists with check-off and undo, coin pop, add-task form, coins earned
  today vs the 400 cap, and per-area unlock progress ("2 more → Park").
- **City** (`/city`): grid board (tiles at least 28px, scrolls inside its frame on big cities), shop with category tabs,
  locked items show what unlocks them, placement preview (green/red), keep placing while affordable, select → move or
  demolish, buy land, rename city, stats (population, jobs, happiness, city score) and "City advisor" tips.
  Keyboard: arrow keys move between tiles, Enter places/selects, Escape cancels.
- **Coins** (`/coins`): balance, earned, spent and the last 200 ledger entries.
- **Tests:** 62 pgTAP tests (`supabase/tests/database/economy.test.sql`: rewards, periods, cap, undo, unlocks, bounds,
  overlap, prices, direct-write attempts, isolation between two users, anon) and 9 unit tests (`src/lib/game.test.ts`).
- Checked: lint, types, production build; a browser check of the city board and task list with sample data at 390px
  and 1280px (placement preview, taken-spot refusal, selection, no horizontal scroll, no console errors), the landing
  and sign-in pages, and the signed-out redirect.
- **Not yet checked end to end** (sign-up → tasks → buy in a real browser against Supabase): the sandbox couldn't
  download the local Supabase Docker images (Docker Hub rate limit). The pgTAP tests ran on plain Postgres 16 with a
  stand-in `auth` schema.

## Next steps
1. Run `npm run db:start`, `npm run test:db` and a full browser pass on a machine with Docker; then regenerate
   `src/lib/database.types.ts` with `npm run db:types` (currently hand-written).
2. Create a Supabase project and a Vercel project; push migrations (`npx supabase db push`) and set the env vars.
3. Goals and milestones (bonus coins), habit streaks with a multiplier, progress charts on a dashboard.
4. City depth: roads, adjacency effects (shops near homes, industry far from them), small passive income.
5. Polish: isometric art (e.g. CC0 Kenney city tiles), building animations, phone app (PWA) and reminders.

## Notes
- Next.js 16: middleware is `src/proxy.ts`; with Cache Components, session reads go inside `<Suspense>`
  (see the game layout and pages). Read `node_modules/next/dist/docs/` before using unfamiliar APIs (AGENTS.md).
- After a migration: `npm run db:reset`, `npm run db:types`, `npm run test:db`.
