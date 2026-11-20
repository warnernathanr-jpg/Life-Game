# PROGRESS.md

Where the project stands. Read with [PROJECT.md](./PROJECT.md) at the start of every session, and update this file
when a piece of work is finished.

_Last updated: 2026-11-28_

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
- LifeCity is a **separate business**: the Supabase project moved to its own organization ("LifeCity",
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
- **Live (2026-11-23):** owner applied the SQL; deployed from GitHub. Live test at 390px with throwaway accounts (deleted):
  sign-up lands on City with the 5 bottom tabs; Epic Work task +100 coins / 100 Work points; daily habit shows the rhythm,
  "1 of the last 1 days" and "9 to go for +25 bonus"; area points and next unlocks; Shop shows Warehouse locked
  (25 more Work points); Build → "Placing Cottage" in the city; Focus area choices; Stats tiles, chart, habits, history.
  No console errors.

### 9. Homes renamed; buildings face the road (2026-11-23)
- Cottage → **House**, Family House → **Townhome** (🏘️), on the density ladder House → Townhome → Apartments. Display names
  only: ids stay `cottage` (House) and `house` (Townhome). Migration `20261123000200_rename_homes.sql` (applied live via
  the Supabase MCP `execute_sql`, which ran without a confirmation prompt). 1 more pgTAP test (143).
- In 3D, each building turns its front (doors, awnings, garage) toward the side with the most road along it
  (`facingFor()` in `src/lib/roads.ts`, 3 unit tests; ties: south, east, west, north; no road → south).
- Phase C note from the owner: the city core should get denser as you level up (upgrade a House in place to Townhome →
  Apartments → Skyscraper rather than demolishing).

### 10. Building colors (2026-11-23)
- Every 3D building gets its own color scheme from palettes per part (walls, roofs, doors, facades, awnings, office glass,
  industrial siding, accents, tents, tree crowns), picked by a seed from the building's id (`colorSeed()` + `pick()` in
  `models.tsx`), so colors are random across buildings but stable for each one across visits. Fire stations stay red
  and clinics white so they stay recognizable. Checked with a 50-building sample: varied, identical after reload.

### 11. City depth, landscaping, upgrades, rewards (2026-11-24)
- **Rotate**: buildings with road on 2+ sides get a Rotate button (cycles road sides); saved in
  `placed_buildings.facing` via `set_building_facing()`; a saved side only applies while it still has road
  (`roadSides` / `effectiveFacing` / `nextFacing` in `src/lib/roads.ts`). One road side → automatic.
- **2x2 industry**: Workshop and Warehouse are 2x2 with new models (the live Workshop fit where it stood).
- **Parks**: Small Park 1x1, **Basketball Court** 2x2, **Garden Park** 3x3, **Central Park** 4x4 (sizes up to 4 allowed).
- **Placing** ends after one building (no Cancel needed); paint tools stay on.
- **City Stats** card (`CityStatsPanel`, `HealthPill`): city health 0–100 (happiness, jobs balance, road connections,
  service coverage) with label; population/jobs/happiness/score with notes; "Why happiness is N%" factor list (services,
  shops, housing, pollution, nature (capped at +10), unemployment, worker shortage, no services, buildings without roads,
  **life balance** from the four area points); "What to do" tips. Engine: `cityStats(placed, types, progress)`.
- **Worker shortage**: when jobs > residents, shops and industry get a yellow marker (3D and flat) and a warning in the
  selected panel with the staffing %.
- **Landscaping**: new `landscape` category with **Trees** (3) and **Water** (6), painted by dragging like roads through
  the new `buy_tiles(type, tiles)` (roads use it too). Water joins into ponds with sandy shores; tree tiles are seeded
  clusters. Empty land shows grass tufts, rocks and bushes; **beyond the city edge** there are woods, rocks and grass.
- **Townhome rows**: neighboring townhomes facing the same way join walls and roofline (`rowJoins()`).
- **Upgrades**: House → Townhome → Apartments for the price difference (`building_types.upgrades_to`,
  `upgrade_building()`; Apartments need a free 2x2 covering the old tile, shifted up/left if needed).
- **No daily coin limits** (tasks and focus pay in full).
- **Cars** drive the road network (right-hand lane, random turns, U-turn at dead ends; up to 14).
- **Build menu**: under All, buildable items first, then a "Locked" group.
- **Phone gestures on the 3D map**: one finger scrolls the page (tap still selects), two fingers pan and zoom; while
  painting one finger draws. Set with CSS `[data-map] canvas { touch-action: … !important }` because the controls library
  resets the inline style. Verified with touch emulation (swipe scrolls 235px; pinch changes the map, not the page).
