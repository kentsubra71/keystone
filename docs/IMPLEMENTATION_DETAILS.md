# Keystone: Implementation Details

Technical reference for all integrations, database schema, API routes, services, and deployment. Updated Feb 2026.

---

## 1. Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 (Alpine Docker) |
| Framework | Next.js 15.1 (App Router) + React 19 |
| Language | TypeScript 5.7 |
| Database | Neon.tech PostgreSQL (serverless, HTTP driver) |
| ORM | Drizzle ORM 0.38 + Drizzle Kit for migrations |
| Styling | Tailwind CSS 3.4, dark mode via `next-themes` |
| Auth | NextAuth.js 5.0-beta.25 (Google OAuth, JWT sessions) |
| AI | OpenAI GPT-4o-mini (classification + draft generation) |
| Google APIs | googleapis 144.0 (Gmail, Calendar, Sheets v4) |
| Validation | Zod 3.24 |
| Deployment | GCP Cloud Run, Docker images via GCR |

---

## 2. File Structure

```
src/
├── app/
│   ├── (auth)/login/page.tsx           # Glass-morphism login page
│   ├── (dashboard)/
│   │   ├── today/page.tsx              # Main dashboard (server component for auth)
│   │   ├── items/page.tsx              # All items view with filters
│   │   ├── brief/page.tsx              # Daily brief display
│   │   ├── settings/page.tsx           # Settings page
│   │   └── layout.tsx                  # Dashboard layout with sidebar + nudge banner
│   ├── api/
│   │   ├── auth/[...nextauth]/         # NextAuth handler
│   │   ├── due-from-me/               # Due items query with filters
│   │   ├── waiting-on/                # Items others owe user
│   │   ├── meetings/upcoming/         # Enriched calendar meetings
│   │   ├── items/[id]/action/         # Item actions (done/snooze/ignore)
│   │   ├── emails/polish/             # GPT email polishing (preview)
│   │   ├── emails/send/               # Send Gmail reply directly
│   │   ├── drafts/create/             # Create Gmail draft
│   │   ├── threads/[threadId]/        # Fetch thread details
│   │   ├── sync/gmail/ & sheet/       # Manual sync triggers
│   │   ├── cron/gmail, sheet, brief, nudges/  # Scheduled jobs
│   │   ├── owner-directory/           # CRUD for owner mappings
│   │   ├── nudges/ & nudges/[id]/dismiss/     # Nudge management
│   │   ├── brief/                     # Daily brief fetch/generate
│   │   ├── sheet-items/               # Raw sheet items query
│   │   └── debug/                     # Dev-only data inspection
│   ├── globals.css                    # CSS variables, gradients, animations
│   ├── layout.tsx                     # Root layout (Inter font, ThemeProvider)
│   └── page.tsx                       # Redirect to /today
├── components/
│   ├── brand/KeystoneLogo.tsx         # SVG keystone arch + text
│   ├── dashboard/
│   │   ├── TodayContent.tsx           # Client wrapper: fetches meetings, renders sections
│   │   ├── DueFromMeSection.tsx       # "Due From Me" section with undo toast
│   │   ├── WaitingOnSection.tsx       # "Waiting On Others" section
│   │   ├── MeetingBriefingSection.tsx # Meeting briefing cards (today/tomorrow)
│   │   ├── MeetingBadge.tsx           # "Meeting in 3h" badge for ItemCard
│   │   ├── ItemCard.tsx               # Individual item with actions + snooze picker
│   │   └── ItemDetailDrawer.tsx       # Slide-out drawer with thread, quick reply
│   ├── brief/DailyBriefView.tsx       # Daily brief renderer
│   ├── items/AllItemsView.tsx         # Table view with filter tabs
│   ├── nudges/NudgeBanner.tsx         # Top-of-page nudge alerts
│   ├── settings/
│   │   ├── SyncSettings.tsx           # Manual sync buttons
│   │   └── OwnerDirectoryManager.tsx  # CRUD for name→email mappings
│   ├── layout/
│   │   ├── Sidebar.tsx                # Navigation sidebar
│   │   └── ThemeToggle.tsx            # Light/dark/system toggle
│   ├── providers/ThemeProvider.tsx     # next-themes wrapper
│   └── ui/Toast.tsx                   # Undo toast component
├── lib/
│   ├── auth.ts                        # NextAuth config (OAuth + mock)
│   ├── cron-auth.ts                   # Token refresh for cron jobs
│   ├── db/
│   │   ├── index.ts                   # Drizzle + Neon connection
│   │   └── schema.ts                  # All tables, enums, indexes
│   ├── google/
│   │   ├── gmail.ts                   # Gmail API (fetch threads, parse MIME)
│   │   ├── calendar.ts                # Calendar API (upcoming meetings)
│   │   └── sheets.ts                  # Sheets API (service account + OAuth)
│   └── services/
│       ├── gmail-sync.ts              # Full Gmail sync pipeline
│       ├── gmail-classifier.ts        # GPT-4o-mini classification
│       ├── sheet-sync.ts              # Sheet sync with fingerprinting
│       ├── daily-brief.ts             # Daily brief generation
│       ├── nudges.ts                  # Nudge generation (max 3/day)
│       ├── learning.ts                # Action recording + status updates
│       └── draft-generator.ts         # GPT polishing + Gmail draft/send
├── types/index.ts                     # Shared TypeScript types
└── middleware.ts                      # Auth redirect middleware
```

