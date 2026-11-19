# PROGRESS.md

Where the project stands. Read with [PROJECT.md](./PROJECT.md) at the start of every session, and update this file
when a piece of work is finished.

_Last updated: 2026-11-23_

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

### 2. 3D city and streets (2026-11-20)
- **3D view** (`src/app/(game)/city/city-3d.tsx`, React Three Fiber + drei, loaded only on `/city` in the browser):
  map-style camera (drag to pan, scroll/pinch to zoom, right-drag/two fingers to rotate and tilt, limits keep it over the
  city), plus zoom, rotate and reset buttons. Renders only on change (`frameloop="demand"`). Low-poly models for all 15
  buildings built from shared shapes (`models.tsx`), shadows, a hedge around your land. Tap a building to select it;
  placing shows a green/red footprint.
- **Roads**: a new `road` category and building (5 coins a tile). In 3D, the Road tool draws by dragging (an L-shaped path
  along the longer side first) with a live "N tiles · cost" bubble; existing road is skipped and free; a path through a
  building or past the edge is refused. Road tiles pick their shape from their neighbors (curbs on open sides, dashed
  centre lines) and are drawn as three instanced meshes. **Bulldoze** tool: drag over roads and buildings to demolish them
  (half back, one confirm).
- **Buildings only count when they touch a road** (`src/lib/roads.ts`, not diagonal). Unconnected buildings get a red
  marker, aren't counted in population/jobs/happiness, and the City advisor says how many need a road.
- **Flat view** (`flat-board.tsx`, the old grid) is still there with a 3D | Flat switch (remembered per browser): roads
  shown joined, tap to lay one road tile or bulldoze one item, keyboard navigation as before.
- Database: migrations `20261120000000_road_category.sql` and `20261120000100_roads.sql`: `buy_roads(jsonb)` (up to 200
  tiles, one ledger row per stroke, all-or-nothing) and `sell_buildings(uuid[])`. 17 pgTAP tests (`roads.test.sql`);
  6 more unit tests (stroke paths, road shapes, connections, stats with roads).
- Checked with a sample city in headless Chromium (WebGL): render, zoom/rotate buttons, road drag preview and cost,
  selecting a building by tapping it, flat view and remembered choice, 390px with no horizontal scroll, no console errors.
  Not checked: real touch gestures on a phone, and saving through a real Supabase (the next step below).

### 3. More task schedules (2026-11-21)
- Tasks repeat **once, daily, weekly, monthly, quarterly, yearly, on certain weekdays, or N times a week / month**
  (`tasks.weekdays` ISO 1–7, `tasks.times_per_period` 2–7 a week or 2–31 a month, checked by constraints).
- Every completion is for one local day (at most once a day per task); periods are the day, ISO week, calendar month,
  quarter or year in the user's time zone. `complete_task()` refuses a certain-days task on other days
  (`not_scheduled_today`) and stops once the period's count is reached; `undo_task()` takes back the latest check-off in
  the current period. `my_tasks()` now returns `period_count`, `period_target`, `scheduled_today` and `today`.
- **Today** page: "Other days" section for certain-days tasks that aren't on today ("Next: Monday"); progress such as
  "1 of 3 this week" or "Done this quarter"; the add form has day chips (with Weekdays / Weekends shortcuts) and a
  times-per-period number. Helpers in `src/lib/tasks.ts`.
- Migrations `20261121000000_task_repeat_values.sql`, `20261121000100_task_schedules.sql`; 25 pgTAP tests
  (`task_schedules.test.sql`), 4 unit tests (`tasks.test.ts`). Form and list checked at 390px.

### 4. Dark navy look and color themes (2026-11-21)
- Colors are theme roles (`bg`, `surface`, `raised`, `line`, `ink`, `muted`, `faint`, `header`, `accent`, `accent-text`,
  `accent-soft`, `good`, `bad`, `coin`… as Tailwind colors, e.g. `bg-surface text-ink`), defined per theme in
  `globals.css` (`[data-theme="…"]`). Use roles, not fixed palette colors (map tiles and markers excepted).
