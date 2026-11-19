# Life City

Track your tasks, earn coins, build a city. See [PROJECT.md](./PROJECT.md) for the product and rules and
[PROGRESS.md](./PROGRESS.md) for what's built.

## Run locally

Needs Node 20+ and Docker (for the local Supabase).

```bash
npm install
npm run db:start            # local Supabase; prints the API URL and publishable key
cp .env.example .env.local  # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npm run dev                 # http://localhost:3000
```

Tests: `npm test` (unit), `npm run test:db` (pgTAP database tests), `npm run lint`.

## Deploy

1. Create a Supabase project, then `npx supabase link` and `npx supabase db push`.
2. In Supabase → Authentication → URL configuration, set the Site URL to your domain and allow `https://<domain>/auth/confirm`.
3. Create a Vercel project from this repo with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
