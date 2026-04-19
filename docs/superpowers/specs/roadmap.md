# Keystone Remediation Roadmap

Source: comprehensive code review on 2026-04-19. Surfaced ~60-70 distinct issues across security, correctness, silent failures, performance, and type design. Each phase below is its own spec → implementation-plan → ship cycle.

## Phase 1 — Done/Snooze behavior & silent-failure fix (current)
**Spec:** `2026-04-19-done-snooze-behavior-design.md`

- Done/snooze reliability (optimistic-commit silent-failure fix, persistent error toast with retry)
- Thread revival for done/snoozed items (resurface on new non-ack inbound messages)
- Snooze preset menu (Tomorrow / 3 days / Next week / Next Monday) with configurable default
- Keep Ignore distinct for RL training signal
- Unique constraint on `dueFromMeItems.sourceId`
- Nudge query fix (suppress nudges for deferred items)
- Test-DB infrastructure established (Docker Postgres + transaction-rollback pattern)
- React Testing Library + component tests introduced

## Phase 2 — Sync health visibility & silent-failure remediation
**Why next:** the rest of the system is opaque. Every fix downstream lands better once failures are visible.

- Cron sync health surfacing: `lastSyncAt`, `lastSyncError`, `syncStatus` persisted in `appSettings`; health strip on Today page; new nudge type `sync_broken`
- Classifier fallback visibility: `classifiedByFallback` column; UI badge on items; dashboard banner when >N% of recent items used fallback
- Meeting attendee email-case mismatch fix (`meetings/upcoming/route.ts` — normalize `fromAddress` before mapping)
- Sheet disappeared-row cleanup (actually update DB, not just count)
- Missing `In-Reply-To` / `References` headers on outbound replies
- Structured logging with error IDs across all services (full `logger.ts`, error code taxonomy, Cloud Logging integration)
- Sync result `errors[]` surfaced in sync UI instead of hidden
- Empty catch blocks in `ItemDetailDrawer.tsx` replaced with actual error distinction (401 vs 404 vs 500 vs network)
- Fetch calls across dashboard components: add `res.ok` checks and empty-state vs error-state distinction

## Phase 3 — Security baseline
**Why next:** C1-C3 are the three highest-severity findings. Also unblocks any future multi-user or external-stakeholder conversation.

- Per-request `ALLOWED_USER_EMAIL` enforcement (session callback + middleware + shared route wrapper)
- Encrypt stored OAuth tokens at rest (AES-GCM, key via KMS/Secret Manager)
- Hard-gate `MOCK_AUTH` to `NODE_ENV !== "production"`; fail startup if both set
- CSRF on mutating routes (Origin / Sec-Fetch-Site check or token)
- Security headers: CSP with nonce, HSTS, frame-ancestors, Referrer-Policy, Permissions-Policy
- Rate limiting on `/api/emails/send`, `/api/emails/polish`, `/api/sync/gmail` (in-memory token bucket or Upstash)
- `/api/threads/[threadId]` — verify the thread was previously synced before calling Gmail
- Stop leaking `accessToken` to the browser via `/api/auth/session`
- Pin/evaluate next-auth v5 beta → stable when released, or pin exact version with advisory subscription
- Prompt-injection hardening: delimit attacker-controlled email content with sentinels in classifier and draft prompts
- JWT `maxAge` reduced to 8-24h for a mailbox-send-capable token
- UUID validation on route params (`z.string().uuid()` instead of `z.string().min(1)`)

## Phase 4 — Performance & reliability
**Why next:** correctness and security first; perf work lands cleanly on a stable base.

- Gmail sync:
  - Bulk DB writes (replace per-thread loop with batch upserts)
  - Batch GPT classification (5-10 threads per prompt, single completion) — ~10x cost reduction
  - Classification caching by `threadId + lastMessageId` fingerprint (skip GPT when unchanged)
  - Narrow default thread fetch from 500 to ~100 with smarter filter
- Retries with exponential backoff on every external API call (Gmail, Sheets, Calendar, OpenAI) via `p-retry`
- Sheet sync: single batch `UPDATE ... WHERE id IN (...)` for `lastSeenAt`
- Missing indexes (from review):
  - `gmail_threads(from_address, received_at DESC)`
  - `due_from_me_items` partial index `WHERE status <> 'done'`
  - `due_from_me_items(ownerEmail)`
  - `due_from_me_items(firstSeenAt)` for daily brief ORDER BY
  - `sheet_items(ownerEmail, status)` composite
  - `userActions(itemId, createdAt DESC)`
  - `nudges(sentAt)`
- Pagination on list endpoints (`/api/due-from-me`, `/api/waiting-on`, `/api/items`)
- Caching: `unstable_cache` for `/api/meetings/upcoming` (5-min bucket), owner directory, daily brief
- Cloud Run: `--min-instances=1` for cron to avoid cold-start timeouts during sync
- DB-level advisory lock for token refresh (replace in-memory mutex that fails under multiple Cloud Run instances)
- Transaction boundaries on multi-write operations (gmail sync per-thread, nudge generation)

## Phase 5 — Type design, schema hygiene & test coverage
**Why last:** structural refactors land best on a stabilized codebase; also least user-visible.

- Enable `noUncheckedIndexedAccess` in `tsconfig.json`
- Discriminated unions on `DueFromMeItem.status` — make illegal states unrepresentable
- Derive domain types from Drizzle schema (`typeof table.$inferSelect`), eliminate hand-rolled drift
- Single Zod schema per API boundary; export `z.infer`'d types; clients import from schema module
- Fix nullable epidemic (`blockingWho`, `ownerEmail`, `suggestedAction`) via discriminated unions
- Extract shared constants (`TERMINAL_STATUSES`, action types) — eliminate stringly-typed literals
- `UserActionType` — single definition
- Timestamp columns → `timestamp({ withTimezone: true })`
- Consolidate Zod schemas into `src/lib/schemas/` directory
- Missing test coverage from review: `refreshStoredToken`, `generateNudges`, full `syncGmailThreads` integration, optimistic-commit failure paths
- Fix `learning.test.ts` mocks that return the same item regardless of `where()`
- Fix `parseDueDate` timezone inconsistency (UTC for all formats)
- Fix `getSheetItems` dead-code query-builder branch
- Replace `String(error)` in debug routes with server-log + generic client message
- Add `maxAge`-safe session strategy decision (JWT vs DB) per security findings

## Out of roadmap (deferred or explicit non-goals)

- Multi-user support (architectural change, not a remediation)
- New features beyond what exists in `VISION_AND_GOALS.md`
- Migrating off Neon or away from Cloud Run
- Frontend visual redesign

## Phase tracking

Each phase gets its own design spec under this directory, and its own implementation plan under `docs/superpowers/plans/`. Completion checkpoint: all spec items shipped to production and verified.