---

## 3. Database Schema

**File:** `src/lib/db/schema.ts`
**Connection:** `src/lib/db/index.ts` (Neon serverless with HTTP driver)

### Enums

| Enum | Values |
|------|--------|
| `dueFromMeType` | reply, approval, decision, follow_up |
| `actionStatus` | not_started, in_progress, blocked, done, deferred |
| `itemSource` | gmail, sheet, calendar |
| `userActionType` | done, snooze, delegate, ignore, priority_override |
| `nudgeType` | blocking_others, overdue, critical_due_soon |

### Tables

**`users`** — Single-user auth record
- id (UUID PK), email (unique), name, image, createdAt, updatedAt

**`ownerDirectory`** — Maps display names to emails for sheet owner attribution
- id (UUID PK), displayName, email (unique), createdAt, updatedAt

**`dueFromMeItems`** — Core entity: items requiring user action
- id, type, status, title, source, sourceId
- blockingWho, ownerEmail
- agingDays, daysInCurrentStatus, firstSeenAt, lastSeenAt, statusChangedAt
- confidenceScore (0-100), rationale, suggestedAction, notes
- Indexes: sourceId, status, source

**`gmailThreads`** — Ingested email threads with classification
- threadId (unique), messageId, subject, snippet
- fromAddress, toAddresses (JSONB), ccAddresses (JSONB), receivedAt
- labels, dueFromMeType, confidenceScore, rationale, isProcessed

**`sheetItems`** — Synced commitment items from Google Sheet
- commitment, ownerLabel, ownerEmail, dueDate, status, rawStatus, comments
- sourceRowNumber, sourceRowFingerprint (MD5)
- firstSeenAt, lastSeenAt, lastSyncedAt
- needsOwnerMapping, isOverdue, isAtRisk
- Indexes: status, ownerEmail, sourceRowFingerprint, rowNumber

**`userActions`** — Audit trail for learning
- itemId, itemSource, action, previousValue, newValue, createdAt
- Index: itemId

**`dailyBriefs`** — Historical generated briefs
- generatedAt, content (JSONB)

**`nudges`** — Notification records
- type, itemId, reason, sentAt, dismissedAt, createdAt
- Index: itemId

**`draftTranscripts`** — Voice/text transcripts for drafts
- threadId, transcript, generatedDraftId, createdAt

