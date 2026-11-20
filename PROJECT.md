# PROJECT.md

## Product summary

**LifeCity**: a personal life dashboard with a city-building game.

- **Life tracker:** tasks (one-off, daily, weekly, monthly, quarterly, yearly, on certain weekdays, or N times a
  week/month) in four life areas: Health, Work, Knowledge, Personal. Recurring tasks are habits: gentle consistency
  (nothing resets) and milestone bonuses at 10/30/100/365 check-offs.
  Later: goals with milestones, habit streaks, progress charts.
- **Economy:** one coin is spent on everything; completing a task earns coins (easy 10, medium 25, hard 50, epic 100;
  no daily limit). Every check-off also earns **area points** in its life area (never spent) that unlock buildings. The focus timer pays
  1 coin per focused minute (5–60 minute sessions). One-time 200-coin rewards for adding the app to the home
  screen and for turning on notifications.
- **City game:** spend coins on residential, commercial, industrial and service buildings and place them on a grid.
  Lay roads (dirt, 2-lane, 4-lane; bridges over water) to connect them (a building only counts when it touches a road). Save up to buy more land.
  The city is shown in 3D (zoom, pan, rotate). Buildings unlock with area points from a matching life area (parks with health,
  schools with knowledge, offices with work...), so a balanced life builds a balanced city.

## Stack

- **Next.js 16** (TypeScript, Tailwind v4, App Router, Cache Components on)
- **Supabase**: Postgres, auth
- Deploy target: Vercel

## Rules

- **Coins are integers** and only change through the Postgres functions (`complete_task`, `undo_task`,
  `buy_building`, `sell_building`, `buy_roads`, `buy_tiles`, `sell_buildings`, `buy_land`, `upgrade_building`,
  `complete_focus`, `claim_reward`, `claim_achievements`). Every change is a row in the append-only `coin_ledger`; the balance
  is the sum. Users can't insert, update or delete the ledger, completions or placed buildings directly.
- **Game rules live in the database** (rewards, daily cap, unlocks, lot overlap, land prices). `src/lib/game.ts`
  mirrors the numbers for display only; keep both in sync and covered by tests.
- **Every table has RLS**; users only ever see their own rows. The app uses the signed-in user's session
  (publishable key) everywhere and **never uses the service-role key**.
- Undoing a task takes its coins back (the balance may go negative). Deleting a task keeps its check-offs
  (with the task's title), so they keep counting toward points and show in the history calendar.
- Don't recreate a specific existing game's names, art or look; keep the city original.
- Never punish missed days: no streaks that reset, no penalties. Consistency is shown gently and rewarded with
  milestones that are kept forever.
