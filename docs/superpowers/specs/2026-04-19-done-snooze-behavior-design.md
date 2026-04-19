# Done/Snooze Behavior & Silent-Failure Fix — Design

**Date:** 2026-04-19
**Phase:** 1 of 5 (see `roadmap.md`)
**Status:** Design approved, awaiting written-spec review

## Problem

Two related user-visible failures:

1. **Done doesn't stick.** Items marked Done silently reappear. Root cause: the optimistic-UI commit (`DueFromMeSection.tsx:58-68`, same pattern in `BlockingOthersSection.tsx`) fires a delayed `fetch` that doesn't check `res.ok`, swallows any error, and doesn't restore the item. The toast has already dismissed, so the failure is invisible.
2. **Snooze is fiddly.** The current inline "pick number of days" picker is slow and has no sensible defaults.

Related issues fixed in the same stroke:
- Done items currently never resurface even when a genuinely new ask arrives in the same Gmail thread.
- Snoozed items still generate nudges (`nudges.ts:43,84` missing `!= 'deferred'` filter).
- Duplicate DFM items possible under concurrent sync (no unique constraint on `sourceId`).

## Goals

- Marking Done must be reliable: either it commits and sticks, or the user sees a clear, retryable error.
- Done items should resurface when a new genuinely-actionable message arrives in the same Gmail thread.
- Snooze should be a 2-second interaction with sensible preset options, default configurable.
- Preserve distinct audit signals (`done`, `ignore`, `snooze`, new `resurfaced`) for the future RL training loop.

## Non-goals

- Cron sync health surfacing (Phase 2).
- Classifier fallback visibility (Phase 2).
- Security hardening (Phase 3).
- Performance/batching work (Phase 4).
- Type design refactor (Phase 5).

## Behavior model

### Done
- Marking Done sets `status = "done"`, `statusChangedAt = now`, logs `userActions.action = "done"`.
- A done item resurfaces only if:
  1. A new inbound message (`fromAddress != userEmail`) arrives in the same Gmail thread with `receivedAt > statusChangedAt`, AND
  2. The classifier flags that thread as `reply | approval | decision | follow_up` (its existing "FYI/noise → null" behavior naturally handles pure acks like "thanks", "noted").
- On resurface: the **same** row flips `done → not_started`; `firstSeenAt = newMessage.receivedAt`, `statusChangedAt = now`, `snoozedUntil = null`; `type`, `rationale`, `suggestedAction`, `confidenceScore` are overwritten with the new classification. A `userActions.action = "resurfaced"` audit entry is written.

### Snooze
- Four presets on every card:
  - **Tomorrow** (next calendar day at 9:00 local)
  - **3 days** (72h from now)
  - **Next week (7d)** (7×24h from now)
  - **Next Monday** (next occurrence of Monday at 9:00 local; if today is Monday, the following Monday)
- Default preset is user-configurable in Settings → Preferences. Ships with `"3_days"`.
- Snoozing sets `status = "deferred"`, `snoozedUntil = <computed timestamp>`, `statusChangedAt = now`, logs `userActions.action = "snooze"` with `newValue = <iso-timestamp>`.
- Snoozed items are hidden from Today/Due-From-Me until `snoozedUntil <= NOW()`.
- Same thread-revival rule as Done: a snoozed item wakes early if a new non-ack inbound message arrives.
- Snoozed items do NOT generate nudges (fix to `nudges.ts`).

### Ignore
- Kept as a distinct action — stays visible on cards.
- Sets `status = "done"` with `userActions.action = "ignore"`. Behaves like done for resurface purposes.
- Audit-log distinction is preserved for future RL training (see memory: "RL learning loop planned").

## Architecture

### Gmail sync changes (`src/lib/services/gmail-sync.ts`)

Current: `actedOnSourceIds` = set of sourceIds with `status in (done, deferred)`. Those threads are skipped entirely.