- Themes: **Navy** (default), Midnight, Forest, Ember (dark) and Light. **🎨 Theme** in the header switches it; the choice
  is saved in the browser (`localStorage`, applied by an inline script in `<head>` before first paint, so no flash).
  The 3D sky follows the theme (`--t-sky`). Native form controls follow via `color-scheme`.
- `src/lib/themes.ts`, `src/components/theme-picker.tsx`. Checked in a browser: default navy, switching to Forest and
  Light, remembered after reload, sign-in page, no console errors.

### 5. Focus timer (2026-11-22)
- **Focus** (`/focus`, new nav item): pick 5–60 minutes (slider in 5-minute steps, quick picks 15/25/45/60) and an
  optional label; earn **1 coin per minute**, up to **180 focus coins a day** (separate from the 400 task-coin cap).
- While running: countdown ring, screen kept on (Wake Lock API where supported), "leave the page?" warning on close.
  Leaving the page (another app or tab) for more than **10 seconds** ends the session with no coins; a shorter absence
  shows a warning. "Give up" asks to confirm. A refresh resumes a running session. Phones vibrate at the end.
  The web can't tell locking the phone from switching apps, so the instructions say to leave the phone face down with
  the page open.
- Server rules (migrations `20261122000000_focus_ledger_kind.sql`, `20261122000100_focus_sessions.sql`):
  `focus_sessions` (RLS read own, no direct writes; one running session per user), `start_focus(minutes, label)`
  (abandons any running one), `complete_focus(id)` (only after the full time, within 10 minutes of the end; otherwise
  abandoned with no coins; ledger kind `focus`), `fail_focus(id)`. 19 pgTAP tests (`focus.test.sql`).
- Today's list shows sessions (done / ended early / not finished), minutes focused and focus coins vs the cap.
- **End chime** (`src/lib/chime.ts`, Web Audio, no sound file): three rising notes played twice at time-up. "🔔 Chime
  when time is up" switch with a Play button (remembered per browser, on by default). Browsers only allow sound after a
  tap, so Start unlocks audio; after a refresh mid-session a "Tap to turn on the end chime" button appears. On iPhone
  the silent switch mutes it; Android also vibrates. Browser-checked by counting the notes played.
- Checked in a browser at 390px: picker and reward text, countdown, short absence warns, 11-second absence ends the
  session, no hydration warnings.

### 6. Deployment (2026-11-22)
- **Vercel project `life-city`** on the Laundromat Success team (`prj_2zdxO8FUOmQLItDjSGfCL9xWt2sU`), live at
  **https://life-city-five.vercel.app** (also `life-city-laundromat-success.vercel.app`). Production is public;
  Vercel login protection applies to preview deployments only. Env vars: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production, preview, development).
- Redeploy: `npx vercel deploy --prod --yes --token <any>` from the repo (the sandbox proxy supplies the real
  credentials; the project link is in `.vercel/`, git-ignored). Not connected to GitHub auto-deploys.
- Commit author: at the owner's request this repo's local git config uses the owner's account email (Vercel only builds
  work by team members); Claude is credited with a `Co-Authored-By` line.
- The sandbox's network can't reach the deployed site, so live checks need the host allowed or happen elsewhere.

### 7. Live: database, sign-in settings, end-to-end test (2026-11-23)
- Life City is a **separate business**: the Supabase project moved to its own organization ("Life City",
  `hazgvmhweytvjtbzevpy`; same project ref and keys). The Vercel project is still on the Laundromat Success team (next step).