- **Home screen + notifications rewards**: PWA manifest, icons (`public/icons`), `public/sw.js` (shows pushes, opens the app).
  Popups (`src/components/reward-prompts.tsx`): add-to-home-screen walkthrough (iPhone Share steps, Android menu steps, or
  an Install button) → 200 coins paid when the app is opened standalone; then "Turn on notifications" → subscription saved
  (`push_subscriptions`, endpoint/keys not readable by the app) → 200 more. One-time via `user_rewards` + `claim_reward()`.
  Dismissing snoozes a popup for 3 days. **Sending notifications isn't built yet**: the VAPID public key is in
  `src/lib/push.ts`, but its private key was not stored (the sandbox can't move secrets). When building sending: create a
  new key pair server-side, put the private key in Vercel (sensitive) and the public key in `push.ts`, and re-subscribe
  devices whose subscription uses the old key.
- Migrations `20261124000000`–`000400` (applied live via `execute_sql`). pgTAP 185 (new: `parks_industry`, `landscape`,
  `upgrades`, `rewards`); unit tests 38.

### 12. Mouse wheel on the 3D map (2026-11-24)
- The wheel over the map scrolls the page (a capture-phase listener on the map box stops it reaching the 3D controls);
  **Ctrl/⌘ + wheel** (and trackpad pinch, sent as Ctrl + wheel) zooms the map. A hint ("Hold Ctrl (⌘ on Mac) and scroll
  to zoom the map") shows briefly on plain wheel. +/− buttons, drag-to-pan and right-drag-to-rotate unchanged.
  Browser-checked: wheel scrolls the page over the map; Ctrl + wheel zooms without scrolling; hint appears and fades.

### 13. Cheaper roads, "!" markers, delete-only tasks, history calendar, 3D only (2026-11-25)
- **Roads cost 1 coin** a tile (migration `20261124000500_cheap_roads.sql`, applied live). Demolishing a road refunds nothing
  (half of 1 rounds down).
- **Map legend** lists only the markers. Buildings without a road show a red **"!"** badge (always facing the camera) in 3D.
- **Tasks are deleted, not archived.** Migration `20261124000600_delete_tasks_keep_history.sql` (applied live):
  `task_completions.title` (filled by a trigger at check-off), `task_id` nullable with `on delete set null`, so a deleted
  task's check-offs keep counting toward points and history. The 4 archived live tasks were deleted (their check-offs kept).
  6 pgTAP tests (`delete_tasks.test.sql`).
- **Stats → History** is a month calendar of completed tasks (`history-calendar.tsx`, `?month=YYYY-MM`): area-colored dots
  per day, tap a day for its tasks and times. The coin history list is gone.
- **Flat view removed** (`flat-board.tsx` deleted); the city is 3D only.

### 14. Bridges, full-screen city, bigger City Stats (2026-11-25)
- **Bridges**: drawing a road across water turns those tiles into bridge tiles (10 coins each; the plain road tiles still 1).
  Bridges count as road (connections, cars), sit level with the road and have concrete side walls with a guardrail. They
  can't be moved; demolishing one turns it back into water with nothing back. Migration `20261125000000_bridges.sql`
  (applied live): `bridge` type, `buy_tiles` (road over water → bridge), `sell_buildings` / `sell_building` (bridge → water),
  `move_building` (`cant_move`). 12 pgTAP tests (`bridges.test.sql`, 203 total); `isRoadType()` in `src/lib/roads.ts` (1 unit test).
- **Full screen** (⛶ on the map): the map fills the window (also the browser's own full screen where allowed), with the city
  name, coins, status and Exit at the top and a bottom **build bar**: Select, Residential 🏠, Commercial 🏪, Industrial 🏭,
  Services 🏛️, Roads 🛣️, Parks 🌳, Landscape 🌲, Bulldoze. Tapping a group pops up its buildings as cards over the map (price,
  size, locked points). A selected building shows its panel as a sheet. One finger moves the map; the plain mouse wheel
  zooms; Escape leaves. `build-overlay.tsx`; groups in `BUILD_GROUPS` / `buildGroupOf()` (`src/lib/game.ts`, Parks split out
  of Services). The side Build list uses the same groups as tabs.
- **City layout**: the tool row above the map is gone (Road/Trees/Water are in Build; 🚧 Bulldoze is a map button; a "Done"
  banner ends painting or bulldozing). The marker key and the health pill at the top are removed. **City Stats** sits right
  under the map with a larger layout (big health number and bar, four big tiles, happiness reasons and tips side by side).
- Roads and bridges never offer Rotate.
- Fix: the Stats history calendar showed nothing (the month query used an impossible date, e.g. Nov 31).

### 15. Water redone, varied tree tiles, phone scrolling (2026-11-25)
- **Water** is one smooth surface per pond (`waterGeometry()`, 3×3 vertices per tile, custom shader): deep blue in the middle
  fading to lighter shallows near land (per-vertex distance to the nearest non-water tile), a thin, gently moving foam line at the very edge. The sand border is replaced by a **grassy bank** (darker, lusher green than
  the lawn) with seeded mossy rocks and reed clumps. Shader colors are linear and the shader source is ASCII-only.
- **Trees tiles** pick one of six styles from the tile's seed (mixed grove of 4, pine stand of 5, big shade tree with
  shrubs, slim clump with rocks, dense woods of 6, meadow with two trees and flowers), with jittered positions, sizes and
  crown colors.
- **Phones**: finger gestures on the map are handled by the app itself with plain touch events (the controls library's
  pointer-based touch handling didn't move the map on the owner's real phone): one finger drags the map, two fingers pan,
  pinch to zoom and twist to rotate (while painting, one finger draws). The controls only handle the mouse
  (`touches` both off). `[data-map] canvas { touch-action: none }` everywhere; the page scrolls by swiping above or below
  the map (50vh on phones). Animations pause while the page scrolls, off screen and in background tabs (`MotionGate`);
  phones render at most 1.5× with 1024px shadows. Emulated iPhone 13 with real touch events: drag, pinch, twist all move
  the map, the page doesn't scroll.
- The water's ripple pattern ("bubbles") was removed at the owner's request; only the shore foam line moves.

### 16. Knowledge group (2026-11-25)
- Schools and libraries (already unlocked by Knowledge points) have their own **📚 Knowledge** group in the build menu, the
  full-screen build bar and the Shop page (`KNOWLEDGE_IDS`; the Shop page now uses `BUILD_GROUPS` too). 1 unit test.

### 17. Living city: named citizens, trips, pedestrians; in-app confirmations (2026-11-25)
- **Citizens** (`src/lib/sim.ts`, worked out in the browser, no database): every home gets named residents (seeded by the
  building id, so the same home always has the same people; up to 80 simulated), with ages, a job at a reachable
  workplace (filling its job slots), a school place for children if there's a school, or retired / looking for work.
- **Daily routine** on a game clock (a day = 6 real minutes, starting 7:15 AM): commute to work ~7–7:50 AM and home
  ~4:30–5:20 PM (sometimes via the shops), school 7:30 AM–3 PM (sometimes the park after), errands and park visits in
  free time, sleep 9:30 PM–6:30 AM; little ones stay home. Trips follow the shortest road route (BFS from each building's
  road entrance); short trips are walked on the sidewalk, longer ones driven (each citizen has their own car color).
  Buildings without a road: residents stay home, nobody can work there.
- **Traffic** (`traffic.tsx`, pooled meshes: 32 cars, 32 walkers) replaces the old random cars. **Clock pill** on the map with
  **⏸ / ▶**. **Tap a car or a person** (paused or not) for a card: name, age, job, "Driving to work at Corner Shop", from
  where, arrival time; a yellow marker follows them and their destination is outlined. Tapping a **home** lists who lives
  there, a **workplace** who works there, a **school** its students; "Find →" opens that person's card.
- Fix: the ground grid lines took every tap first (a line's hit area is a tile wide); they now ignore taps.
- **In-app confirmations** (`src/components/confirm.tsx`, `useConfirm()`) replace the browser's popups: demolish, bulldoze,
  buy land, delete task, give up focus. Escape cancels without also leaving full screen.
- Bridges' Demolish button says "Take down (back to water)" (it showed a refund it doesn't give).
- 6 unit tests (`sim.test.ts`); browser check: 16 people out at 7:40 AM (12 cars, 4 walkers), pause freezes the clock, tapping a
  paused car shows "Ben Ivanova, 38 · Works at School · Driving to work at School · arrives about 7:57 AM", house lists its 4
  residents and Find opens the card.

### 18. Road types, build preview + Confirm, one-finger building, trees cleared (2026-11-25)
- **Road types**: Dirt Road (1 coin; packed earth with wheel ruts, no curbs), **2-Lane Road** (5; the old road, existing roads
  keep it), **4-Lane Road** (10; dark asphalt, double yellow centre line, white lane dashes). All join up and carry traffic;
  any of them across water builds a bridge (10); drawing one kind over another replaces those tiles (pay the new price).
  `ROAD_TYPES` / `isRoadType()` in `src/lib/roads.ts`; `Roads` draws each kind (`variant`).
- **Build preview + Confirm**: tapping a spot while placing or moving shows the building there and a bar ("🏠 House · 🪙 40 ·
  Build here / Cancel", or why it can't go there); tap elsewhere to move the preview. Drawn road/trees/water strokes are
  added to a highlighted preview (several strokes can be drawn) with "N tiles · cost · bridges / replaced roads / trees
  cleared" and Build / Cancel. Nothing is bought without Confirm; switching tools drops the preview.
- **One finger only**: a second finger on the map cancels the stroke being drawn and nothing is drawn until all fingers lift.
- **Building over trees** clears them (no refund): `private.lot_free` ignores tree tiles, and the trigger
  `placed_buildings_clear_trees` deletes trees under anything placed, moved, upgraded or painted (water, roads). The app's
  `lotFree` matches.
- Migration `20261125000100_road_types_trees.sql` (applied live). 13 pgTAP tests (`road_types_trees.test.sql`, 216 total);
  older road/bridge tests pin or switch the road type. Browser check: road types render, stroke shows the bar without buying,
  Cancel clears it, house preview bar, pinch while drawing leaves no preview.

### 19. Full building catalog, rectangular footprints (2026-11-25)
- **48 buildings** in groups **Residential** (Small Cottage, Starter House, Suburban House, Townhouse, Duplex 2×1, Apartment
  Building, Luxury Home, High-Rise), **Commercial** (Coffee Shop, Convenience Store, Grocery 2×1, Restaurant, Clothing, Bank,
  Movie Theater, Hotel, Shopping Mall 3×3, + Office Tower), **Industrial** (Small Factory, Manufacturing Plant, Warehouse 2×1,
  Distribution Center 3×3, + Workshop), **Services** (City Hall, Police, Fire Station, Hospital, Medical Clinic),
  **Knowledge** (Elementary School 2×1, High School, University 3×3, Library 2×1), **Recreation** (Neighborhood Park,
  Community Center 2×1, Gym 2×1, Pool, Museum 3×1, Golf Course 4×3, Stadium 4×4, Zoo 4×4, + Basketball Court, Garden Park,
  Central Park), **Transport** (Gas Station, Bus Station, Parking Garage 2×1, Airport 3×3) and **Landmarks** (Monument).
  Existing ids kept and renamed where they match; the owner chose to keep the 5 extras. Home ladder: Small Cottage → Starter
  House → Suburban House → Townhouse → Apartment Building → High-Rise.
- **Rectangular footprints**: `building_types.w` / `d` (`size` = the larger), `placed_buildings.rotated`;
  `private.lot_free_rect()`, `buy_building(type, x, y, rotated)`, `move_building(id, x, y, rotated)`; the tree-clearing
  trigger uses the footprint. In the app every lot is `{x, y, w, h}` (`footprint()` in `src/lib/game.ts`); the preview bar has
  **⟳ Turn** for rectangles; a rectangle's front faces one of its long sides (`allowedSides()` in `roads.ts`).
- **3D models** for every new building (`models-catalog.tsx`, one seeded color set per building, `palFor()`), plus new 2×1
  models for Warehouse, Elementary School, Library and Community Center.
- **Simulation**: recreation buildings are places to visit; children 5–13 go to elementary school, 14–17 to high school, and
  some 18–22-year-olds study at the university.
- Owner's account given 1,000 points per area (4 "Test points" completions, 0 coins) so every building is unlocked for testing.
- Migration `20261125000200_catalog.sql` (applied live). 12 pgTAP tests (`catalog.test.sql`, 229 total; upgrade tests follow
  the longer ladder); unit tests 47.

### 20. Map controls, full-screen page, road polish, drag to place (2026-11-26)
- **Shop page removed** (`/shop` redirects to `/city`; the build menu has everything). Bottom tabs: City, Tasks, Focus, Stats.
- **Full screen is its own page** (`/play`, outside the game layout: only the map, fixed to the window), so it opens the same way
  every time on phones; ⛶ goes there, ✕ Exit back to `/city`. City data loading is shared (`city/load.tsx`).
- In full screen: **📊 Stats** opens City Stats over the map; the zoom/rotate buttons are gone (drag, scroll, pinch instead).
- **Computer**: click and drag moves the map, the **mouse wheel zooms** (no more Ctrl + wheel), right-drag rotates.
- **Drag to place**: while placing or moving, press on the preview and drag it tile by tile (the map doesn't pan meanwhile;
  a second finger cancels); a tap on the preview doesn't move it.
- **Roads**: 2-lane and 4-lane share the same asphalt and curbs (the darker 4-lane looked like a block); dirt is a light gravel;
  curbs/sidewalks are wider and **people walk on the sidewalk**. **Roads can't run side by side** (no 2×2 block of road tiles;
  crossings and corners are fine; existing ones stay): `buy_tiles` raises `roads_side_by_side`, the preview bar explains it.
- **Airport is 4×4** (none were built at 3×3).
- The "Now facing the … road" message after Rotate is gone.
- Migration `20261125000300_no_side_by_side_roads.sql` (applied live). 5 pgTAP tests (`road_spacing.test.sql`, 234 total).

### 21. Line icons instead of emojis (2026-11-26)
- At the owner's request there are **no emojis anywhere**: the app uses one line-icon set, **Lucide** (`lucide-react`, free,
  lucide.dev). `src/components/icons.tsx` maps every building (`BuildingIcon`), build-menu group (`GroupIcon`) and life area
  (`AreaIcon`) to an icon, plus `CoinIcon` / `BulldozeIcon`. Tabs, header, build list and bar, building cards and effect chips,
  City Stats, map buttons, clock and pause, citizen card, tasks, focus, history calendar, reward popups and the landing page
  all use them. `AREAS` / `BUILD_GROUPS` no longer carry emoji fields; the `building_types.icon` column is no longer shown.

### 22. Goals, task icons, Stats page about you, new fonts (2026-11-26)
- **Goals tab** (`/goals`, in the bottom bar: City, Tasks, Goals, Focus, Stats): a goal has a title, optional icon and life area,
  a **reach-it-by date**, notes and **steps** (subtasks: add one per line when creating, add/check/delete later). Cards show the
  date and "N days left / past the date", a progress bar from the steps, Mark goal reached / Reopen, Delete (in-app confirm);
  reached goals fold away under "Completed". No coins yet (Phase B can add rewards).
- Migration `20261126000000_goals_task_icons.sql` (applied live): `goals`, `goal_steps` (RLS: own rows; a step only on your own
  goal; the owner writes directly since no coins move), `tasks.icon`, `my_tasks()` returns `icon`. 9 pgTAP tests (`goals.test.sql`,
  243 total).
- **Task icons**: an icon picker (`src/components/icon-picker.tsx`, 50 Lucide icons listed in `src/lib/task-icons.ts`, validated on
  the server) on the add-task and add-goal forms; task rows and goals show the icon (`ItemIcon`, falling back to the area icon).
- **Stats page** is about tasks, habits, focus and goals only (Goals tile replaces Population; the city card is gone). City numbers
  live on the City page.
- **Fonts**: Figtree for text and Bricolage Grotesque for headings (instead of the default Geist that most new Next.js apps use);
  JetBrains Mono for code.
- Fix: an import had been placed above `"use server"` in `actions.ts` (lint warned); the directive is first again.

### 23. Full screen loads fresh; Stats page only about you (2026-11-26)
- Entering/leaving full screen is a full page load (`hardNavigate()` in `city-board.tsx`): with client navigation Next.js kept the
  City page alive in the background (two 3D views running). Found in the live test (2 canvases on /play).
- **Stats page**: no area points, coins or city numbers; tiles are Done today, Check-offs, Focus, Goals; then the check-offs chart,
  habits and the history calendar.
- Live test (throwaway account, deleted): 5 tabs, new heading font, /play fills the screen with Stats and Exit, a task with the
  dumbbell icon, a goal with 3 steps (1 checked → 33%), Stats tiles.

### 24. Road icons, traffic that yields and turns smoothly (2026-11-26)
- **Road icons** drawn in Lucide's style (`createLucideIcon` in `icons.tsx`): Dirt Road (slightly uneven edges + pebbles), 2-Lane
  (dashed centre line), 4-Lane (double centre line + lane dashes), Bridge (deck over water). The Roads group uses the 2-lane icon.
- **Traffic** (`traffic.tsx`): each trip has its own progress `u` (tiles) instead of a fixed timetable. `pointAt()` keeps right and
  crosses each tile edge to edge, **curving through corners** (quadratic curve through the lane's corner). Cars **keep their
  distance** (stop when a car is < 0.42 tiles ahead in their lane; two cars on the same spot: one waits), **take turns at
  intersections** (tiles where 3+ roads meet are held by one car at a time; others wait at the edge; a 4-second timeout prevents
  gridlock), and **don't pull out** onto a car at their starting point. Arrival times are estimated from the remaining distance.
- Browser check on a 3×3 street grid with ~25 cars for 15 s: 0 overlapping pairs (closest 0.22 tiles; 37 overlaps before the
  tie-break and departure check), cars caught mid-turn in 54 of 60 samples.

### 25. Map layers (2026-11-26)
- **Layers** button in full screen (`/play`) opens a list; the chosen layer tints the map **green (good) → red (bad)** with a legend
  (scale, good/bad words, what it means). Layers (`src/lib/layers.ts`, `computeLayer()`):
  - **Traffic**: daily commute trips (each citizen to work or school and back) counted per road tile, against capacity (dirt 3,
    2-lane / bridge 8, 4-lane 20).
  - **Fire hazard** / **Crime**: a base risk per building (industry, dense housing, shops higher), cut by fire station / police
    coverage (fades over 9 tiles).
  - **Education**: elementary (8 tiles), high school (12), university (18), library (8) coverage for each home.
  - **Health care**: clinic (7) or hospital (14) coverage for each home.
  - **Pollution & noise**: from factories, warehouses, distribution, gas stations and the airport, fading over 6 tiles, on every
    land tile. **Land value**: parks/recreation, landmarks, water and trees raise it, pollution lowers it.
  Buildings get a see-through colored box as tall as the model; land and roads get flat tinted patches (`LayerOverlay`, instanced).
- City Stats: the close button sits in the header row (it covered the "Thriving" label); the happiness face no longer collapses.
- 5 unit tests (`layers.test.ts`).

### 26. Goals and steps earn coins; tap again for Select (2026-11-26)
- **Goals use the task tiers** (Easy / Medium / Hard / Epic). Each **step** has its own tier and pays like a task (10 / 25 / 50 / 100);
  reaching a **goal** pays ten times its tier (100 / 250 / 500 / 1,000), but only if it was set at least 3 days earlier (goals
  should take real time). Unchecking a step, deleting a checked step or reopening a goal takes its coins back; only the first 20
  steps of a goal pay; a reached goal's steps are closed. The economy will be reviewed later.
- All through functions with ledger rows (kind `goal`): `complete_goal_step`, `undo_goal_step`, `delete_goal_step`, `complete_goal`,
  `reopen_goal`; `goal_reward(difficulty)` = `task_reward × 10`, `goal_min_days()` = 3. Owners can't check off or delete steps or
  complete goals directly any more (column grants: titles, notes, dates, icon, area, difficulty only).
- Goals page: difficulty picker with the bonus, step tier picker with its coins, "+N" on each step, the bonus on "Mark goal
  reached" (from day 3), "+N coins!" after each change.
- Full screen: tapping the active tool or the group you're building from again goes back to Select. The Road access layer is gone.
- Migrations `20261126010000_goal_ledger_kind.sql`, `20261126010100_goal_rewards.sql`, `20261126010200_goal_tiers.sql` (applied live).
  12 pgTAP tests (`goal_rewards.test.sql`, 255 total).

### 27. Pollution and traffic jams make residents unhappy (2026-11-26)
- `cityExposure()` (`layers.ts`): average **pollution at homes** (same spread as the Pollution layer, weighted by residents) and
  how **jammed the roads in use** are (busier roads weigh more). City Stats' happiness now has "Pollution & noise near homes"
  (up to −20) and "Traffic jams" (up to −12) with tips, replacing the old count of industrial buildings. 1 unit test.

### 28. Settings page (2026-11-26)
- The header's Sign out is now **Settings** (`/settings`): account email and **Sign out**, **Change password** (8–72 characters,
  typed twice; `supabase.auth.updateUser`), and **Start over**: type START OVER, confirm once more, and `reset_progress('START
  OVER')` deletes the city, tasks, check-offs, focus sessions, goals (with steps), one-time rewards and coin history, sets the
  land back to 8×8 and gives the 100-coin welcome bonus again (account, city name, time zone and notification devices stay).
- Migration `20261126020000_reset_progress.sql` (applied live). 7 pgTAP tests (`reset_progress.test.sql`, 262 total).

### 29. Placement fixes, inline city name, theme in Settings, landing screenshots (2026-11-27)
- **Buildings only preview where they fit**: tapping a road, water or another building moves the preview to the nearest free
  spot that covers or touches the tapped tile (or says the spot is taken); dragging the preview skips spots where it doesn't
  fit; Turn moves it to a nearby free spot if the turned footprint doesn't fit. (The database already refused overlaps.)
- **Road preview**: tapping a highlighted tile before Build takes it out of the preview.
- **Dirt road corners**: the two wheel ruts turn as nested L shapes that meet cleanly instead of crossing.
- **City page**: the city name sits right above the map; tap it to type a new name (Enter or tapping away saves, Escape
  cancels). The Rename button and the "Tap a building…" help text are gone.
- **Color theme** moved from the header to a card on Settings.
- **Landing page**: no coin amounts per task; a "See what you can build" section with three screenshots of a sample city
  (`public/landing/*.webp`: overview, build menu, land value layer).

### 30. Tasks calendar and due dates (2026-11-27)
- **Due dates** for one-off tasks (optional, on the add form). Today's list shows "Due today" / "Due tomorrow" / "Overdue (Nov 18)"
  (amber, never red); one-offs due later wait under **Coming up** (they can still be checked off early) and move to To do on
  their day. Migration `20261127000000_task_due_date.sql` (applied live): `tasks.due_date` (one-offs only, by constraint),
  `my_tasks()` returns it. 5 pgTAP tests (`task_due_date.test.sql`, 267 total).
- **Calendar** on the Tasks page (`?view=day|week|month&date=YYYY-MM-DD`): Day / Week / Month tabs, ‹ › to flip
  (Tomorrow, Sat Nov 22…, next week, next month) and a Today button. Day view for today is the usual checkable list; other
  days list what's on them (done ones ticked; future ones "planned"). Week: seven day cards (stacked on phones). Month: a
  grid with task titles (dots on phones, green when done); tapping a day opens it. Daily tasks show every day from when
  they were added, certain-days tasks on their weekdays, one-offs on their due date (undated ones on today), and weekly /
  monthly / N-times tasks in an "Any day this week/month" list with how often they were done. Check-offs still only happen
  on today's list. `src/lib/task-calendar.ts` (4 unit tests), `src/app/(game)/tasks/calendar.tsx`.

### 31. Goal steps as separate fields (2026-11-27)
- The Add a goal form has one field per step, each with its own difficulty (Easy +10 … Epic +100), a × to remove it and
  **+ Add another step** (Enter in the last filled step adds one too; up to 30). Replaces the one-per-line text box.
  `addGoal` reads `step_title` / `step_difficulty` pairs. Browser-checked at 390px.

### 32. Buy land in full screen, upgrade roads by tapping, tidier full-screen top bar (2026-11-27)
- **Land** button at the end of the full-screen build bar (after Bulldoze) with the price; asks to confirm (says how many
  coins are missing if short). Hidden at the largest size.
- **Tap a road** to change it: "Upgrade to 4-Lane Road" / "Change to Dirt Road" for **this tile** or the **whole street** (the
  straight run of that road kind through it, `streetOf()` in `roads.ts`, 1 unit test), paying the new kind's price per tile,
  with a confirm. Uses `buy_tiles` (which already replaced road kinds).
- **Full-screen top bar**: city name and coins with Layers / Stats / Exit on the first row; the clock and pause sit right under
  the name, with the how-to line (placing, moving, drawing, bulldozing) beside it. Routine updates ("Built a House…") no
  longer show there; problems still do.
- Date fields (goal "Reach it by", task due date) can't spill out of their cards on iPhone Safari (global `.input[type=date]`
  rule; not testable here: no WebKit in the sandbox).

