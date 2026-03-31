# Ausmed Engagement Survey

Employee engagement survey platform for healthcare teams.

Built with **Next.js 14 + TypeScript + Tailwind CSS + Supabase**.

---

## Local Development

### Prerequisites

- Node.js 18+
- [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started)

Install the Supabase CLI:

```bash
# macOS / Linux (Homebrew)
brew install supabase/tap/supabase

# npm (cross-platform)
npm install -g supabase
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (from project settings) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key (safe to expose to browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**never expose to browser**) |

### Running Locally

```bash
# Install dependencies
npm install

# Start local Supabase stack (Postgres, Studio, Auth, Storage)
supabase start

# Apply all migrations to local DB
supabase db push

# Seed the local DB with development data
# (resets DB and re-applies migrations + supabase/seed.sql)
supabase db reset

# Start the Next.js dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).  
Supabase Studio runs at [http://localhost:54323](http://localhost:54323).

### Database Migrations

Migrations live in `supabase/migrations/` and are prefixed with a UTC timestamp (`YYYYMMDDHHMMSS`).

```bash
# Push pending migrations to the remote Supabase project
supabase db push

# Reset local DB (drops all data, re-applies migrations + seed.sql)
supabase db reset

# Create a new migration file
supabase migration new <migration_name>
```

> **Note:** Migrations are a development lock — when a migration is in progress, no other parallel development should proceed until the migration is committed and reviewed.

### Seed Data

`supabase/seed.sql` contains representative development data:

- 6 departments in a 2-level hierarchy (Engineering > Frontend/Backend, Clinical > Nursing/Allied Health)
- 4 staff members spread across leaf departments
- 1 open survey (Q1 2026 Engagement Survey) with 5 questions
- 4 participation tokens (one per staff member) — use these to test the survey flow:
  - `dev-token-alice-001`
  - `dev-token-bob-002`
  - `dev-token-carol-003`
  - `dev-token-dave-004`

For realistic production-like seed data, run:

```bash
npx ts-node scripts/seed.ts
```

_(See issue #31 — this script is implemented as part of the seed data epic.)_

---

## Project Structure

```
.
├── app/
│   ├── (admin)/          # Admin portal — survey management, analytics
│   │   └── admin/
│   ├── (public)/         # Public survey flow — token entry, questions
│   │   └── survey/
│   └── api/              # Route Handlers (REST API)
│       ├── departments/
│       ├── surveys/
│       └── survey/
├── lib/
│   ├── supabase/         # Supabase client factories (client, server, admin)
│   ├── types/            # TypeScript domain types
│   ├── departments.ts    # Department tree helpers
│   └── utils/
├── supabase/
│   ├── migrations/       # Timestamped SQL migrations
│   ├── seed.sql          # Local dev seed data
│   └── config.toml       # Supabase CLI config
├── components/           # Shared React components
└── middleware.ts         # Next.js middleware — admin route protection
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email/password) |
| ORM | Supabase JS client (type-safe) |
| Deployment | Vercel (planned) |
