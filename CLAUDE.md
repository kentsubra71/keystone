# Keystone

Single-user executive assistant answering "What is due FROM me right now?" Built with Next.js 15 App Router, Tailwind CSS 3.4, and deployed on GCP Cloud Run.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 3.4 with `darkMode: "class"`, CSS variables for theme tokens
- **Auth**: NextAuth v5 (beta) with Google OAuth — single-user (`ALLOWED_USER_EMAIL`)
- **Database**: Neon.tech PostgreSQL via Drizzle ORM
- **AI**: OpenAI GPT for email classification and draft generation
- **APIs**: Gmail, Google Calendar, Google Sheets (via googleapis + service account)
- **Theming**: `next-themes` for dark/light/system toggle
- **Deployment**: GCP Cloud Run (Docker image via GCR)

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page (glass-morphism design)
│   ├── (dashboard)/           # Authenticated pages: today, items, brief, settings
│   ├── api/                   # API routes: auth, sync, cron, CRUD
│   ├── globals.css            # CSS variables, gradient utilities, glass effect
│   └── layout.tsx             # Root layout with ThemeProvider + Inter font
├── components/
│   ├── brand/KeystoneLogo.tsx # SVG keystone arch logo
│   ├── brief/                 # Daily brief view
│   ├── dashboard/             # ItemCard, DueFromMeSection, BlockingOthersSection,
│   │                          # WaitingOnSection, ItemDetailDrawer
│   ├── dictation/             # Voice dictation panel
│   ├── items/AllItemsView.tsx # Table view with filters
│   ├── layout/                # Sidebar + ThemeToggle
│   ├── nudges/NudgeBanner.tsx # Alert banners
│   ├── providers/             # ThemeProvider (next-themes)
│   ├── settings/              # SyncSettings, OwnerDirectoryManager
│   └── ui/Toast.tsx           # Undo toast
├── lib/
│   ├── auth.ts                # NextAuth config (Google OAuth + mock credentials)
│   ├── cron-auth.ts           # Token management for background cron jobs
│   ├── db/                    # Drizzle schema + connection
│   ├── google/                # Gmail, Sheets, Calendar API wrappers
│   └── services/              # Business logic services
├── middleware.ts               # Auth redirect middleware
└── types/                      # TypeScript type definitions
```

## Key Architecture Decisions

- **Single-user app**: `ALLOWED_USER_EMAIL` env var restricts access to one Google account
- **OAuth tokens stored in DB**: Cron jobs (Cloud Scheduler) read tokens from `appSettings` table to access Gmail/Sheets without a user session
- **Hybrid theming**: CSS variables (`--surface-card`, `--surface-drawer`, `--background`, `--sidebar-from/to`, `--logo-cutout`) for custom backgrounds that have no Tailwind equivalent; Tailwind `dark:` prefixes for standard gray/white colors
- **WCAG AAA contrast**: All text colors meet 7:1 contrast ratio in both light and dark modes. Badge text uses `-800` shades for light mode and `-300`/`-400` for dark mode

## Design System

- **Brand gradient**: Indigo-to-violet (`#6366f1` → `#8b5cf6`), defined as `brand-*` in Tailwind config
- **Semantic surfaces**: `bg-background`, `bg-surface-card`, `bg-surface-drawer` (CSS variable-backed, auto-switch with theme)
- **Type badges**: Blue (reply), amber (approval), violet (decision), emerald (follow-up)
- **Status badges**: Gray (not started), blue (in progress), rose (blocked), emerald (done), gray (deferred)
- **Badge contrast pattern**: `text-{color}-800 dark:text-{color}-300` (or `-400` for amber/emerald in dark)
- **Secondary text**: `text-gray-600 dark:text-gray-300` (never `gray-500` — fails 7:1)
- **Tertiary text**: `text-gray-600 dark:text-gray-400`
- **Links/brand accent**: `text-brand-700 dark:text-brand-300` (never `brand-400` — fails 7:1 on white)

## Common Patterns

### Editing component styles
- Always read the full file before editing (partial reads with `limit` don't register as "read" for the Edit tool)
- Preserve ALL existing functionality — API calls, state management, event handlers, undo logic
- Use `replace_all: true` for patterns that repeat within a file (e.g., `text-gray-500 dark:text-gray-400`)

### Adding new UI elements
- Follow the existing pattern: light-mode-value + `dark:dark-mode-value`
- Surface backgrounds don't need `dark:` prefix (CSS variables handle it)
- Borders: `border-gray-200 dark:border-gray-700/40`
- Hover states: `hover:bg-gray-50 dark:hover:bg-gray-800/30`

### Database changes
- Schema in `src/lib/db/schema.ts`
- Run `npm run db:generate` then `npm run db:push` for migrations
- Use Drizzle ORM query style (not raw SQL)

## Environment Variables

Key env vars (set in `.env` locally, YAML file for Cloud Run):
- `AUTH_SECRET` — NextAuth session encryption
- `AUTH_URL` — Set to `https://keystone.hurixsystems.com` (custom domain)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth credentials
- `DATABASE_URL` — Neon PostgreSQL connection string
- `GOOGLE_PRIVATE_KEY` — Service account key (contains `\n` escapes)
- `OPENAI_API_KEY` — GPT for classification/drafts
- `CRON_SECRET` — Authenticates Cloud Scheduler requests
- `MOCK_AUTH=false` — Set to `true` for local dev without Google OAuth

## Deployment

Run `/deploy` slash command. See `.claude/commands/deploy.md` for full steps.

Quick summary: `npm run build` → `docker build` → `docker push gcr.io/...` → write env YAML → `gcloud.cmd run services update` → clean up YAML.

**Never use `gcloud run deploy --source`** — Cloud Build has permission issues on this project. Always build locally and push to GCR.

## URLs

- **Production (custom domain)**: `https://keystone.hurixsystems.com`
- **Production (Cloud Run)**: `https://keystone-291602781426.us-central1.run.app`
- **Local dev**: `http://localhost:3000`
- **GCP Project**: `keystone-487323`