**`appSettings`** — Key-value store (OAuth tokens for cron access)
- key (unique), value (JSONB), updatedAt

---

## 4. Authentication

**File:** `src/lib/auth.ts`

### OAuth Scopes
```
openid, email, profile
gmail.readonly, gmail.compose
calendar.events.readonly
spreadsheets.readonly
```

### Flow
1. Google OAuth sign-in → enforced against `ALLOWED_USER_EMAIL` (single user)
2. Access + refresh tokens stored in `appSettings` table (for cron job access)
3. JWT session strategy with automatic token refresh (5-min buffer)
4. `session.accessToken` injected for Google API calls from API routes
5. Mock auth mode via `MOCK_AUTH=true` for local development

### Middleware (`src/middleware.ts`)
- `/api/auth` and `/api/cron` routes: pass through
- Unauthenticated: redirect to `/login`
- Authenticated on `/login`: redirect to `/today`

---

## 5. Google API Integrations

### Gmail (`src/lib/google/gmail.ts`)
- `fetchRecentThreads(gmail, max=500)`: Paginated inbox fetch, last 7 days
- `fetchThreadDetail(gmail, threadId)`: Full MIME-parsed message bodies
- Parses RFC 2369 mailing list headers for filtering
- Concurrent fetch limit: 10 threads at a time

### Calendar (`src/lib/google/calendar.ts`)
- `getTodaysMeetings(calendar)`: Today's timed events
- `getUpcomingMeetings(calendar, hours=24)`: Next N hours
- Returns: id, summary, start/end (Date), attendees[], description

### Sheets (`src/lib/google/sheets.ts`)
- Dual auth: user OAuth for manual sync, service account for cron
- `fetchSheetData(sheets, config)`: Configurable column mapping
- Row fingerprinting (MD5), status normalization, date parsing
- Default sheet: "Sorted", columns B/C/E/F/G

---

## 6. API Routes

### Core Data
| Route | Method | Description |
|-------|--------|-------------|
| `/api/due-from-me?filter=` | GET | Due items (filter: due/blocking/all). Dynamic aging via SQL |
| `/api/waiting-on` | GET | Sheet items others owe user (ownerEmail != user, status != done) |
| `/api/meetings/upcoming` | GET | Enriched meetings (next 36h) with per-attendee context |
| `/api/items/[id]/action` | POST | Actions: done, snooze (with days), ignore |
| `/api/threads/[threadId]` | GET | Full Gmail thread detail for drawer |

### Email Operations
| Route | Method | Description |
|-------|--------|-------------|
| `/api/emails/polish` | POST | GPT-polish transcript → preview text (no send) |
| `/api/emails/send` | POST | Send reply directly (accepts pre-polished body) |
| `/api/drafts/create` | POST | Create Gmail draft from transcript |

### Sync & Cron
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/sync/gmail` | POST | Session | Manual Gmail sync |
| `/api/sync/sheet` | POST | Session | Manual Sheet sync |
| `/api/cron/gmail` | POST | Bearer CRON_SECRET | Scheduled Gmail sync |
| `/api/cron/sheet` | POST | Bearer CRON_SECRET | Scheduled Sheet sync |
| `/api/cron/brief` | POST | Bearer CRON_SECRET | Generate daily brief |
| `/api/cron/nudges` | POST | Bearer CRON_SECRET | Generate nudges (max 3/day) |

### Admin
| Route | Method | Description |
|-------|--------|-------------|
| `/api/owner-directory` | GET/POST | List/add owner mappings |
| `/api/owner-directory/[id]` | PUT/DELETE | Update/delete owner mapping |
| `/api/nudges` | GET | Active (undismissed) nudges for today |
| `/api/nudges/[id]/dismiss` | POST | Dismiss a nudge |
| `/api/brief` | GET/POST | Fetch latest / generate new brief |

### Debug (Dev Only)
| Route | Method | Description |
|-------|--------|-------------|
| `/api/debug/gmail-threads` | GET | Inspect stored threads |
| `/api/debug/sheet-items` | GET | Inspect sheet items |
| `/api/debug/clear-gmail-items` | POST | Clear Gmail data |
| `/api/debug/clear-sheet-items` | POST | Clear Sheet data |

---

## 7. Frontend Architecture

### Page Structure
- **Server components** (`page.tsx`): Auth checks, redirects, static headers
- **Client components** (sections/cards): Interactive state, API fetching, actions

### Today Page Data Flow
```
today/page.tsx (server: auth check)
  └── TodayContent.tsx (client: fetches meetings once)
        ├── MeetingBriefingSection (meetings prop, expandable cards)
        ├── DueFromMeSection (fetches /api/due-from-me?filter=due, meetings prop for badges)
        └── WaitingOnSection (fetches /api/waiting-on)