New per-thread logic:
```
1. Is there an existing DFM item for this sourceId with status in (done, deferred)?
   - Yes → find the latest inbound message in the thread.
     - If latestInbound.receivedAt <= item.statusChangedAt → skip (cheap SQL check, no GPT call).
     - Else → fall through to classify.
   - No → classify as normal.
2. Classify the thread.
3. If classification.type is set:
   - Upsert by sourceId (unique constraint).
   - If item existed and was done/deferred, this is a resurface:
     - status = "not_started", snoozedUntil = null
     - firstSeenAt = latestInbound.receivedAt
     - statusChangedAt = now
     - overwrite type/rationale/suggestedAction/confidenceScore
     - INSERT into userActions with action = "resurfaced"
4. If classification.type is null → no-op (the ack case).
```

Cost: one cheap `receivedAt > statusChangedAt` check per previously-acted thread. No extra GPT call in the common case. Resurfacing runs classifier once, the same as for a brand-new thread.

### Schema changes (`src/lib/db/schema.ts`)

- Add `"resurfaced"` to `userActionType` pg enum.
- Add unique constraint on `dueFromMeItems.sourceId` (`unique("uq_due_items_source_id").on(table.sourceId)`).
- Switch the upsert path in `gmail-sync.ts` from manual select-then-insert/update to `onConflictDoUpdate` keyed on `sourceId`.

No new columns: `statusChangedAt` and `snoozedUntil` already exist.

Migration: one Drizzle migration generated via `npm run db:generate`. Existing data: no backfill required (the unique constraint should be satisfiable if no duplicates currently exist — verify with a `SELECT sourceId, COUNT(*) FROM due_from_me_items GROUP BY sourceId HAVING COUNT(*) > 1` before applying; clean up any duplicates by keeping the most recent row).

### Preferences storage (`src/lib/db/schema.ts` — existing `appSettings`)

- Key: `user_preferences`
- Value (JSONB): `{ "defaultSnoozePreset": "tomorrow" | "3_days" | "next_week" | "next_monday" }`
- New API route `/api/settings/preferences`:
  - `GET` → returns current preferences (defaults if unset).
  - `PUT` → validates via Zod, upserts the `appSettings` row.
- Both require session auth (existing pattern).

### Nudge query fix (`src/lib/services/nudges.ts:43, 84`)

Add `ne(dueFromMeItems.status, "deferred")` to both the blocking and overdue queries. Snoozed items no longer trigger nudges.

### Snooze preset computation

New utility `src/lib/snooze.ts`:
```ts
export const SNOOZE_PRESETS = ["tomorrow", "3_days", "next_week", "next_monday"] as const;
export type SnoozePreset = typeof SNOOZE_PRESETS[number];

export function computeSnoozeUntil(preset: SnoozePreset, now = new Date()): Date { ... }
export function getDefaultSnoozePreset(): Promise<SnoozePreset> { /* read appSettings */ }
```

`computeSnoozeUntil` deterministic, runs client-side for immediate UI response, also server-side in the action route for validation.

Edge cases:
- `tomorrow` → next calendar day 09:00 in the user's local TZ.
- `next_monday` → if today is Monday, returns next Monday (7 days), not today.
- DST transitions handled by constructing from parts, not by adding ms.

## UI changes

### Snooze popover (`src/components/dashboard/ItemCard.tsx`)

Replace the inline days picker with a popover anchored to the Snooze button:

```
┌─────────────────────┐
│ Tomorrow        [1] │
│ 3 days  ✓       [2] │   ← default, bolded, check icon
│ Next week (7d)  [3] │
│ Next Monday     [4] │
└─────────────────────┘
```

- Keyboard: `1-4` select; `Esc` closes.
- Clicking a preset fires the action immediately (existing optimistic pattern).
- Default preset loaded once on page mount via `/api/settings/preferences`.

### Settings — Preferences section (`src/app/(dashboard)/settings/page.tsx`)

New `<PreferencesSection>` rendered above `<OwnerDirectoryManager>` and `<SyncSettings>`:

- Label: "Default snooze duration"
- Radio group: Tomorrow / 3 days / Next week (7d) / Next Monday
- Save button → `PUT /api/settings/preferences`.
- Success/error toasts using the existing Toast component.

## Error handling (the "done really means done" fix)

### Optimistic commit (`DueFromMeSection.tsx`, `BlockingOthersSection.tsx`, `WaitingOnSection.tsx`)