### 33. Lot details, steadier Tasks calendar, icons (2026-11-27)
- **Lot details** in 3D (`lot-dressing.tsx`, drawn in each building's own frame so the front faces its road, seeded by id):
  houses get a driveway to the road (often with a parked car), bushes and a flower bed; townhouses and apartments a front
  path and low planting; industry a concrete pad with yellow bay lines and bollards; small shops a paved forecourt with a
  bench, planter and a lamp post / bike rack / sign / bin; big shops (which already have parking) lamp posts and planters.
- **Tasks calendar**: flipping Today → Tomorrow no longer shifts the page (the Today button keeps its space, the subtitle stays
  one line, and other days have the same status row as today's list). The **week view** shows each task's icon.
- **Basketball Court** has its own basketball icon (Lucide's volleyball looked wrong).

### 34. Pick a building's colors (2026-11-27)
- Selecting a building shows **Colors**: Auto plus 10 color schemes (swatch = roof over wall). Free, saved per building in
  `placed_buildings.color_seed` (a seed for the same palettes the automatic colors use, so every model reacts); Auto = null.
  `COLOR_CHOICES` in `models.tsx`; `set_building_color()` (own buildings only, not roads or landscaping).
- Migration `20261127010000_building_colors.sql` (applied live). 6 pgTAP tests (`building_colors.test.sql`, 273 total).
- Renaming citizens was dropped at the owner's request.

### 35. Day and night, street lights (2026-11-27)
- The 3D city follows the city clock (`day-night.tsx`): the sun crosses from east to west, light turns golden around 6:40 AM
  and 6:40 PM, dims to a blue night after 7:30 PM and comes back from 5:30 AM; the sky fades from the theme's sky to a night
  sky. After dark, house and shop **windows glow** (emissive window materials), glass towers glow softly, shop lamps light
  up and the tile grid fades.
- **Street lights** on 2-lane and 4-lane roads (every other tile of straight stretches and corners, alternating sides, not in
  junctions, not on dirt roads or bridges), with soft pools of light on the road at night. No real night lights are
  added (cheap on phones).
- The selected-building panel lists Colors → road options → Upgrade → who lives / works here → buttons.
- `setGameClock()` in `traffic.tsx` jumps the clock (used to preview night).

### 36. Livelier streets (2026-11-27)
- Free time is spent out more often (shops, the park, or **visiting a friend's home**, new trip purpose `visit`); stays in
  between are shorter. About 1 adult in 6 is a **night owl** who goes out until about midnight.
- **Always a little life**: when fewer than min(4, a quarter of the citizens) people are out (night, small towns), someone at
  home (12+) is sent on an errand, a walk or a visit every few game minutes. Measured at 3–4 AM in a sample town: 3–4 people
  out at every check. `outing()` in `sim.ts`; trip starting moved into `start()` in `traffic.tsx`.
- Cars have **headlights and taillights** that glow after dark.

### 37. Stop signs and traffic lights (2026-11-27)
- **Roads build group** has **Stop Sign** (10 coins) and **Traffic Light** (40) (`ROAD_CONTROLS` / `roadControlTypes()` in
  `game.ts`, mirroring `public.road_control_price`). Picking one highlights the crossings (road tiles, not bridges, where 3–4 roads
  meet); tap one and confirm. Tapping a crossing road tile shows a **Crossing** card: what's there, put up the other kind
  (a light replaces a stop sign), or **Remove** (half back).
- **3D** (`road-controls.tsx`): red stop signs on the four corners; traffic lights on corner poles with red / yellow / green lamps
  for each direction, changing with the game clock (`lightFor()` in `traffic.tsx`: a 16-game-minute cycle, 6.5 green + 1.5 yellow
  per direction).
- **Cars**: at a stop sign they stand still briefly, then take turns as before; at a light they wait for green in their direction,
  and then every car going that way crosses together (no one-at-a-time hold). Plain crossings keep the one-at-a-time rule.
- **Traffic layer / happiness**: crossings carry 0.5× a plain road without control, 0.75× with a stop sign, 1.5× with a light
  (`CROSSING_FACTOR` in `layers.ts`), and a jammed crossing backs up onto its neighbours, so jams (and the "Traffic jams"
  unhappiness) drop when busy crossings get a light. 1 unit test.
- Database: migration `20261127020000_road_controls.sql`: `road_controls` (RLS read own, no direct writes),
  `place_road_control()`, `remove_road_control()`, a trigger removing a control with its road; 11 pgTAP tests (284 total).
  All applied live (in pieces: statements containing DELETE need the owner's approval in Supabase, which only came through
  from their computer, not their phone).

### 38. Times of day for tasks, calendar counts, cut-off roads, settings and polish (2026-11-27)
- **Times of day**: daily and certain-days tasks can list **Morning / Afternoon / Night** (add form chips). Each time is its own
  check-off with its own coins (e.g. "Eat a healthy meal" × 3); the row shows a "1/3" ring and a chip per time (tap to check,
  tap again to undo that time); the task stays under To do until every time is done. Migration
  `20261127030000_task_times_of_day.sql` (applied live): `tasks.times_of_day`, `task_completions.slot` (unique per task, day and
  slot), `complete_task(id, slot)` / `undo_task(id, slot)` (slot optional; `pick_a_time` when a timed task gets none),
  `period_target()` counts the times, `my_tasks()` returns `times_of_day` and `slots_done`. 12 pgTAP tests (`task_times.test.sql`,
  296 total).
- **Calendar week and month** show counts, not names: "3 tasks · 1 done" / "all done", and "1 goal due" for goals whose
  reach-by date is that day.
- **Area points** card: just the points per area (the "75 more → Neighborhood Park" countdowns are gone).
- **Icon picker**: a small icon-only button.
- (Later removed, see 39:) a Settings day/night switch and a random start time. `sim-clock.ts` holds the internal clock and
  `lightFor()` apart from the 3D code.
- **Cut-off roads**: buildings only count when their road joins the town's main network (the largest group of joined road
  tiles, `mainRoadNetwork()` in `roads.ts`, 1 unit test); a building on a separate stretch gets the "!" marker and "Its road isn't
  joined to the rest of town".
- **Crosswalks** (zebra stripes) on every side of crossings on 2-lane and 4-lane roads. **High-rise** windows on all four sides.
  **Townhouse** roof was upside down (a V); now a proper gable.
- Owner's account: 100,000 test coins and 1,000 points per area (all buildings unlocked) after their Start over.

### 39. No clock or day/night; always-busy city; models and menu polish (2026-11-27)
- **Day/night and the clock are gone** (owner's request): the city is always in daylight, the clock pill is now just a pause button,
  and the Settings day/night switch was removed. The simulation still keeps time internally (routines, traffic lights) but it's
  never shown; citizen cards say "on the way / almost there" and "staying a while" instead of times.
- **Always busy**: every citizen's day is shifted by their own offset (`personalOffset()` in `sim.ts`: spread over 24 hours by
  their seed), so commutes, errands and visits happen all the time rather than at shared rush hours.
- **Build menu** shows every building's size (1×1, 2×1, 4×4…), also in the effect chips.
- **Duplex** and **Grocery Store** have a driveway along their whole front (cars on the duplex's, lamps at the store).
- **Elementary School** rebuilt: brick schoolhouse with white trim, a sloped roof along its length, bell tower, aligned windows and
  an entrance canopy, a flag pole and a playground with a slide and swings (the old windows floated past the building).
- **Football Stadium** (was Sports Stadium): striped field with yard lines, end zones in the team color, goal posts, three-tier stands
  on both long sides, end stands, a scoreboard and light towers. Migration `20261127040000_football_stadium.sql` (applied live).
- **Airplanes** (`airplanes.tsx`): every 25 seconds a jet (in the airport's color) lines up at the end of each airport's runway,
  rolls down it speeding up, lifts off nose-up and climbs away over the city, then disappears; airports are offset so they don't
  take off together. The renderer only runs continuously while a plane is in the air.
- **Turn 90°** on placed rectangular buildings (2×1, 3×1, 4×3…): the selected-building panel turns it where it stands, shifted by a
  tile if needed so the turned footprint still covers part of the old one and fits (`turnInPlace()` in `city-board.tsx`, via
  `move_building` with `rotated`); free. Before, turning meant Move → Turn → Move here.

### 40. Milestones and landmarks, friends, scenic view, zoo animals (2026-11-28)
- **Land** costs 300 × 1.35ⁿ (was 1.6ⁿ): all 11 expansions about 22,400 coins instead of 87,460 (`land_price()`, `landPrice()`).
- **Population milestones** (50 / 100 / 250 / 500 / 1,000 / 2,500 people, `CITY_MILESTONES` in `game.ts`): a **City milestones** card
  under City Stats (and in full screen's Stats) with progress and **Claim** for a one-time bonus (100 / 200 / 400 / 750 / 1,500 /
  3,000; once ever) and a **landmark that can't be bought**: Welcome Arch, Clock Tower, Fountain Plaza, Founders' Statue, Observation
  Tower, Crystal Spire (3D models, icons). In Landmarks they show "Reach N people", then "Free", then "Already in your city"; placed with
  `place_landmark()` (free, one each, needs the population now). The server counts homes beside a road (`private.city_population`).
- **Friends** (header link, `/friends`): your 6-character **city code** (copy), **Share invite link** (`/signup?invite=CODE`: the code is
  remembered on sign-up and the inviter's city is added to the new player's friends, `src/components/invite.tsx`), add a friend by code,
  friends list (name, people, buildings, size) with **Visit** and remove. **Visit** (`/visit/<id>`): their city in full screen, view only
  (no building, selling or selecting), "<Name>'s city · <City>" at the top, **Invite friends** (share sheet or copy) and Back.
  **Settings → Your name** (`profiles.display_name`) is shown to friends.
- **Scenic view** (eye button on the map and "View" in full screen): hides every menu and the grid lines; a small button brings them back.
- City name can be renamed in **full screen** too (tap it in the top bar).
- **Zoo animals** (`zoo-animals.tsx`): giraffes and zebras on the savanna, penguins around the pond, bears in the forest and goats on the
  rocks wander their enclosures (walk to a random spot, pause, repeat).
- Migration `20261128000000_milestones_friends.sql` (applied live): `building_types.milestone_population` + 6 landmarks,
  `city_milestones`, `claim_city_milestone()`, `place_landmark()`, `my_city_population()`, `profiles.city_code`, `friendships` (read and
  remove own), `add_friend()`, `my_friends()`, `friend_city()` (only for cities you've added). 18 pgTAP tests (314 total).
- Owner's account (after another Start over): 30×30 land, 200,500 coins, 1,000 points per area.
- **House lots**: every house has a front walk from its door to the sidewalk; driveways stop at the front of the house (the Starter House's
  ran under it); the flower bed (a brown slab with colored dots) is gone. Lawn plots are 0.02 thick, so drives and walks on lawn homes
  sit above them (the Suburban House's garage driveway and the duplex's were hidden under the grass). **Luxury Home** remodelled: house
  moved toward the front with a front door and porch roof, windows on both floors, sides and back, a garage door, and the **pool in the
  back yard** with loungers.
- **Props**: café and restaurant (patio tables out front) only get planters at the corners; the clothing store's props stay
  left of its sign; the warehouse's crates sit at the corner and the yellow bay line at the far edge, clear of the loading
  doors; the parking garage's blue "P" sign (it floated past the slab) stands on a post at the entrance.
- **Clock Tower**: a real clock face on all four sides (dark rim, white dial, hour marks, hands); before, the faces lay flat
  inside the tower. **Fountain Plaza** runs: water arcs from the spout into the top bowl and spills from its rim into the
  pool (`fountain-water.tsx`, one instanced mesh, paused with the other animations), and the pool's water now shows above
  its stone rim.

### 41. A 50×50 world, clouds, City page as a picture, box bulldozer, Monument as a reward (2026-11-28)
- **Land up to 50×50** (`max_city_size()` 50, `MAX_CITY_SIZE`). Each purchase still adds 2 tiles across, but now a ring of one tile
  on **every side**: `buy_land()` moves everything built (and road controls) one tile right and down, so your land stays in the
  middle of the world. Prices keep the 300 × 1.35ⁿ curve (21 purchases from 8×8; the last ones are expensive, review with the
  economy). Migration `20261128010000_world_50.sql` (applied live); 6 pgTAP tests (`world_50.test.sql`).
- **The world is always 50×50** (`worldOffset()` in `game.ts`): locked land around yours is forest out to the edge (trees seeded by
  world position, so they don't jump when land grows), the ground ends in a soil edge with only sky beyond, and the camera stays
  over the world. **Clouds** (`clouds.tsx`) circle slowly in the distant sky; only the far side of the ring is drawn, so they never
  block the view.
- **City page**: just the city name, the map framed on your whole city, and **Full screen** (tapping the map also opens it),
  then City Stats and Milestones. The Build menu, Land card, pause, bulldoze, scenic and zoom/rotate buttons are only in full screen.
- **Bulldozer drags a box**: everything inside the rectangle between where you start and where you let go (`boxPath()` in
  `roads.ts`); at most 200 items at a time.
- **Monument** is a population reward now (not for sale): 50 Welcome Arch, 100 Fountain Plaza, 250 Clock Tower, 500 Monument,
  1,000 Founders' Statue, 2,500 Observation Tower, **5,000 Crystal Spire** (new milestone, 6,000 coins). Migration
  `20261128020000_monument_milestone.sql` (applied live).
- **Two-finger tilt** on phones (full screen): slide two fingers up or down together to tip the view between top-down and a
  side view; pinch still zooms, twist rotates, one finger moves the map (two fingers no longer pan).
- **Move city** (full-screen bar, after Bulldoze): arrow buttons (and the keyboard's arrow keys) slide everything built one tile
  inside your land, free, showing how far each edge is; refused past an edge. `shift_city(dx, dy)` (migration
  `20261128030000_shift_city.sql`, applied live; 5 more pgTAP tests in `world_50.test.sql`).
- **Dirt road junctions**: a square of ruts in the middle; each arm's ruts run from it to the tile edge and its sides are only drawn
  where no road leaves, so tracks turn instead of crossing.
- **157 task and goal icons** (was 50), grouped in the picker (Health & fitness, Mind & learning, Work & money, Home & chores,
  People & pets, Hobbies & fun, Nature & travel, Time & goals) in a scrolling panel. `ICON_GROUPS` in `src/lib/task-icons.ts`,
  components in `src/components/choice-icons.tsx`. Existing names unchanged.
- **Bottom menu on iPhone**: the page now uses the whole screen (`viewportFit: "cover"`), so the tab bar stays on the bottom edge
  while the browser bar hides; the header is padded below the status bar.
- Stats page ignores hand-granted test points (no task, no coins) in check-off counts, the chart and the history calendar.
- Props: café/restaurant planters only, warehouse crates and bay line clear of the doors, parking garage "P" sign on a post;
  Clock Tower faces on all four sides; Fountain Plaza with running water (`fountain-water.tsx`).

### 42. Friend requests, names that fit (2026-11-28)
- **Friend requests**: adding someone by code (or signing up through their invite link) sends them a request instead of adding them
  straight away. They see a red count on **Friends** in the header and a **Friend requests** card with Accept / Decline; accepting
  makes you friends both ways (both can visit). The sender sees "Request sent" with Cancel. Adding someone who already asked you
  accepts their request. Friendships from before stay. Migration `20261128040000_friend_requests.sql` (applied live):
  `friend_requests` (read own, no direct writes), `add_friend()` now returns `status` (friends / requested),
  `accept_friend_request()`, `drop_friend_request()` (decline or cancel), `my_friend_requests()`. 11 pgTAP tests.
- **Names no longer cut off**: friend and city names wrap on the Friends page, and the visit screen shows "<Name>'s city" and the
  city name on two lines (Layers / Stats are icons on phones while visiting, to make room).

### 43. Music in full screen, roomier top bar, starting city name, Roads first (2026-11-28)
- **Music** (full screen): a music button next to View turns on calm instrumental music made in the browser (`src/lib/music.ts`,
  Web Audio, no files): soft pad chords (C–Am–F–G, C–Em–F–G), a gentle bass and a plucked pentatonic melody that varies each
  bar, with a light echo; fades in and out. Off by default; the choice is remembered per device (`lifecity.music`), starts on
  the first tap (browsers block sound before one) and pauses while the app is in the background.
- **Full-screen top bar**: the city name gets its own line with the coins under it; Layers and Stats are icon-only on phones.
- **New players' city name** is "Click Here to Name City" (column default; migration `20261128050000_default_city_name.sql`,
  applied live). Existing "My City" names were left as they are.
- **Roads** is the first group in the build bar (`BUILD_GROUPS`).
- **Bottom menu on phones**: a fixed frame (only the content scrolling) kept Safari's bottom bar from ever hiding, so the menu sat
  too high; reverted to normal page scrolling with the fixed tab bar, plus `overscroll-behavior-y: none` on html/body so the
  end-of-scroll bounce can't drag the menu up. The page's bottom padding includes the home-indicator area.

### 44. Leaving the scenic view, sound effects (2026-11-28)
- **Scenic view** was hard to leave (a faint eye icon in the bottom corner): now a clear **Show menus** button at the top right,
  a tap anywhere on the map, or Escape brings the menus back.
- (Removed later at the owner's request; the music stays.) **Sound effects** in the city (`src/lib/sfx.ts`, Web Audio, no files): a soft click for every button pressed over the
  full-screen map, a pop when something is built (buildings, roads, upgrades, moves, stop signs), a crunch when demolishing,
  and a rising chime for buying land, the first building and claiming a milestone. On by default; **Settings → Sounds** switches
  them off (remembered per device, `lifecity.sfx`). `say()` in `city-board.tsx` takes an optional sound.

### 45. Start over clears milestones (2026-11-28)
- `reset_progress()` also deletes the player's city milestones (bonuses can be earned again) and road controls; Settings says so.
  Migration `20261128060000_reset_clears_milestones.sql` (applied live); 1 more pgTAP test. The milestones/friends test now accepts
  the friend request before visiting (340 pgTAP checks pass).

- **Build confirmation bar**: its text wraps instead of being cut off ("Draw more, tap a highlighted tile to take it out, or
  Build."), and on narrow phones Cancel / Build move to a row of their own under it.

### 46. LifeCity name, new landing photos (2026-11-28)
- The app is called **LifeCity** (one word) everywhere: page titles, header, sign-in pages, landing page, home-screen name
  (`manifest.webmanifest`), notifications (`sw.js`), invite texts, reward popups, docs. Migration
  `20261128070000_lifecity_name.sql` (applied live) updates the home-screen reward's coin-history line (older history rows keep
  their old text).
- **Landing photos** (`public/landing/`): `hero.webp` in the top section shows the full-screen city with its build bar *and* a
  phone with the Tasks screen in one picture; below, `build.webp` (build menu over the city) and `tasks-goals.webp` (Tasks and
  Goals screens on two phones). Made from real app screens with sample data (a 16×16 sample city "Maple Bay", sample tasks,
  habits and goals), composed with PIL. The old city-only shots were removed.

### 47. Claimed milestones keep their landmark (2026-11-28)
- Once a population milestone has been claimed, its landmark stays unlocked even if the population drops (`place_landmark()` accepts
  a claimed milestone; `landmarkState()` in `city-board.tsx` matches). Migration `20261128080000_claimed_landmarks_stay.sql`
  (applied live); 3 pgTAP tests (`claimed_landmarks.test.sql`, 343 total).
- Account mbsw000@gnail.com (signed up with "gnail"): +500,000 coins, 1,000 points per area (all buildings), all 7 milestones
  recorded as claimed with no bonus coins (all landmarks unlocked); land left at 8×8.

### 48. Getting started guide (2026-11-28)
- New players get a six-step guide: **add a task → check it off → lay a road → build a home beside it (residents move in) → tap it
  and pick its colors → open a shop beside the road**. A **Getting started** card at the top of every app page (progress bar, ticked
  steps, how to do the next one, Go to Tasks / Open my city) and, in full screen, a coach bubble under the top bar with the current
  step (`src/components/getting-started.tsx`, `city/tutorial-coach.tsx`, steps in `src/lib/tutorial.ts`). A home that isn't touching a
  road gets a "move it next to the road" hint. Finishing pays **100 coins** (`claim_reward('tutorial')`, checked by the database).
  **Skip** hides it (`profiles.tutorial_hidden`). Budget fits the 100 starting coins (Dirt Road 1/tile, Small Cottage 25, Convenience
  Store 60, plus the first check-off).
- Migration `20261128090000_tutorial.sql` (applied live): `profiles.tutorial_hidden` (true for players who already had tasks or
  buildings), `private.tutorial_state()`, `my_tutorial()`, `user_rewards` allows 'tutorial'. 12 pgTAP tests (`tutorial.test.sql`,
  355 total).

- Getting started's **Add a task** button goes to `/tasks#add-task` (and **Go to my tasks** to `#todo-h`): `tasks/scroll-to-hash.tsx`
  scrolls there once the streamed page has it and puts the cursor in the task name box (repeats briefly, since Next.js handles the
  hash itself just after).

### 49. Achievements and a timeline (2026-11-28)
- **17 badges** (`src/lib/achievements.ts`): first check-off, 100 and 1,000 check-offs, a 30- and a 100-check-off habit, Well-rounded
  (250 points in all four areas), first goal and 5 goals, first focus session and 10 focus hours, Getting started, first building and
  50 buildings, 100 and 1,000 people, first land purchase, first friend. Saved the first time they're earned with the moment they
  were first earned (`public.achievements`, `sync_achievements()` from `private.achievement_times()`), so they're **kept forever**
  (demolishing or deleting never removes one). Start over clears them.
- **Achievements page** (`/achievements`, linked from a card at the top of Stats with "N new"): badges by group (earned in gold with
  the date and a "New" label until seen, locked ones grey with how to earn them) and **Your timeline**, newest first by month:
  badges, goals reached, habit milestones, population milestones, land bought, the day the city started (`my_timeline()`).
  `achievements-view.tsx` holds the layout; `mark-seen.tsx` clears "New" after a moment.
- Migration `20261128100000_achievements.sql` (applied live). 9 pgTAP tests (`achievements.test.sql`) + 1 in `reset_progress` (365 total).

### 50. Road tool turns off after Build (2026-11-28)
- After a successful Build of a drawn road (or trees / water), the tool goes back to Select, so the next tap doesn't start drawing
  more; tap Roads again to draw another. A failed Build keeps the tool on so the drawing can be fixed.

- Placing or moving in full screen: the Cancel button moved from the top row (it squeezed the city name and coins) to the end of
  the "Placing … / Moving …" line under it.

### 51. New sound effects; Instagram profile picture (2026-11-28)
- The first sound effects were replaced (the owner wanted different ones, not none): `src/lib/sfx.ts` now makes soft, musical
  sounds in the music's key (C major pentatonic): a wooden tap for buttons over the full-screen map, a two-note marimba "pling"
  for building, a soft filtered-noise "poof" with a low falling note for demolishing, and a music-box C–E–G–C chime for land,
  the first building and milestones; a short room echo, peak about 1/8 of full scale. Settings → Sounds still switches them off.
  `playSfx(kind, delay)` (delay used to render a preview sample).
- `brand/instagram-profile.png` (1080×1080, from `brand/instagram-profile.svg`): the app logo on full-bleed green with the shapes
  inside the circle Instagram crops to.

### 52. Bottom bar locked in the home-screen app; build menu order; quieter taps (2026-11-28)
- **Home-screen app on phones** (`display-mode: standalone`, max 767px; the owner's setup): the content scrolls inside its own
  area (`.app-scroll` wrapper in the game layout, rules in `globals.css`) and the tab bar sits outside it, so scrolling, momentum
  and the end-of-scroll bounce can't move the bar. The bar also sits lower there: half the home-indicator inset (`--nav-pad`)
  instead of all of it. Safari (browser) keeps normal page scrolling so its toolbar can still hide. Emulated on an iPhone 13 with
  the standalone rules applied (Chromium can't emulate display-mode): the bar stays put while the content scrolls to its end.
- **Build menu order**: every group lists what you'll reach first (`byUnlockOrder()` in `game.ts`, 1 unit test): landmarks by their
  population milestone, everything else by area points needed, then price; buildable items still come before locked ones.
- **Button sound** plays on a real tap (`click`), not on touch-down, so swiping through the build bar is silent.
- Owner's account: +500,000 test coins (balance 500,005).
- Local preview note: the dev server kept serving an old `globals.css`; deleting `.next` entirely (not just `.next/cache`) fixed it.

### 53. Tap-to-build roads, box-fill trees and water (2026-11-28)
- **Roads on touch screens are tapped, not swiped**: with a road picked, a one-finger drag moves the map and a tap adds a point.
  The first tap sets a yellow pin (`AnchorPin` in `city-3d.tsx`); each next tap draws a straight line or an L from the pin to the
  tapped tile and moves the pin there; tapping the pin again ends that road (the next tap starts a new one); tapping a tile already
  in the preview carries on (branches) from there. **Undo** in the build bar takes back the last stretch. The preview is kept as
  stretches (`segments` + `anchor` in `city-board.tsx`). With a mouse, click-and-drag still draws (and clicking points works too).
- **Trees and water fill a box** like the bulldozer (drag corner to corner, one finger on phones); a single tap adds or takes out
  one tile.
- Fix: dragged boxes on touch screens snapped back to a single tile; the tile under the finger now comes from the pointer's ray
  meeting the ground (`GROUND_PLANE`), not the hit list kept from the touch-down (pointer capture); the stroke is also kept in a
  ref so the finger lifting can't read a stale one.
- The button sound ignores taps on the map itself (only real buttons).

### 54. Traffic unjams, 4-lane bridges, build menu by price (2026-11-28)
- **Gridlock breaker** (`traffic.tsx`): a car stuck for 6 seconds squeezes through for 1.5 s (ignores the car ahead and releases
  the crossing it leaves), so two cars nose to nose can't freeze the whole town.
- **Bridges** show the markings of the road they carry (4-lane: double yellow + lane dashes; 2-lane: dashed centre; dirt: none),
  and a pond's grassy bank is no longer drawn across road tiles at a bridge's ends.
- **Build menu** lists every group by coin price (landmarks by their population milestone), without a separate Locked group.

### 55. Color schemes match their swatches (2026-11-28)
- The 10 choices under **Colors** are now color families (Terracotta, Slate, Purple, Forest green, Stone, Sunny yellow, Teal,
  Blue, Coral red, Rose; `SCHEMES` / `colorsFor()` in `models.tsx`). A picked family sets the walls, roof, trim, shop awnings,
  tower glass, industrial siding and accent in matching shades, so the whole building follows the swatch while keeping several
  colors; doors, trees and tents still vary. Swatch = roof over walls with the awning color as a dot. Saved seeds are unchanged
  (each old choice maps to the family nearest its old roof). Auto keeps the random mix.
- Clinic and community center follow a picked family too. **Bank, museum, police, hospital, fire station, pool and Founders'
  Statue** keep their own colors and don't show the Colors menu (`FIXED_COLOR_IDS`).

### 56. Fires and break-ins with fire trucks and police cars; sizes for 1x1 buildings (2026-11-28)
- **Random events** (`emergencies.tsx`, in the browser only): about every 45–95 seconds (first after 20–35; paused cities and hidden
  tabs don't count down) a **fire** or a **break-in** starts at a building, riskier ones more often (industry, shops, dense
  housing; same idea as the Fire hazard / Crime layers) and ones within about 9 tiles of a fire station / police station up to
  70% less often. Fires show flickering flames and rising smoke on the roof; break-ins a pulsing red ring and a masked figure by
  the door. The nearest station's **fire truck** (red, ladder, red/white lights) or **police car** (black and white, red/blue
  lights) drives the shortest road route with lights flashing, stays 6 seconds (the fire shrinks out / the burglar is caught),
  then drives back. With no station or no road to one, the event fades after 18 seconds. One fire and one break-in at most at a
  time. Only for show: nothing is damaged and no coins change. A line beside the pause button tells what's happening ("Fire at
  Corner Shop! A fire truck is on the way.", "Build a fire station on the roads so a truck can come.", "The police caught the
  burglar at …"), cleared after 9 seconds. `pointAt()` is exported from `traffic.tsx` for the vehicles.
- The build menu and building cards show the size of 1x1 buildings too (not of roads, landscaping or road controls).

### 57. Happiness is harder; transport and road controls ease traffic; hotel and university windows (2026-11-28)
- **Happiness** starts at 40 (was 50). Parks & services have diminishing returns that grow with the city (up to +30:
  `30 × (1 − e^(−points / (6 + 0.3 × population)))`). Pollution near homes up to −25 (was −20), traffic jams up to −20 (was −12).
  New **Fire & crime risk** (towns of 10+ people): homes far from a fire station or police station, up to about −13
  (`cityExposure().safety`, from the Fire hazard and Crime layers).
- **Transport** (`transportFactor()` in `layers.ts`): traffic is 1.4× busier with no transport buildings; each bus station (−0.22,
  up to 3), parking garage (−0.12, up to 3), gas station (−0.06, up to 2) and the airport (−0.15) brings it down, to 0.55× at best.
  The traffic-jam tip says to build them when there are none.
- **Stop signs and traffic lights** count for more: a crossing carries 0.4× a plain road with no control, 1.2× with a stop sign and
  2.4× with a light (was 0.5 / 0.75 / 1.5); roads within 2 tiles of one carry 1.3× / 1.6× more; and every control calms the city's
  jam score by 5% (up to 40%).
- **Hotel**: windows on all four sides of the tower. **University**: two rows of windows on the main hall (front, back, sides),
  a front door with a lintel and steps, a tower window, windows on both sides and fronts of the wings and a door on each wing.
- 1 more unit test (`transportFactor`); the happiness test follows the new numbers.

- **Colors on parks** (2026-11-28): the Basketball Court's surface takes the picked family's roof color with key areas in its
  awning color; the Neighborhood Park's bench and a flower bed, and the Garden Park's flowers and benches, use the family too.
  With Auto they keep their usual colors.

### 58. Buses (2026-11-28)
- `buses.tsx`: with **two or more bus stations** joined by roads, yellow buses run a loop from station to station (nearest
  next, then back to the first), stopping 3 seconds at each; one bus per station (up to 4), spread along the loop. With **one
  station**, its bus waits inside for 25–50 seconds (counted in real time; paused or hidden tabs don't count), then drives a
  tour past 2–3 random far-off roads and comes back to park again. Only for show; paused with the city.

- **Buses, round 2** (2026-11-28): taller buses (about 1.7× a car) with a band of windows. Buses and cars keep their distance
  (`vehicles.ts`: positions shared each frame): a bus waits behind a car or bus ahead in its lane and before a crossing with a car
  in it; cars wait behind a bus and for a bus to clear a crossing; either noses through after 6 seconds stuck. Checked: 3 buses
  with town traffic for 30 s, closest same-lane gap 0.74 tiles, no overlaps.
- **Cars turn into buildings** (2026-11-28): every trip's path now starts and ends one tile inside the buildings' lots
  (`lotTileBy()` in `traffic.tsx`), so cars pull out of the building onto the road, and at the end turn off the road toward
  the building and disappear just past its edge (walkers too).

- **Buses enter the station** (2026-11-28): each leg now starts and ends one tile inside a station's lot, so a bus turns off the
  road into the station, is hidden during its 3-second stop, and pulls back out (before, the next leg started in the opposite
  lane, so the bus seemed to jump across the street). A lone station's tour is one continuous path out of the station and back
  in. Checked per frame for 40 s: no jumps (largest step 0.24 tiles at ~6 fps), buses seen inside the station lots.

- **Fire trucks and police cars pull in and out** (2026-11-28): their routes start inside the station's lot (they pull out onto
  the road), end turned in toward the building on its driveway (stopping 0.2 tiles short of the lot so they stay clear of the
  model), and on the way back turn into the station and disappear, like everyday cars.

- **Transport really eases traffic** (2026-11-28): the Traffic layer was saturated (any real commute scored every road at the
  maximum, so cutting traffic changed nothing). Roads now carry 20 / 60 / 150 daily trips (dirt / 2-lane or bridge / 4-lane) and
  a tile's jam is `1 − e^(−0.8 × trips × busy / capacity)`, so it rises smoothly. `transportFactor()` is 1.5 with no transport
  and goes down to 0.35 (bus station −0.3 up to 3, parking −0.15 up to 3, gas −0.08 up to 2, airport −0.2). In the moving city,
  `transitShare()` (up to 70%) of would-be drivers take the bus: they travel off the road (card: "Riding the bus to work"), so
  there are visibly fewer cars. Unit test: three bus stations cut the busiest road's jam by more than 0.15.

- **A balanced city** (2026-11-28): two new happiness factors in `cityStats()` beside unemployment (up to −20) and worker
  shortage (up to −10). **Goods**: industry makes what shops sell; each industry job supplies 1.5 shop jobs
  (`GOODS_PER_INDUSTRY_JOB`; offices, banks, hotels and cinemas don't need goods). With 8+ shop jobs and too few goods: "Shops
  short of goods", up to −15; with goods over twice what shops sell (and 15+): "Factories can't sell their goods", up to −8.
  **Schooling**: children are about 22% of residents; school places are 40 / 60 / 100 (elementary / high school / university,
  `SCHOOL_SEATS`); with 30+ people and too few places: "Not enough school places", up to −12. Each comes with a tip. 2 unit tests.

### 59. Taxi depots and taxis; City Hall roof (2026-11-28)
- The **Gas Station is now a Taxi Depot** (same id `gas_station`, so placed ones became depots): name, description and happiness 0
  in migration `20261128110000_taxi_depot.sql` (applied live); new model (garage with two bays, checkered band, two taxis out
  front, yellow sign), taxi icon (`CarTaxiFront`), no pollution, and it eases traffic more (−0.15 each, up to 2, in
  `transportFactor()`).
- **Taxis** (`taxis.tsx`): one per depot (up to 4) pulls out of its depot, drives a fare to a random building, turns in there
  (hidden 1.5–3.5 s), takes the next fare, and after a few fares (or now and then) goes back to the depot for a break. They keep
  their distance from cars and buses (`clearAhead()` from `buses.tsx`, positions shared in `vehicles.ts`). Browser check: two
  depots, taxis on the road in 70 of 100 samples, no errors.
- **City Hall**: its roof was centred in front of the building; it now covers the hall and the portico columns evenly.
  Its clock was a flat white disc half sticking out of the tower; the tower now has a real clock face on all four sides
  (`clockFaces()` in `models-catalog.tsx`: rim, dial, hour marks, hands).

### 60. Educated workers; "Education" build group (2026-11-28)
- **Skilled jobs need graduates** (`cityStats()`): offices and banks 60% of their jobs, hospitals and the university 70%, city hall
  50% (`SKILLED_SHARE`). Graduates come from homes near a high school (up to 45% of residents within 12 tiles, fading with
  distance) or a university (75% within 18) (`GRADUATES`). Skilled jobs nobody qualifies for stay empty: they're taken off the
  city's jobs (so unemployment can rise), those workplaces get the worker-shortage marker, and with 5+ skilled jobs short there's
  "Not enough educated workers" (up to −12) with a tip to build a high school or university near the neighborhoods. 1 unit test.
- The build menu's **Knowledge** group is now **Education** (the Knowledge life area for tasks keeps its name).

### 61. Guide that stays, shop goods warning, fitting news line, plainer stop signs (2026-11-28)
- **Getting started kept disappearing**: its Skip (×) sat over the top of the map, so a tap while laying a road could hide the guide
  for good (every live account had it hidden). Now, while placing, drawing or bulldozing, the coach shrinks to a one-line strip
  with no buttons (`compact`); Skip asks "Hide the guide?" first; and **Start over** brings the guide back (`reset_progress()` sets
  `tutorial_hidden = false`, migration `20261128120000_reset_shows_tutorial.sql`, applied live; Settings says so).
- **Shops short of goods**: an orange crate floats over every goods-selling shop when industry doesn't supply enough
  (`cityStats().noGoods`, same rule as "Shops short of goods"; beside the yellow worker marker when both apply), and the
  selected shop's panel says "Short of goods: shops only get N% of the products they sell. Build industry…". Skilled workplaces
  short of graduates now say "Not enough educated workers…" in their panel (`skilledShort`).
- The fire / break-in line beside the pause button wraps instead of being cut off (the pill becomes a rounded box).
- Stop signs lost the white bar across the octagon.

- **Goods warning from the first shop** (2026-11-28): the crate marker, panel warning and "Shops short of goods" no longer wait for
  8 shop jobs; any goods-selling shop without enough industry gets them. The penalty grows with the town's shopping:
  `15 × (1 − goods/shop jobs) × min(1, shop jobs/12)` (a lone Convenience Store with no industry: −5; 12+ shop jobs: up to −15).

## Next steps
1. Run `npm run db:start`, `npm run test:db` and a full browser pass on a machine with Docker; then regenerate
   `src/lib/database.types.ts` with `npm run db:types` (currently hand-written).
2. **Deploys**: the `life-city` project (LifeCity team `team_LG1WjQ02e987XW4cCEEwM4pq`) is connected to GitHub
   `warnernathanr-jpg/life-game`; production tracks branch `claude/kind-dirac-r6ohvf`, so pushes deploy automatically.
   The Vercel MCP connector (`create_deployment` with `gitSource`) can also start one. The sandbox CLI/API token only
   covers the Laundromat Success team: don't use `npx vercel deploy` for LifeCity.
3. **Phase B**: goals with big rewards (150 / 500 / 750, must be set in advance and take real time), achievement
   landmarks that can't be bought, a timeline of accomplishments. **Phase C**: the 7 city stages (Settlement → Capital)
   and the full catalog (~35 buildings + infrastructure) with 3D models. **Phase D**: construction timers, passive
   income for cosmetics. **Phase E**: friends' cities and seasonal events.
4. Little cars on roads, day/night lighting, CC0 3D models (e.g. Kenney city kit).
5. City depth: adjacency effects (shops near homes, industry far from them), small passive income.
6. Polish: building animations, phone app (PWA) and reminders.

## Notes
- Next.js 16: middleware is `src/proxy.ts`; with Cache Components, session reads go inside `<Suspense>`
  (see the game layout and pages). Read `node_modules/next/dist/docs/` before using unfamiliar APIs (AGENTS.md).
- After a migration: `npm run db:reset`, `npm run db:types`, `npm run test:db`.