- Database set up by the owner in the SQL Editor (the MCP `apply_migration` confirmation never reached them). Verified:
  7 tables with RLS, 16 building types, all 9 repeat kinds, anon can't read tables or call game functions. Security
  advisor: 13 WARN "signed-in users can execute SECURITY DEFINER function" for the game actions, which is intended
  (they only act on `auth.uid()`'s rows). Note: `supabase_migrations` history holds only a no-op `connection_check`
  row, so `supabase db push` would try to re-run every migration; record the 7 versions before using the CLI.
- Supabase Auth: Site URL `https://life-city-five.vercel.app`, redirect `https://life-city-five.vercel.app/**`,
  "Confirm email" off (built-in mail only reaches team members; add a real sender before launch).
- **Live end-to-end test** on the deployed site at 390px with a throwaway account (deleted afterwards): sign-up → 100
  coins and Chicago time zone saved; daily task +25; 3×-a-week task "1 of 3 this week"; focus start + give up (failed, no
  coins); road + cottage in flat view (105 coins, population 4); 3D view renders; coin history; sign out and back in.
  The database rows matched. No console errors.
- Fix: the 3D view's starting camera pulls back on portrait screens so the whole city fits.

### 8. Phase A: core loop (2026-11-23)
- **Four life areas: Health, Work, Knowledge, Personal** (enum renames learning → knowledge, home → personal; social
  merged into personal and blocked by constraints; the `social` label stays in the enum unused).
- **One coin + area points.** Every check-off earns area points = the task's base reward (even past the daily coin cap);
  focus sessions can count toward an area (points = minutes). Points are never spent. **Buildings unlock by points**
  (`building_types.unlock_points`, e.g. Park 75 Health, Office Tower 375 Work); `unlock_count` is gone.
  `my_progress()` now returns `health, work, knowledge, personal` points.
- **Epic** difficulty (100 coins / points).
- **Gentle habits**: recurring tasks pay one-off **milestone bonuses** at 10 / 30 / 100 / 365 total check-offs (25 / 75 /
  250 / 500 coins, kept forever; undo takes back that check-off's bonus). Task rows show a 7-day rhythm strip, "5 of the
  last 7 days" (or "2 of 3 this week"), an encouraging word and the next milestone. Missed days only ease the rate down;
  nothing resets (`src/lib/habits.ts`; an unfinished today never counts against you).
- **Navigation**: City is home; bottom tab bar on phones (City, Tasks, Focus, Shop, Stats), the same links in the header on
  wide screens. `/today` → `/tasks` and `/coins` → `/stats` redirect. Sign-in lands on `/city`.
- **Shop** (`/shop`): every building by category with price, effects and unlock progress; Build opens the city with it
  picked (`/city?place=<id>`). **Stats** (`/stats`): coins, check-offs and focus (last 7 days / all time), population,
  check-offs per day chart (single series, per-theme validated `--t-chart`, hover/focus tooltips, screen-reader table),
  habit consistency, area points, city numbers, coin history.
- Migrations `20261123000000_phase_a_enums.sql`, `20261123000100_phase_a.sql`; 19 pgTAP tests (`phase_a.test.sql`), other
  suites updated (142 total); unit tests 27 (habits, milestones, points).
- **Not yet applied to the live database** (owner runs the SQL) and not yet deployed/live-tested.

## Next steps
1. Run `npm run db:start`, `npm run test:db` and a full browser pass on a machine with Docker; then regenerate
   `src/lib/database.types.ts` with `npm run db:types` (currently hand-written).
2. **Vercel access after the move**: the owner moved `life-city` (`prj_2zdxO8FUOmQLItDjSGfCL9xWt2sU`) off the
   Laundromat Success team; the sandbox's Vercel token only covers that team, so reconnect the Vercel connector with
   access to the new account, recreate `.vercel/project.json` (`{"orgId": <new scope>, "projectId": "prj_2zdx…"}`) and
   redeploy (the portrait-camera fix from 7 is committed but not deployed). Never deploy without that file: the CLI
   then silently creates a new project. A stray empty `life-game` project created that way on the Laundromat Success
   team (2026-11-23) still needs deleting.
3. Little cars on roads, day/night lighting, CC0 3D models (e.g. Kenney city kit).
4. Goals and milestones (bonus coins), habit streaks with a multiplier, progress charts on a dashboard.
5. City depth: adjacency effects (shops near homes, industry far from them), small passive income.
6. Polish: building animations, phone app (PWA) and reminders.

## Notes
- Next.js 16: middleware is `src/proxy.ts`; with Cache Components, session reads go inside `<Suspense>`
  (see the game layout and pages). Read `node_modules/next/dist/docs/` before using unfamiliar APIs (AGENTS.md).
- After a migration: `npm run db:reset`, `npm run db:types`, `npm run test:db`.