New pattern:
```ts
setTimeout(async () => {
  try {
    const res = await fetch(`/api/items/${itemId}/action`, ...);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    showPassiveToast("Saved");  // 2s, auto-dismiss
  } catch (err) {
    logError("item_action_commit_failed", err, { itemId, action });
    restoreItem(itemId);                            // put back in list
    showErrorToast("Couldn't save.", {
      persistent: true,
      action: { label: "Retry", onClick: () => retryCommit(itemId, action) },
    });
  }
}, UNDO_WINDOW_MS);
```

### Toast lifecycle (`src/components/ui/Toast.tsx`)

- `action` state (undo available): visible until `UNDO_WINDOW_MS` passes.
- `passive` state: "Saved" indicator, auto-dismiss 2s.
- `error` state: persistent, dismissable, optional retry button.

### Action route (`src/app/api/items/[id]/action/route.ts`)

- `learning.ts` `markItemDone` / `snoozeItem` / `ignoreItem` change from silent early-return to throwing `ItemNotFoundError` on missing item.
- Route catches `ItemNotFoundError` → 404 with `{ error: "item_not_found" }`.
- All other errors → 500 with a generic message (no stack leakage) and structured server-side log.

### Structured logging

Introduce `src/lib/logger.ts` (small — not a full observability rewrite, deferred to Phase 2):
```ts
export function logError(code: string, err: unknown, ctx?: Record<string, unknown>) {
  console.error(JSON.stringify({ level: "error", code, message: String(err), ctx, ts: new Date().toISOString() }));
}
```
Cloud Run captures stdout as Cloud Logging entries; structured JSON is queryable. Full error-ID + Sentry integration lands in Phase 2.

## Testing

### Test DB infrastructure (new)

- Add `docker-compose.test.yml` with a Postgres 16 service.
- Add `scripts/test-db-setup.ts` — runs Drizzle migrations on the test DB.
- `vitest.config.ts` `globalSetup` launches Postgres (or asserts it's running) and runs migrations.
- `beforeEach` opens a transaction, `afterEach` rolls back. Each test sees a clean DB.
- `package.json`: `"test:db": "docker compose -f docker-compose.test.yml up -d"` helper.

### Integration tests — `src/lib/services/__tests__/thread-revival.test.ts`

- Done item + new inbound ack-only message → row unchanged.
- Done item + new inbound actionable message → row flipped to `not_started`, `firstSeenAt` reset, `userActions.resurfaced` entry created.
- Snoozed item + new non-ack message → wakes early (same path).
- Snoozed item + no new messages, `snoozedUntil` passes → dynamic query returns it.
- Concurrent insert on same `sourceId` → second insert rejected by unique constraint, single row remains.

### Unit tests — `src/lib/__tests__/snooze.test.ts`

- `computeSnoozeUntil("tomorrow")` on various weekdays and DST boundaries.
- `computeSnoozeUntil("next_monday")` when today is Mon / Fri / Sun.
- `getDefaultSnoozePreset()` reads from `appSettings`, falls back to `"3_days"` when unset or malformed.

### Component tests — `src/components/dashboard/__tests__/ItemCard.test.tsx`

- Add React Testing Library, jsdom, `@testing-library/user-event` to devDeps.
- Snooze popover: all 4 presets render, default is visually emphasized, keyboard shortcuts select the correct preset.
- Clicking Done → item removed optimistically.
- Simulated commit failure → item restored + persistent error toast with retry button visible.
- Clicking Retry re-fires the action.

### Regression tests

- Nudge query: snoozed item does not appear in blocking or overdue nudge results.

## Migration & rollout

1. DB migration: unique constraint on `sourceId` + new `resurfaced` enum value. Run `npm run db:generate`, review SQL, apply via `npm run db:push`. Before applying: verify no duplicate sourceIds in prod (one-off query).
2. Ship behind no flag — this is a bug fix. Revert plan: revert the migration (drop unique constraint, remove enum value is harder — but leaving the enum value in place is harmless).
3. Verify in production: mark an item done, observe it stays done across a sync cycle; mark an item done, manually send a new inbound message to that thread, observe it resurfaces.

## Open questions

None at design approval time. All raised questions answered during brainstorming.

## References

- Silent-failure hunt findings D1, D5, D6, M2 (from code review session).
- Correctness bugs #4, #6 (from code review session).
- Project memory: "RL learning loop planned" — informs the Ignore-stays-separate decision.