```

### Item Action Flow (Undo Pattern)
1. User clicks Done/Snooze/Ignore on ItemCard
2. Item immediately removed from UI (optimistic)
3. 5-second timeout before API call
4. Toast shows with "Undo" button
5. Undo: cancel timeout, restore item from `itemsRef.current`
6. No undo: API call fires, item action committed

### Drawer Quick Reply Flow
1. User types reply text in textarea
2. "Send Reply" → calls `/api/emails/polish` → shows GPT-polished preview
3. "Confirm & Send" → calls `/api/emails/send` with polishedBody → sends via Gmail
4. "Save Draft" → calls `/api/drafts/create` → creates Gmail draft

---

## 8. Design System

### Colors
- **Brand**: Indigo-to-violet gradient (`#6366f1` → `#8b5cf6`), Tailwind `brand-*`
- **Type badges**: Blue (reply), amber (approval), violet (decision), emerald (follow-up)
- **Status badges**: Gray (not started), blue (in progress), rose (blocked), emerald (done)
- **Meeting badges**: Amber (today), blue (tomorrow)

### Contrast (WCAG AAA)
- Primary text: `text-gray-900 dark:text-white`
- Secondary: `text-gray-600 dark:text-gray-300`
- Badge text: `text-{color}-800 dark:text-{color}-300` (or `-400` for amber/emerald dark)
- Links: `text-brand-700 dark:text-brand-300`

### Surfaces (CSS Variables)
- `bg-background`, `bg-surface-card`, `bg-surface-drawer` — auto-switch with theme
- Borders: `border-gray-200 dark:border-gray-700/40`

---

## 9. Deployment

### GCP Project
- Project ID: `keystone-487323`
- Cloud Run service: `keystone` (us-central1)
- Custom domain: `keystone.hurixsystems.com`
- Container Registry: `gcr.io/keystone-487323/keystone`

### Deploy Steps
1. `npm run build` — verify clean
2. `docker build -t gcr.io/keystone-487323/keystone .`
3. `docker push gcr.io/keystone-487323/keystone`
4. `gcloud.cmd run services update keystone --region=us-central1 --image=gcr.io/keystone-487323/keystone --project=keystone-487323`

**Never use `gcloud run deploy --source`** — Cloud Build has permission issues.

### Docker
Multi-stage build: deps → builder (standalone output) → runner (Alpine, port 8080)

### Environment Variables
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth session encryption |
| `AUTH_URL` | `https://keystone.hurixsystems.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials |
| `OPENAI_API_KEY` | GPT-4o-mini for classification/drafts |
| `GOOGLE_SHEET_ID` | Spreadsheet ID to sync |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Service account for cron |
| `CRON_SECRET` | Bearer token for cron routes |
| `ALLOWED_USER_EMAIL` | Single-user restriction |
| `MOCK_AUTH` | `true` for local dev without OAuth |

---

## 10. Database Migrations

```bash
npm run db:generate    # Generate migration SQL from schema changes
npm run db:push        # Apply migrations to Neon database
```

Uses Drizzle Kit with the schema at `src/lib/db/schema.ts`.
