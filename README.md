# Urs2Cash

Peer-to-peer recommerce marketplace for Nigeria. See [`docs/urs2cash-prd.md`](./docs/urs2cash-prd.md) for the full product specification.

---

## Getting started

### Prerequisites

| Tool | Required version |
|---|---|
| Node.js | 20 or later |
| npm | 10 or later |
| Docker | Running (required by Supabase local) |
| Supabase CLI | Bundled as a dev dependency (`npx supabase`) |

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Open `.env.local` and populate every variable. See the comments inside for which variables are client-safe (`NEXT_PUBLIC_*`) and which are server-only.

> **HARD RULE (PRD §12.3 & §12.4):** `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, and `RESEND_API_KEY` must **never** be prefixed with `NEXT_PUBLIC_`. They are server-only. Leaking any of these to the client bundle is a critical security failure.

### 3. Start Supabase locally

Docker must be running.

```bash
npx supabase start
```

This starts a local Postgres instance, GoTrue (auth), Storage, and the Supabase Studio UI. On first run it pulls Docker images (~2 GB). Subsequent starts are fast.

After it starts, copy the printed `API URL`, `anon key`, and `service_role key` into your `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<API URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Local Studio is available at: `http://localhost:54323`

To stop Supabase: `npx supabase stop`

### 4. Apply migrations

**HARD RULE (PRD §3.2 / §12.1):** schema changes happen **only** via the Supabase CLI. The dashboard is never used to alter schema — not once, not for a quick fix.

```bash
# Create a new migration
npx supabase migration new <descriptive_name>
# Edit the generated file in supabase/migrations/
# Apply it locally
npx supabase db push
```

After every migration, regenerate the TypeScript types:

```bash
npx supabase gen types typescript --local > src/lib/supabase/types.ts
```

Commit the migration file **and** the regenerated `types.ts` together.

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`), zero errors required |
| `npm run lint` | ESLint |
| `npm run build` | Production build (run before deploying) |
| `npx supabase start` | Start local Supabase stack |
| `npx supabase stop` | Stop local Supabase stack |
| `npx supabase migration new <name>` | Create a new migration file |
| `npx supabase db push` | Apply pending migrations locally |
| `npx supabase gen types typescript --local > src/lib/supabase/types.ts` | Regenerate database types |

---

## Architecture notes

- **Framework:** Next.js 15, App Router, TypeScript `strict: true` + `noUncheckedIndexedAccess: true`.
- **Server-only boundary:** `src/lib/supabase/service.ts` imports `server-only` — any accidental import into a client component fails at build time.
- **Money:** all monetary values are integers in kobo. `src/lib/money.ts` owns every conversion. No floating-point arithmetic on money anywhere.
- **Categories:** dynamic — resolved from `src/lib/categories/registry.ts` by slug. No `switch` statement over category names.
- **Migrations only:** `supabase migration new` → edit SQL → `supabase db push`. Nothing else.

---

## Project structure

```
src/
  app/                    # Next.js App Router routes
  components/
    ui/                   # shadcn/ui components
  lib/
    categories/           # Category schema registry
      registry.ts
    supabase/             # Supabase clients
      client.ts           # Browser client (anon key, safe for Client Components)
      server.ts           # Server client (cookie session, Server Components)
      service.ts          # Service role client (server-only, bypasses RLS)
      types.ts            # Generated database types (run `supabase gen types`)
    paystack/             # Paystack server-only utilities
    analytics/
      events.ts           # PostHog event name registry (PRD §3.5)
    validation/           # Shared Zod schemas
    money.ts              # All kobo ↔ naira conversion
supabase/
  config.toml
  migrations/             # All schema history — committed, never edited via dashboard
docs/
  urs2cash-prd.md         # Single source of truth
```

---

## Contributing

1. Run `npm run typecheck` and `npm run lint` before opening a PR — both must pass with zero errors.
2. Every schema change must go through `supabase migration new`. No dashboard edits.
3. After every migration, regenerate and commit `src/lib/supabase/types.ts`.
4. No `any` types. No non-null assertions (`!`) without an inline comment justifying them.
