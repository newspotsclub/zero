This is a [Next.js](https://nextjs.org) project with Supabase auth and user-specific place tracking.

## Supabase setup

1. Create a Supabase project.
2. Create `.env.local`.
3. Fill these variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (optional for static map previews)
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_STAGING_PROJECT_REF`
   - `SUPABASE_PRODUCTION_PROJECT_REF`
   - `SUPABASE_STAGING_DATABASE_URL`
4. Apply migrations:
   - `npm run db:push:staging` (or run SQL directly in your project for first-time bootstrapping)

## Development setup (single environment)

This project now uses one environment file (`.env.local`) for app + DB scripts.

1. Install dependencies:
   - `brew install supabase/tap/supabase docker colima`
2. Add Docker socket for Colima:
   - `export DOCKER_HOST="unix://${HOME}/.colima/default/docker.sock"`
3. Ensure `.env.local` exists.
4. Start full local stack:
   - `npm run dev:full`

Useful commands:

- `npm run supabase:start` -> start local Supabase only
- `npm run supabase:stop` -> stop local Supabase
- `npm run db:reset:local` -> reset local DB from migrations
- `npm run db:verify` -> verify required tables/RLS/policies

## Promotion flow (staging -> production)

Use migration-based deploys so every DB change is tested in staging first.

1. Add deployment env vars in `.env.local`:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_STAGING_PROJECT_REF`
   - `SUPABASE_PRODUCTION_PROJECT_REF`
   - `SUPABASE_STAGING_DATABASE_URL`
2. Put each schema change in a new file under `supabase/migrations/` with an increasing timestamp prefix.
3. Push to staging first:
   - `npm run db:push:staging`
4. Validate app behavior against staging Supabase:
   - `npm run db:check:staging` (schema sanity check)
   - App checks (auth, favorites, visited toggles)
5. Promote the same migrations to production:
   - `npm run db:push:production` (guarded, will refuse by default)
   - `npm run db:push:production:confirm` (runs `db:check:staging` first, then explicit production confirmation)

This prevents untested SQL from being applied directly to production.

## Admin page (DB insert)

- Route: `/admin`
- Only users with `profiles.role = 'admin'` can insert spots.
- Enforced in two layers:
  - UI blocks non-admins from form access
  - DB RLS policies only allow admin inserts/updates/deletes on `public.spots`
- Admin form includes Place ID finder via Google Places `findPlaceFromQuery` and stores `spots.place_id`.

Promote a user to admin:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

## GitHub CI DB guard

Workflow: `.github/workflows/db-migration-guard.yml`

On PRs and pushes touching DB migration files, CI will:

1. Start local Supabase in CI
2. Rebuild database from migrations (`supabase db reset`)
3. Run `npm run db:verify` (tables + RLS + policy checks)

To enforce this guard, add `verify-migrations` as a required status check in GitHub branch protection for `main`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
