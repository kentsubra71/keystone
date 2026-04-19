# Done/Snooze Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Done" actually stick, resurface items when a new actionable message arrives in the same thread, replace the inline snooze day-picker with 4 presets (Tomorrow / 3 days / Next week / Next Monday) configurable in Settings, and fix the silent-failure pattern on optimistic action commits.

**Architecture:** Test-DB-first (Docker Postgres + node-postgres driver selected via env var) so services can be tested against real SQL. Backend changes: new `"resurfaced"` user-action enum, unique constraint on `dueFromMeItems.sourceId`, modified Gmail sync that reopens items in place on new non-ack messages, learning service throws instead of silently returning on missing item, action API accepts ISO `snoozedUntil`. Frontend: new `SnoozePopover` with 4 presets + keyboard shortcuts, `Toast` rewritten with action/passive/error state machine and retry button, fixed optimistic-commit error handling in `DueFromMeSection` and `BlockingOthersSection`, new `Preferences` section on settings page.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Drizzle ORM, Neon HTTP (prod) + node-postgres (test), Vitest 4, React Testing Library, jsdom, Postgres 16 via Docker.

---

## File Structure

**New files:**
- `docker-compose.test.yml` — local Postgres 16 for tests
- `scripts/test-db-setup.ts` — applies Drizzle migrations to test DB
- `src/test/setup-globals.ts` — vitest `globalSetup` entry
- `src/test/db-helpers.ts` — `withTestDb()` helper + truncation logic
- `src/lib/logger.ts` — `logError`/`logInfo` structured-JSON helpers
- `src/lib/errors.ts` — `ItemNotFoundError` class
- `src/lib/snooze.ts` — `SnoozePreset` type, `SNOOZE_PRESETS` const, `computeSnoozeUntil`, `getDefaultSnoozePreset`
- `src/lib/client-preferences.ts` — browser-side preferences fetcher with in-memory cache
- `src/lib/services/resurface.ts` — `resurfaceItem` service function
- `src/app/api/settings/preferences/route.ts` — GET/PUT user preferences
- `src/components/dashboard/SnoozePopover.tsx` — 4-preset popover component
- `src/components/settings/PreferencesSection.tsx` — radio group + save button
- `src/lib/__tests__/snooze.test.ts`
- `src/lib/__tests__/logger.test.ts`
- `src/lib/services/__tests__/resurface.test.ts`
- `src/lib/services/__tests__/thread-revival.test.ts`
- `src/lib/services/__tests__/learning-errors.test.ts`
- `src/app/api/settings/preferences/__tests__/route.test.ts`
- `src/components/ui/__tests__/Toast.test.tsx`
- `src/components/dashboard/__tests__/SnoozePopover.test.tsx`
- `src/components/dashboard/__tests__/DueFromMeSection.test.tsx`

**Modified files:**
- `package.json` — new devDeps (`pg`, `@types/pg`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `tsx`) + new scripts
- `vitest.config.ts` — adds `globalSetup`, switches `environment` per project
- `src/lib/db/index.ts` — conditional driver: node-postgres when `TEST_DB_URL` set, otherwise Neon HTTP
- `src/lib/db/schema.ts` — adds `"resurfaced"` to `userActionTypeEnum`, adds `unique()` on `dueFromMeItems.sourceId`
- `src/lib/services/learning.ts` — throws `ItemNotFoundError` instead of early-return
- `src/app/api/items/[id]/action/route.ts` — handles `ItemNotFoundError` → 404, accepts `snoozedUntil` ISO string
- `src/lib/services/gmail-sync.ts` — replaces `actedOnSourceIds` skip with thread-revival check, calls `resurfaceItem` on new non-ack messages
- `src/lib/services/nudges.ts` — adds `ne(dueFromMeItems.status, "deferred")` to both queries
- `src/components/ui/Toast.tsx` — action/passive/error state machine + retry button
- `src/components/dashboard/ItemCard.tsx` — replaces inline snooze picker with `SnoozePopover`, takes preferences via hook, new `onAction` signature
- `src/components/dashboard/ItemDetailDrawer.tsx` — matches updated `onAction` signature
- `src/components/dashboard/DueFromMeSection.tsx` — fixes optimistic commit, uses new Toast states
- `src/components/dashboard/BlockingOthersSection.tsx` — same fix as above
- `src/app/(dashboard)/settings/page.tsx` — renders `PreferencesSection` above existing sections

---

## Task 1: Test DB infrastructure

**Files:**
- Create: `docker-compose.test.yml`
- Create: `scripts/test-db-setup.ts`
- Create: `src/test/setup-globals.ts`
- Create: `src/test/db-helpers.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `src/lib/db/index.ts`

- [ ] **Step 1: Create docker-compose file for test Postgres**

Create `docker-compose.test.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: keystone-test-db
    environment:
      POSTGRES_USER: keystone_test
      POSTGRES_PASSWORD: keystone_test
      POSTGRES_DB: keystone_test
    ports:
      - "5433:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U keystone_test"]
      interval: 2s
      timeout: 5s
      retries: 20
```

- [ ] **Step 2: Install test dependencies**

Run:
```bash
npm install --save-dev pg @types/pg jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom tsx
```

Expected: installs succeed, `package.json` devDeps updated.

- [ ] **Step 3: Add test scripts to `package.json`**

Modify `package.json` `scripts` to add:
```json
"test:db:up": "docker compose -f docker-compose.test.yml up -d --wait",
"test:db:down": "docker compose -f docker-compose.test.yml down -v",
"test:db:migrate": "tsx scripts/test-db-setup.ts",
"test": "vitest",
"test:run": "vitest run"
```
Keep existing scripts. The `test`/`test:run` entries already exist; do not duplicate.

- [ ] **Step 4: Create migration runner script**

Create `scripts/test-db-setup.ts`:
```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

const url = process.env.TEST_DB_URL || "postgres://keystone_test:keystone_test@localhost:5433/keystone_test";

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Test DB migrated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Make `src/lib/db/index.ts` driver-conditional**

Replace the contents of `src/lib/db/index.ts` with:
```ts
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const testUrl = process.env.TEST_DB_URL;

function buildDb() {
  if (testUrl) {
    const pool = new Pool({ connectionString: testUrl });
    return drizzlePg(pool, { schema });
  }
  const prodUrl = process.env.DATABASE_URL;
  if (!prodUrl) {
    console.warn("DATABASE_URL not set - database operations will fail");
    const sql = neon("postgresql://placeholder:placeholder@placeholder/placeholder");
    return drizzleHttp(sql, { schema });
  }
  const sql = neon(prodUrl);
  return drizzleHttp(sql, { schema });
}

export const db = buildDb();
export type Database = typeof db;

export function isDatabaseConfigured(): boolean {
  return !!(process.env.DATABASE_URL || process.env.TEST_DB_URL);
}
```

Note the two `drizzle` imports are aliased to avoid collision.

- [ ] **Step 6: Create global setup for vitest**

Create `src/test/setup-globals.ts`:
```ts
// Vitest globalSetup: runs once before the entire test suite.
// Assumes `npm run test:db:up` + `npm run test:db:migrate` have been run.
// We only validate the connection here — do not run migrations every test run.
import { Client } from "pg";

export async function setup() {
  const url = process.env.TEST_DB_URL
    || "postgres://keystone_test:keystone_test@localhost:5433/keystone_test";
  process.env.TEST_DB_URL = url;
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } catch (err) {
    throw new Error(
      "Test DB not reachable at " + url
      + ". Run `npm run test:db:up && npm run test:db:migrate` first."
    );
  } finally {
    await client.end();
  }
}
```

- [ ] **Step 7: Create DB helper for tests**

Create `src/test/db-helpers.ts`:
```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

const TRUNCATE_TABLES = [
  "user_actions",
  "nudges",
  "daily_briefs",
  "draft_transcripts",
  "due_from_me_items",
  "gmail_threads",
  "sheet_items",
  "owner_directory",
  "app_settings",
  "users",
];

export async function truncateAll() {
  const url = process.env.TEST_DB_URL!;
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      `TRUNCATE TABLE ${TRUNCATE_TABLES.join(", ")} RESTART IDENTITY CASCADE`
    );
  } finally {
    await pool.end();
  }
}

export function testDb() {
  const url = process.env.TEST_DB_URL!;
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}
```

- [ ] **Step 8: Update `vitest.config.ts`**

Replace `vitest.config.ts` with:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: ["./src/test/setup-globals.ts"],
    environmentMatchGlobs: [
      ["src/components/**/*.test.tsx", "jsdom"],
      ["src/components/**/*.test.ts", "jsdom"],
    ],
    environment: "node",
    setupFiles: ["./src/test/vitest-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 9: Create `src/test/vitest-setup.ts`**

Create `src/test/vitest-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 10: Verify test DB pipeline**

Run:
```bash
npm run test:db:up
npm run test:db:migrate
npm run test:run
```

Expected: containers start, migration completes, existing 75 tests still pass (zero regressions from the driver change).

- [ ] **Step 11: Commit**

```bash
git add docker-compose.test.yml scripts/test-db-setup.ts src/test package.json vitest.config.ts src/lib/db/index.ts package-lock.json
git commit -m "chore: add test-DB infrastructure and RTL deps

Docker Postgres 16 for test runs, driver-conditional db/index.ts
(node-postgres when TEST_DB_URL set, Neon HTTP otherwise), vitest
globalSetup validates connection, environmentMatchGlobs routes
component tests to jsdom. Adds RTL/user-event/jest-dom/tsx devDeps.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Logger and error types

**Files:**
- Create: `src/lib/logger.ts`
- Create: `src/lib/errors.ts`
- Create: `src/lib/__tests__/logger.test.ts`

- [ ] **Step 1: Write failing logger test**

Create `src/lib/__tests__/logger.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError, logInfo } from "@/lib/logger";

describe("logger", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logError emits JSON with code, level error, message, ts", () => {
    logError("item_action_commit_failed", new Error("boom"), { itemId: "abc" });
    expect(errSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe("error");
    expect(payload.code).toBe("item_action_commit_failed");
    expect(payload.message).toContain("boom");
    expect(payload.ctx).toEqual({ itemId: "abc" });
    expect(typeof payload.ts).toBe("string");
  });

  it("logInfo emits JSON with level info", () => {
    logInfo("sync_started", { userEmail: "a@b.com" });
    expect(logSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(payload.level).toBe("info");
    expect(payload.code).toBe("sync_started");
    expect(payload.ctx).toEqual({ userEmail: "a@b.com" });
  });

  it("logError handles non-Error values", () => {
    logError("some_code", "plain string");
    const payload = JSON.parse(errSpy.mock.calls[0][0] as string);
    expect(payload.message).toBe("plain string");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npm run test:run -- src/lib/__tests__/logger.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/logger'".

- [ ] **Step 3: Implement `logger.ts`**

Create `src/lib/logger.ts`:
```ts
type LogPayload = {
  level: "error" | "info";
  code: string;
  message: string;
  ctx?: Record<string, unknown>;
  ts: string;
};

function emit(level: "error" | "info", code: string, message: string, ctx?: Record<string, unknown>) {
  const payload: LogPayload = {
    level,
    code,
    message,
    ctx,
    ts: new Date().toISOString(),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logError(code: string, err: unknown, ctx?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  emit("error", code, message, ctx);
}

export function logInfo(code: string, ctx?: Record<string, unknown>): void {
  emit("info", code, "", ctx);
}
```

- [ ] **Step 4: Create `errors.ts`**

Create `src/lib/errors.ts`:
```ts
export class ItemNotFoundError extends Error {
  readonly itemId: string;
  constructor(itemId: string) {
    super(`Item not found: ${itemId}`);
    this.name = "ItemNotFoundError";
    this.itemId = itemId;
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/lib/__tests__/logger.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 6: Commit**

```bash
git add src/lib/logger.ts src/lib/errors.ts src/lib/__tests__/logger.test.ts
git commit -m "feat: structured JSON logger and ItemNotFoundError

logError/logInfo emit single-line JSON (level/code/message/ctx/ts)
queryable in Cloud Logging. ItemNotFoundError replaces silent
early-returns in the learning service.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Snooze utility

**Files:**
- Create: `src/lib/snooze.ts`
- Create: `src/lib/__tests__/snooze.test.ts`

- [ ] **Step 1: Write failing snooze tests**

Create `src/lib/__tests__/snooze.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeSnoozeUntil, SNOOZE_PRESETS } from "@/lib/snooze";

describe("computeSnoozeUntil", () => {
  // 2026-04-19 is a Sunday
  const sunday = new Date("2026-04-19T14:30:00-05:00");
  // 2026-04-20 is a Monday
  const monday = new Date("2026-04-20T09:15:00-05:00");
  // 2026-04-24 is a Friday
  const friday = new Date("2026-04-24T16:45:00-05:00");

  it("tomorrow returns next calendar day at 9:00 local", () => {
    const result = computeSnoozeUntil("tomorrow", sunday);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(0);
  });

  it("3_days returns 72 hours from now, preserving time-of-day", () => {
    const result = computeSnoozeUntil("3_days", sunday);
    const diffMs = result.getTime() - sunday.getTime();
    expect(diffMs).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it("next_week returns 7 days from now", () => {
    const result = computeSnoozeUntil("next_week", sunday);
    const diffMs = result.getTime() - sunday.getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("next_monday when today is Sunday returns tomorrow at 9am", () => {
    const result = computeSnoozeUntil("next_monday", sunday);
    expect(result.getDate()).toBe(20);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(9);
  });

  it("next_monday when today is Monday returns NEXT Monday (7 days out)", () => {
    const result = computeSnoozeUntil("next_monday", monday);
    expect(result.getDate()).toBe(27);
    expect(result.getDay()).toBe(1);
    expect(result.getHours()).toBe(9);
  });

  it("next_monday when today is Friday returns following Monday", () => {
    const result = computeSnoozeUntil("next_monday", friday);
    expect(result.getDate()).toBe(27);
    expect(result.getDay()).toBe(1);
  });

  it("SNOOZE_PRESETS contains exactly the four presets", () => {
    expect(SNOOZE_PRESETS).toEqual(["tomorrow", "3_days", "next_week", "next_monday"]);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm run test:run -- src/lib/__tests__/snooze.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `snooze.ts`**

Create `src/lib/snooze.ts`:
```ts
export const SNOOZE_PRESETS = ["tomorrow", "3_days", "next_week", "next_monday"] as const;
export type SnoozePreset = typeof SNOOZE_PRESETS[number];

export function computeSnoozeUntil(preset: SnoozePreset, now: Date = new Date()): Date {
  const result = new Date(now);

  switch (preset) {
    case "tomorrow": {
      result.setDate(result.getDate() + 1);
      result.setHours(9, 0, 0, 0);
      return result;
    }
    case "3_days": {
      return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    }
    case "next_week": {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    case "next_monday": {
      // 0 = Sun, 1 = Mon ... 6 = Sat
      const dayOfWeek = now.getDay();
      // Days to add: if today is Monday, add 7; else ((8 - dayOfWeek) % 7) gives Mon→Mon=7, Sun→Mon=1, Tue→Mon=6 ...
      const daysToAdd = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
      result.setDate(result.getDate() + daysToAdd);
      result.setHours(9, 0, 0, 0);
      return result;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/lib/__tests__/snooze.test.ts
```

Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/snooze.ts src/lib/__tests__/snooze.test.ts
git commit -m "feat: snooze preset computation utility

SNOOZE_PRESETS tuple (tomorrow/3_days/next_week/next_monday) and
computeSnoozeUntil that returns exact local-time timestamps. Monday
case: if today is Monday, next_monday is 7 days out, not 0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Schema migration — resurfaced enum + sourceId unique

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/<new migration>.sql` (auto-generated)

- [ ] **Step 1: Update schema**

Modify `src/lib/db/schema.ts`:

Change the `userActionTypeEnum` block (currently lines 42-48) to add `"resurfaced"`:
```ts
export const userActionTypeEnum = pgEnum("user_action_type", [
  "done",
  "snooze",
  "delegate",
  "ignore",
  "priority_override",
  "resurfaced",
]);
```

Replace the `dueFromMeItems` table indexes block (currently lines 168-172):
```ts
}, (table) => [
  index("idx_due_items_status").on(table.status),
  index("idx_due_items_source").on(table.source),
]);
```

And add a `unique()` declaration inline on `sourceId` (line 142 currently). Replace:
```ts
sourceId: text("source_id").notNull(),
```
with:
```ts
sourceId: text("source_id").notNull().unique("uq_due_items_source_id"),
```

Remove the now-redundant `index("idx_due_items_source_id")` — unique constraints include an index.

- [ ] **Step 2: Check prod DB for duplicate sourceIds**

Before generating the migration, flag this in the migration plan. Run against production (manually, via Neon console or `psql`):
```sql
SELECT source_id, COUNT(*) FROM due_from_me_items GROUP BY source_id HAVING COUNT(*) > 1;
```

If any rows return, delete the older duplicates:
```sql
DELETE FROM due_from_me_items a USING due_from_me_items b
WHERE a.source_id = b.source_id AND a.created_at < b.created_at;
```

Document the result (count of duplicates removed, or "none found") in the PR description. Do not proceed to step 3 in a production deploy before this check.

- [ ] **Step 3: Generate migration**

Run:
```bash
npm run db:generate
```

Expected: creates `drizzle/<nnnn>_<name>.sql` with:
- `ALTER TYPE user_action_type ADD VALUE 'resurfaced';`
- `ALTER TABLE due_from_me_items ADD CONSTRAINT uq_due_items_source_id UNIQUE (source_id);`
- Drops `idx_due_items_source_id`.

Inspect the generated SQL manually — Drizzle sometimes rewrites enums as drop-and-recreate which would fail. If that happens, hand-edit the migration to use `ALTER TYPE ... ADD VALUE` instead.

- [ ] **Step 4: Apply migration to test DB**

Run:
```bash
TEST_DB_URL=postgres://keystone_test:keystone_test@localhost:5433/keystone_test npm run test:db:migrate
```

Expected: "Test DB migrated." printed. No errors.

- [ ] **Step 5: Verify idempotent re-apply**

Run the migrate step a second time. Should be a no-op or succeed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add resurfaced user-action and sourceId unique constraint

New enum value supports tracking thread-revival events distinctly in
the audit log (for future RL training). Unique constraint on
dueFromMeItems.sourceId enables onConflictDoUpdate upserts and
prevents concurrent-sync duplicates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Learning service throws ItemNotFoundError

**Files:**
- Modify: `src/lib/services/learning.ts`
- Modify: `src/app/api/items/[id]/action/route.ts`
- Create: `src/lib/services/__tests__/learning-errors.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `src/lib/services/__tests__/learning-errors.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { markItemDone, snoozeItem, ignoreItem } from "@/lib/services/learning";
import { ItemNotFoundError } from "@/lib/errors";
import { truncateAll } from "@/test/db-helpers";

describe("learning service error handling", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("markItemDone throws ItemNotFoundError for missing item", async () => {
    await expect(markItemDone("00000000-0000-0000-0000-000000000000"))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });

  it("snoozeItem throws ItemNotFoundError for missing item", async () => {
    await expect(snoozeItem("00000000-0000-0000-0000-000000000000", new Date()))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });

  it("ignoreItem throws ItemNotFoundError for missing item", async () => {
    await expect(ignoreItem("00000000-0000-0000-0000-000000000000"))
      .rejects
      .toBeInstanceOf(ItemNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/learning-errors.test.ts
```

Expected: FAIL — functions return undefined instead of throwing. Also `snoozeItem` signature is still `(days: number)` — second test fails to compile.

- [ ] **Step 3: Rewrite `learning.ts`**

Replace the contents of `src/lib/services/learning.ts` with:
```ts
import { db } from "@/lib/db";
import { userActions, dueFromMeItems } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ItemNotFoundError } from "@/lib/errors";

export type UserActionType =
  | "done"
  | "snooze"
  | "delegate"
  | "ignore"
  | "priority_override"
  | "resurfaced";

export async function recordUserAction(
  itemId: string,
  itemSource: "gmail" | "sheet" | "calendar",
  action: UserActionType,
  previousValue?: string,
  newValue?: string
): Promise<void> {
  await db.insert(userActions).values({
    itemId,
    itemSource,
    action,
    previousValue: previousValue || null,
    newValue: newValue || null,
  });
}

async function loadItemOrThrow(itemId: string) {
  const [item] = await db
    .select()
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);
  if (!item) throw new ItemNotFoundError(itemId);
  return item;
}

export async function markItemDone(itemId: string): Promise<void> {
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(itemId, item.source, "done", item.status, "done");
  await db
    .update(dueFromMeItems)
    .set({ status: "done", statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function snoozeItem(itemId: string, snoozedUntil: Date): Promise<void> {
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(
    itemId,
    item.source,
    "snooze",
    undefined,
    snoozedUntil.toISOString()
  );
  await db
    .update(dueFromMeItems)
    .set({
      status: "deferred",
      snoozedUntil,
      statusChangedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function ignoreItem(itemId: string): Promise<void> {
  const item = await loadItemOrThrow(itemId);
  await recordUserAction(itemId, item.source, "ignore");
  await db
    .update(dueFromMeItems)
    .set({ status: "done", statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(dueFromMeItems.id, itemId));
}

export async function getActionHistory(itemId: string) {
  return db
    .select()
    .from(userActions)
    .where(eq(userActions.itemId, itemId))
    .orderBy(desc(userActions.createdAt));
}

export async function getUserActionPatterns() {
  const actions = await db.select().from(userActions);
  const patterns = {
    totalActions: actions.length,
    byAction: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  };
  for (const action of actions) {
    patterns.byAction[action.action] = (patterns.byAction[action.action] || 0) + 1;
    patterns.bySource[action.itemSource] = (patterns.bySource[action.itemSource] || 0) + 1;
  }
  return patterns;
}
```

Key signature change: `snoozeItem(itemId, snoozedUntil: Date)` — previous `days: number` version is gone.

- [ ] **Step 4: Update action route to accept ISO snoozedUntil and return 404**

Replace `src/app/api/items/[id]/action/route.ts` with:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markItemDone, snoozeItem, ignoreItem } from "@/lib/services/learning";
import { ItemNotFoundError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { z } from "zod";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done") }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("snooze"), snoozedUntil: z.string().datetime() }),
]);

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "done":
        await markItemDone(id);
        break;
      case "snooze":
        await snoozeItem(id, new Date(parsed.data.snoozedUntil));
        break;
      case "ignore":
        await ignoreItem(id);
        break;
    }
    return NextResponse.json({ success: true, action: parsed.data.action });
  } catch (error) {
    if (error instanceof ItemNotFoundError) {
      return NextResponse.json(
        { error: "item_not_found", itemId: error.itemId },
        { status: 404 }
      );
    }
    logError("item_action_failed", error, { itemId: id, action: parsed.data.action });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run test to verify pass**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/learning-errors.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 6: Run full test suite**

Run:
```bash
npm run test:run
```

Expected: existing `learning.test.ts` (old mock-based test) likely fails because it expected `snoozeItem(days: number)`. Delete that test file if it covers only the now-broken signature:
```bash
rm src/lib/services/__tests__/learning.test.ts
```
Or update it to match new signatures — but since its coverage is weak per the review, prefer deleting and relying on the new integration test plus the additional `thread-revival.test.ts` coming in Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/learning.ts src/app/api/items/\[id\]/action/route.ts src/lib/services/__tests__/
git commit -m "feat: learning service throws ItemNotFoundError; action API returns 404

markItemDone/snoozeItem/ignoreItem now throw instead of silent early-
return on missing item. Action API route catches ItemNotFoundError
→ 404, surfaces a discriminable error for the client to act on. API
contract for snooze switched from snoozeDays number to snoozedUntil
ISO string so local time semantics survive.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: resurfaceItem service function

**Files:**
- Create: `src/lib/services/resurface.ts`
- Create: `src/lib/services/__tests__/resurface.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/services/__tests__/resurface.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems, userActions } from "@/lib/db/schema";
import { resurfaceItem } from "@/lib/services/resurface";
import { eq } from "drizzle-orm";

describe("resurfaceItem", () => {
  const { db, pool } = testDb();

  beforeEach(async () => {
    await truncateAll();
  });

  it("flips done item back to not_started, resets firstSeenAt, logs audit", async () => {
    const originalFirstSeen = new Date("2026-04-01T09:00:00Z");
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old item",
      source: "gmail",
      sourceId: "thread-1",
      rationale: "old rationale",
      firstSeenAt: originalFirstSeen,
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const newFirstSeen = new Date("2026-04-15T15:00:00Z");
    await resurfaceItem(inserted.id, {
      type: "reply",
      confidence: 88,
      rationale: "new rationale",
      suggestedAction: "Reply asap",
      blockingWho: "ceo@x.com",
    }, newFirstSeen);

    const [updated] = await db.select().from(dueFromMeItems)
      .where(eq(dueFromMeItems.id, inserted.id)).limit(1);
    expect(updated.status).toBe("not_started");
    expect(updated.snoozedUntil).toBeNull();
    expect(updated.firstSeenAt.toISOString()).toBe(newFirstSeen.toISOString());
    expect(updated.type).toBe("reply");
    expect(updated.rationale).toBe("new rationale");
    expect(updated.suggestedAction).toBe("Reply asap");
    expect(updated.blockingWho).toBe("ceo@x.com");
    expect(updated.confidenceScore).toBe(88);

    const audits = await db.select().from(userActions)
      .where(eq(userActions.itemId, inserted.id));
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe("resurfaced");
  });

  it("clears snoozedUntil when resurfacing from deferred", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "deferred",
      title: "Snoozed",
      source: "gmail",
      sourceId: "thread-2",
      rationale: "old",
      snoozedUntil: new Date("2026-04-30T09:00:00Z"),
    }).returning();

    await resurfaceItem(inserted.id, {
      type: "decision",
      confidence: 70,
      rationale: "decision needed",
      suggestedAction: null,
      blockingWho: null,
    }, new Date());

    const [updated] = await db.select().from(dueFromMeItems)
      .where(eq(dueFromMeItems.id, inserted.id)).limit(1);
    expect(updated.status).toBe("not_started");
    expect(updated.snoozedUntil).toBeNull();
  });
});

afterAll(async () => {
  // Close pool to allow vitest to exit cleanly
  // (imported from testDb closure)
});
```

Note: import `afterAll` from vitest if missing above — add to the top-level imports if the second `describe` scope needs pool cleanup. Actually, simpler: close the pool inside `beforeEach`. But running Pool per-test is wasteful. Add this to the bottom instead:
```ts
import { afterAll } from "vitest";
afterAll(async () => { await pool.end(); });
```
Put that inside the describe block.

- [ ] **Step 2: Run test to verify fail**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/resurface.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resurface.ts`**

Create `src/lib/services/resurface.ts`:
```ts
import { db } from "@/lib/db";
import { dueFromMeItems, userActions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ItemNotFoundError } from "@/lib/errors";
import type { DueFromMeType } from "@/types";

export type ResurfaceClassification = {
  type: DueFromMeType;
  confidence: number;
  rationale: string;
  suggestedAction: string | null;
  blockingWho: string | null;
};

export async function resurfaceItem(
  itemId: string,
  newClassification: ResurfaceClassification,
  newFirstSeenAt: Date
): Promise<void> {
  const [item] = await db
    .select({ source: dueFromMeItems.source, status: dueFromMeItems.status })
    .from(dueFromMeItems)
    .where(eq(dueFromMeItems.id, itemId))
    .limit(1);
  if (!item) throw new ItemNotFoundError(itemId);

  const now = new Date();
  await db
    .update(dueFromMeItems)
    .set({
      status: "not_started",
      type: newClassification.type,
      confidenceScore: newClassification.confidence,
      rationale: newClassification.rationale,
      suggestedAction: newClassification.suggestedAction,
      blockingWho: newClassification.blockingWho,
      firstSeenAt: newFirstSeenAt,
      statusChangedAt: now,
      snoozedUntil: null,
      updatedAt: now,
    })
    .where(eq(dueFromMeItems.id, itemId));

  await db.insert(userActions).values({
    itemId,
    itemSource: item.source,
    action: "resurfaced",
    previousValue: item.status,
    newValue: "not_started",
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/resurface.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/resurface.ts src/lib/services/__tests__/resurface.test.ts
git commit -m "feat: resurfaceItem service

Flips a done/deferred item back to not_started, overwrites
classification fields with the new triggering message's data, resets
firstSeenAt so aging restarts, clears snoozedUntil, and writes a
'resurfaced' userActions audit entry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Gmail sync thread revival

**Files:**
- Modify: `src/lib/services/gmail-sync.ts`
- Create: `src/lib/services/__tests__/thread-revival.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `src/lib/services/__tests__/thread-revival.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems, gmailThreads, userActions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { ParsedThread } from "@/lib/google/gmail";

// Mock Gmail fetching + classifier
vi.mock("@/lib/google/gmail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google/gmail")>("@/lib/google/gmail");
  return {
    ...actual,
    getGmailClient: vi.fn(() => ({})),
    fetchRecentThreads: vi.fn(),
  };
});

vi.mock("@/lib/services/gmail-classifier", () => ({
  classifyThreads: vi.fn(),
  getSuggestedAction: vi.fn(() => "Handle it"),
}));

import { syncGmailThreads } from "@/lib/services/gmail-sync";
import { fetchRecentThreads } from "@/lib/google/gmail";
import { classifyThreads } from "@/lib/services/gmail-classifier";

const { db, pool } = testDb();

afterAll(async () => { await pool.end(); });

function makeThread(overrides: Partial<ParsedThread>): ParsedThread {
  return {
    threadId: "t1",
    subject: "Test",
    snippet: "snippet",
    messages: [],
    labels: [],
    isMailingList: false,
    ...overrides,
  };
}

describe("gmail sync thread revival", () => {
  beforeEach(async () => {
    await truncateAll();
    vi.clearAllMocks();
  });

  it("skips done item when no new inbound message", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    });

    const thread = makeThread({
      threadId: "t1",
      messages: [{
        messageId: "m1",
        from: "alice@x.com",
        to: ["user@x.com"],
        cc: [],
        body: "ok",
        receivedAt: new Date("2026-04-05T10:00:00Z"), // before statusChangedAt
      }],
    });
    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map());

    const result = await syncGmailThreads("tok", "user@x.com");

    // Classifier should NOT have been called — thread is pre-action and has no new messages
    expect(classifyThreads).not.toHaveBeenCalled();
    expect(result.success).toBe(true);

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.sourceId, "t1"));
    expect(item.status).toBe("done");
  });

  it("resurfaces done item when new non-ack inbound arrives", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      firstSeenAt: new Date("2026-04-01T00:00:00Z"),
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const newMsgDate = new Date("2026-04-15T08:30:00Z");
    const thread = makeThread({
      threadId: "t1",
      messages: [
        { messageId: "m2", from: "alice@x.com", to: ["user@x.com"], cc: [], body: "please approve the new version",
          receivedAt: newMsgDate },
      ],
    });

    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map([["t1", {
      type: "approval",
      confidence: 88,
      rationale: "new approval needed",
      suggestedAction: "Approve the new version",
      blockingWho: "alice@x.com",
    }]]));

    await syncGmailThreads("tok", "user@x.com");

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.id, inserted.id));
    expect(item.status).toBe("not_started");
    expect(item.firstSeenAt.toISOString()).toBe(newMsgDate.toISOString());
    expect(item.rationale).toBe("new approval needed");

    const audits = await db.select().from(userActions).where(eq(userActions.itemId, inserted.id));
    expect(audits.some(a => a.action === "resurfaced")).toBe(true);
  });

  it("leaves done item alone when classifier returns null for new message", async () => {
    const [inserted] = await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "done",
      title: "Old",
      source: "gmail",
      sourceId: "t1",
      rationale: "old",
      statusChangedAt: new Date("2026-04-10T10:00:00Z"),
    }).returning();

    const thread = makeThread({
      threadId: "t1",
      messages: [
        { messageId: "m2", from: "alice@x.com", to: ["user@x.com"], cc: [], body: "thanks!",
          receivedAt: new Date("2026-04-15T10:00:00Z") },
      ],
    });

    vi.mocked(fetchRecentThreads).mockResolvedValue([thread]);
    vi.mocked(classifyThreads).mockResolvedValue(new Map([["t1", {
      type: null, confidence: 0, rationale: "just ack", suggestedAction: null, blockingWho: null,
    }]]));

    await syncGmailThreads("tok", "user@x.com");

    const [item] = await db.select().from(dueFromMeItems).where(eq(dueFromMeItems.id, inserted.id));
    expect(item.status).toBe("done");
    const audits = await db.select().from(userActions).where(eq(userActions.itemId, inserted.id));
    expect(audits.some(a => a.action === "resurfaced")).toBe(false);
  });

  it("unique constraint prevents duplicate sourceId inserts", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval", status: "not_started", title: "A", source: "gmail", sourceId: "dup", rationale: "r",
    });
    await expect(
      db.insert(dueFromMeItems).values({
        type: "reply", status: "not_started", title: "B", source: "gmail", sourceId: "dup", rationale: "r",
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/thread-revival.test.ts
```

Expected: FAIL — current sync skips done items entirely; revival branch doesn't exist.

- [ ] **Step 3: Modify `gmail-sync.ts` for thread revival**

Replace the body of `src/lib/services/gmail-sync.ts` with:
```ts
import { db } from "@/lib/db";
import { gmailThreads, dueFromMeItems } from "@/lib/db/schema";
import { getGmailClient, fetchRecentThreads, extractEmailAddress } from "@/lib/google/gmail";
import type { ParsedThread } from "@/lib/google/gmail";
import { classifyThreads, getSuggestedAction } from "./gmail-classifier";
import { resurfaceItem } from "./resurface";
import { logError } from "@/lib/logger";
import { eq, inArray } from "drizzle-orm";

export type GmailSyncResult = {
  success: boolean;
  threadsFetched: number;
  threadsProcessed: number;
  threadsSkipped: number;
  dueItemsCreated: number;
  dueItemsUpdated: number;
  dueItemsResurfaced: number;
  errors: string[];
};

function shouldProcessThread(thread: ParsedThread, userEmail: string): boolean {
  if (thread.isMailingList) return false;
  const skipLabels = ["CATEGORY_PROMOTIONS", "CATEGORY_FORUMS", "CATEGORY_UPDATES", "SPAM", "TRASH"];
  if (thread.labels.some((l) => skipLabels.includes(l))) return false;
  const userLower = userEmail.toLowerCase();
  const userIsInTo = thread.messages.some((msg) =>
    msg.to.some((addr) => addr.toLowerCase() === userLower)
  );
  return userIsInTo;
}

function latestInboundMessage(thread: ParsedThread, userEmail: string) {
  const userLower = userEmail.toLowerCase();
  return [...thread.messages].reverse().find((m) =>
    extractEmailAddress(m.from).toLowerCase() !== userLower
  );
}

export async function syncGmailThreads(
  accessToken: string,
  userEmail: string
): Promise<GmailSyncResult> {
  const result: GmailSyncResult = {
    success: false,
    threadsFetched: 0,
    threadsProcessed: 0,
    threadsSkipped: 0,
    dueItemsCreated: 0,
    dueItemsUpdated: 0,
    dueItemsResurfaced: 0,
    errors: [],
  };

  try {
    const gmail = getGmailClient(accessToken);
    const allThreads = await fetchRecentThreads(gmail, 500);
    result.threadsFetched = allThreads.length;

    const threadsToProcess = allThreads.filter((t) => shouldProcessThread(t, userEmail));
    result.threadsSkipped = allThreads.length - threadsToProcess.length;

    if (threadsToProcess.length === 0) {
      result.success = true;
      return result;
    }

    const threadIds = threadsToProcess.map((t) => t.threadId);
    const existingThreadRows = await db
      .select({ threadId: gmailThreads.threadId })
      .from(gmailThreads)
      .where(inArray(gmailThreads.threadId, threadIds));
    const existingThreadSet = new Set(existingThreadRows.map((r) => r.threadId));

    const existingDueItems = await db
      .select({
        sourceId: dueFromMeItems.sourceId,
        status: dueFromMeItems.status,
        id: dueFromMeItems.id,
        statusChangedAt: dueFromMeItems.statusChangedAt,
      })
      .from(dueFromMeItems)
      .where(inArray(dueFromMeItems.sourceId, threadIds));
    const dueItemMap = new Map(existingDueItems.map((r) => [r.sourceId, r]));

    // Split: (a) threads with no prior action, (b) done/deferred threads with new inbound after statusChangedAt.
    // Skip: done/deferred threads where no inbound message is newer than statusChangedAt.
    const threadsNeedingClassification: ParsedThread[] = [];
    for (const thread of threadsToProcess) {
      const existing = dueItemMap.get(thread.threadId);
      const wasActedOn = existing && (existing.status === "done" || existing.status === "deferred");
      if (!wasActedOn) {
        threadsNeedingClassification.push(thread);
        continue;
      }
      const latest = latestInboundMessage(thread, userEmail);
      if (!latest) continue; // no inbound at all — nothing to revive on
      if (latest.receivedAt > existing.statusChangedAt) {
        threadsNeedingClassification.push(thread);
      }
      // else: acted-on thread with no new inbound since action — skip.
    }

    const classifications = await classifyThreads(threadsNeedingClassification, userEmail);
    result.threadsProcessed = threadsNeedingClassification.length;

    const now = new Date();

    for (const thread of threadsNeedingClassification) {
      const classification = classifications.get(thread.threadId);
      if (!classification) continue;

      try {
        const lastMsg = thread.messages[thread.messages.length - 1];

        if (existingThreadSet.has(thread.threadId)) {
          await db
            .update(gmailThreads)
            .set({
              subject: thread.subject,
              snippet: thread.snippet,
              fromAddress: lastMsg?.from || "",
              toAddresses: lastMsg?.to || [],
              ccAddresses: lastMsg?.cc || [],
              receivedAt: lastMsg?.receivedAt || now,
              labels: thread.labels,
              dueFromMeType: classification.type,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              isProcessed: true,
              updatedAt: now,
            })
            .where(eq(gmailThreads.threadId, thread.threadId));
        } else {
          await db.insert(gmailThreads).values({
            threadId: thread.threadId,
            messageId: lastMsg?.messageId || "",
            subject: thread.subject,
            snippet: thread.snippet,
            fromAddress: lastMsg?.from || "",
            toAddresses: lastMsg?.to || [],
            ccAddresses: lastMsg?.cc || [],
            receivedAt: lastMsg?.receivedAt || now,
            labels: thread.labels,
            dueFromMeType: classification.type,
            confidenceScore: classification.confidence,
            rationale: classification.rationale,
            isProcessed: true,
          });
        }

        if (!classification.type) continue; // ack/FYI case — no DFM item action

        const existing = dueItemMap.get(thread.threadId);
        const latest = latestInboundMessage(thread, userEmail);
        const requestDate = latest?.receivedAt || lastMsg?.receivedAt || now;

        if (!existing) {
          // Brand new
          const agingDays = Math.floor((now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
          await db.insert(dueFromMeItems).values({
            type: classification.type,
            status: "not_started",
            title: thread.subject,
            source: "gmail",
            sourceId: thread.threadId,
            blockingWho: classification.blockingWho || (lastMsg ? extractEmailAddress(lastMsg.from) : null),
            ownerEmail: userEmail,
            agingDays,
            daysInCurrentStatus: 0,
            firstSeenAt: requestDate,
            lastSeenAt: now,
            statusChangedAt: now,
            confidenceScore: classification.confidence,
            rationale: classification.rationale,
            suggestedAction: classification.suggestedAction || getSuggestedAction(classification.type),
          });
          result.dueItemsCreated++;
        } else if (existing.status === "done" || existing.status === "deferred") {
          // Resurface
          await resurfaceItem(existing.id, {
            type: classification.type,
            confidence: classification.confidence,
            rationale: classification.rationale,
            suggestedAction: classification.suggestedAction || getSuggestedAction(classification.type),
            blockingWho: classification.blockingWho || (lastMsg ? extractEmailAddress(lastMsg.from) : null),
          }, requestDate);
          result.dueItemsResurfaced++;
        } else {
          // In-flight update
          const agingDays = Math.floor((now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24));
          await db
            .update(dueFromMeItems)
            .set({
              agingDays,
              lastSeenAt: now,
              confidenceScore: classification.confidence,
              rationale: classification.rationale,
              blockingWho: classification.blockingWho || undefined,
              suggestedAction: classification.suggestedAction || undefined,
              updatedAt: now,
            })
            .where(eq(dueFromMeItems.id, existing.id));
          result.dueItemsUpdated++;
        }
      } catch (threadError) {
        const msg = threadError instanceof Error ? threadError.message : String(threadError);
        logError("thread_process_failed", threadError, { threadId: thread.threadId });
        result.errors.push(`Thread ${thread.threadId}: ${msg}`);
      }
    }

    result.success = true;
  } catch (error) {
    logError("gmail_sync_failed", error);
    result.errors.push(error instanceof Error ? error.message : "Unknown error");
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/thread-revival.test.ts
```

Expected: PASS, 4/4.

- [ ] **Step 5: Run full suite**

Run:
```bash
npm run test:run
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/gmail-sync.ts src/lib/services/__tests__/thread-revival.test.ts
git commit -m "feat: Gmail sync resurfaces done/deferred items on new actionable messages

Replaces the blanket skip of acted-on threads with a revival check:
if latest inbound message postdates statusChangedAt, classifier runs,
and a non-null result calls resurfaceItem. Pure acks ('thanks',
'noted') naturally hit the classifier's null branch and leave the
item done. Structured logging replaces console.error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Nudge deferred filter

**Files:**
- Modify: `src/lib/services/nudges.ts`
- Create: test case in `src/lib/services/__tests__/nudges-deferred.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/services/__tests__/nudges-deferred.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { dueFromMeItems } from "@/lib/db/schema";
import { generateNudges } from "@/lib/services/nudges";

const { db, pool } = testDb();
afterAll(async () => { await pool.end(); });

describe("nudges deferred filter", () => {
  beforeEach(async () => { await truncateAll(); });

  it("does not nudge for deferred (snoozed) items even when blocking or overdue", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "deferred",
      title: "Snoozed approval blocking Alice",
      source: "gmail",
      sourceId: "t-deferred",
      rationale: "blocks alice",
      blockingWho: "alice@x.com",
      agingDays: 5,
      snoozedUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });

    const nudges = await generateNudges();
    expect(nudges.find(n => n.itemTitle.includes("Snoozed approval"))).toBeUndefined();
  });

  it("still nudges for active blocking items", async () => {
    await db.insert(dueFromMeItems).values({
      type: "approval",
      status: "not_started",
      title: "Active approval",
      source: "gmail",
      sourceId: "t-active",
      rationale: "blocks bob",
      blockingWho: "bob@x.com",
      agingDays: 5,
    });

    const nudges = await generateNudges();
    expect(nudges.find(n => n.itemTitle === "Active approval")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/nudges-deferred.test.ts
```

Expected: first test FAILs — deferred item appears in nudges.

- [ ] **Step 3: Fix `nudges.ts`**

Modify `src/lib/services/nudges.ts`. In the `blockingItems` query (around line 40-51) and `overdueItems` query (around line 80-92), change each `and(...)` to add `ne(dueFromMeItems.status, "deferred")`.

For `blockingItems`:
```ts
const blockingItems = await db
  .select()
  .from(dueFromMeItems)
  .where(
    and(
      sql`${dueFromMeItems.blockingWho} IS NOT NULL`,
      ne(dueFromMeItems.status, "done"),
      ne(dueFromMeItems.status, "deferred"),
      sql`${dueFromMeItems.agingDays} >= 1`
    )
  )
  .orderBy(desc(dueFromMeItems.agingDays))
  .limit(remainingSlots);
```

For `overdueItems`:
```ts
const overdueItems = await db
  .select()
  .from(dueFromMeItems)
  .where(
    and(
      ne(dueFromMeItems.status, "done"),
      ne(dueFromMeItems.status, "deferred"),
      sql`${dueFromMeItems.agingDays} >= 3`,
      sql`${dueFromMeItems.type} IN ('reply', 'approval')`
    )
  )
  .orderBy(desc(dueFromMeItems.agingDays))
  .limit(remainingSlots - newNudges.length);
```

- [ ] **Step 4: Run test to verify pass**

Run:
```bash
npm run test:run -- src/lib/services/__tests__/nudges-deferred.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/nudges.ts src/lib/services/__tests__/nudges-deferred.test.ts
git commit -m "fix: suppress nudges for deferred (snoozed) items

Both blocking_others and overdue queries now include
status != 'deferred' so snoozed items don't generate nudges while
the user has explicitly deferred them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Preferences API route

**Files:**
- Create: `src/app/api/settings/preferences/route.ts`
- Create: `src/app/api/settings/preferences/__tests__/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/settings/preferences/__tests__/route.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterAll } from "vitest";
import { testDb, truncateAll } from "@/test/db-helpers";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { email: "user@x.com" } })),
}));

import { GET, PUT } from "@/app/api/settings/preferences/route";

const { db, pool } = testDb();
afterAll(async () => { await pool.end(); });

function makeReq(method: "GET" | "PUT", body?: unknown): Request {
  return new Request("http://localhost/api/settings/preferences", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as Request;
}

describe("/api/settings/preferences", () => {
  beforeEach(async () => { await truncateAll(); });

  it("GET returns defaults when unset", async () => {
    const res = await GET(makeReq("GET") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.defaultSnoozePreset).toBe("3_days");
  });

  it("PUT saves and GET returns the value", async () => {
    const putRes = await PUT(makeReq("PUT", { defaultSnoozePreset: "next_monday" }) as any);
    expect(putRes.status).toBe(200);

    const getRes = await GET(makeReq("GET") as any);
    const body = await getRes.json();
    expect(body.defaultSnoozePreset).toBe("next_monday");

    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "user_preferences"));
    expect((row.value as any).defaultSnoozePreset).toBe("next_monday");
  });

  it("PUT rejects invalid preset", async () => {
    const res = await PUT(makeReq("PUT", { defaultSnoozePreset: "never" }) as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm run test:run -- src/app/api/settings/preferences
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/settings/preferences/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SNOOZE_PRESETS } from "@/lib/snooze";
import { logError } from "@/lib/logger";
import { z } from "zod";

const PREFS_KEY = "user_preferences";
const DEFAULTS = { defaultSnoozePreset: "3_days" as const };

const PrefsSchema = z.object({
  defaultSnoozePreset: z.enum(SNOOZE_PRESETS),
});

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
    if (!row) return NextResponse.json(DEFAULTS);

    const parsed = PrefsSchema.safeParse(row.value);
    if (!parsed.success) return NextResponse.json(DEFAULTS);
    return NextResponse.json(parsed.data);
  } catch (err) {
    logError("preferences_get_failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = PrefsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const now = new Date();
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, PREFS_KEY)).limit(1);
    if (existing) {
      await db.update(appSettings).set({ value: parsed.data, updatedAt: now }).where(eq(appSettings.key, PREFS_KEY));
    } else {
      await db.insert(appSettings).values({ key: PREFS_KEY, value: parsed.data });
    }
    return NextResponse.json({ success: true, ...parsed.data });
  } catch (err) {
    logError("preferences_put_failed", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/app/api/settings/preferences
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/preferences/
git commit -m "feat: GET/PUT /api/settings/preferences

Stores user preferences (currently only defaultSnoozePreset) as JSONB
in the existing appSettings table under key 'user_preferences'.
Validates preset against SNOOZE_PRESETS. Falls back to '3_days' when
unset or malformed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Client-side preferences fetcher

**Files:**
- Create: `src/lib/client-preferences.ts`

- [ ] **Step 1: Implement fetcher**

Create `src/lib/client-preferences.ts`:
```ts
import type { SnoozePreset } from "./snooze";

export type UserPreferences = {
  defaultSnoozePreset: SnoozePreset;
};

const DEFAULTS: UserPreferences = { defaultSnoozePreset: "3_days" };

let cache: Promise<UserPreferences> | null = null;

export function getUserPreferences(): Promise<UserPreferences> {
  if (!cache) {
    cache = fetch("/api/settings/preferences")
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .catch(() => DEFAULTS);
  }
  return cache;
}

export function invalidateUserPreferences(): void {
  cache = null;
}
```

No separate test — will be exercised via the ItemCard component tests in Task 13.

- [ ] **Step 2: Commit**

```bash
git add src/lib/client-preferences.ts
git commit -m "feat: client-side preferences fetcher with in-memory cache

Module-level promise caches the /api/settings/preferences fetch so
every ItemCard shares one request. invalidateUserPreferences is
called by PreferencesSection on save.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Toast rewrite (action / passive / error states + retry)

**Files:**
- Modify: `src/components/ui/Toast.tsx`
- Create: `src/components/ui/__tests__/Toast.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/ui/__tests__/Toast.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "@/components/ui/Toast";

afterEach(cleanup);

describe("Toast", () => {
  it("renders action state with undo button", () => {
    render(
      <Toast state="action" message="Marked done" onDismiss={() => {}} undoAction={() => {}} />
    );
    expect(screen.getByText("Marked done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("clicking undo calls undoAction and onDismiss", async () => {
    const undo = vi.fn();
    const dismiss = vi.fn();
    render(<Toast state="action" message="x" onDismiss={dismiss} undoAction={undo} />);
    await userEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(undo).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });

  it("renders passive state without buttons", () => {
    render(<Toast state="passive" message="Saved" onDismiss={() => {}} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders error state with retry button when provided", () => {
    render(
      <Toast
        state="error"
        message="Couldn't save."
        onDismiss={() => {}}
        action={{ label: "Retry", onClick: () => {} }}
      />
    );
    expect(screen.getByText("Couldn't save.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("clicking retry calls action.onClick", async () => {
    const retry = vi.fn();
    render(
      <Toast
        state="error"
        message="fail"
        onDismiss={() => {}}
        action={{ label: "Retry", onClick: retry }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("error state has a dismiss (close) button", async () => {
    const dismiss = vi.fn();
    render(<Toast state="error" message="fail" onDismiss={dismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismiss).toHaveBeenCalled();
  });

  it("action state auto-dismisses after duration", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast state="action" message="x" duration={5000} onDismiss={dismiss} undoAction={() => {}} />);
    vi.advanceTimersByTime(5000);
    // Allow the internal 300ms exit animation to pass
    vi.advanceTimersByTime(300);
    expect(dismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("error state does NOT auto-dismiss", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast state="error" message="fail" onDismiss={dismiss} />);
    vi.advanceTimersByTime(60_000);
    expect(dismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm run test:run -- src/components/ui/__tests__/Toast.test.tsx
```

Expected: FAIL — `state` prop doesn't exist, `action` prop doesn't exist, no dismiss button.

- [ ] **Step 3: Rewrite `Toast.tsx`**

Replace `src/components/ui/Toast.tsx` with:
```tsx
"use client";

import { useEffect, useState } from "react";

export type ToastState = "action" | "passive" | "error";

type ToastProps = {
  state: ToastState;
  message: string;
  duration?: number;
  onDismiss: () => void;
  undoAction?: () => void;
  action?: { label: string; onClick: () => void };
};

const DEFAULT_DURATION: Record<ToastState, number | null> = {
  action: 5000,
  passive: 2000,
  error: null,  // persistent
};

export function Toast({ state, message, duration, onDismiss, undoAction, action }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const effectiveDuration = duration ?? DEFAULT_DURATION[state];

  useEffect(() => {
    if (effectiveDuration === null) return;
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, effectiveDuration);
    return () => clearTimeout(timer);
  }, [effectiveDuration, onDismiss]);

  const containerClasses = state === "error"
    ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800/60 text-rose-900 dark:text-rose-200"
    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700/40 text-gray-900 dark:text-white";

  return (
    <div
      role={state === "error" ? "alert" : "status"}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      <div className={`border px-5 py-3 rounded-xl shadow-lg flex items-center gap-4 ${containerClasses}`}>
        <span className="text-sm">{message}</span>
        {state === "action" && undoAction && (
          <button
            onClick={() => { undoAction(); onDismiss(); }}
            className="text-sm font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-200 transition-colors"
          >
            Undo
          </button>
        )}
        {state === "error" && action && (
          <button
            onClick={action.onClick}
            className="text-sm font-semibold text-rose-800 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-200 transition-colors"
          >
            {action.label}
          </button>
        )}
        {state === "error" && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="text-sm text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-100 transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/components/ui/__tests__/Toast.test.tsx
```

Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Toast.tsx src/components/ui/__tests__/Toast.test.tsx
git commit -m "feat: Toast with action/passive/error state machine and retry

Error toasts are persistent (no auto-dismiss), have a dismiss button
and an optional retry action. Action toasts keep existing 5s undo
behavior. Passive toasts (2s 'Saved' indicator) are new.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: SnoozePopover component

**Files:**
- Create: `src/components/dashboard/SnoozePopover.tsx`
- Create: `src/components/dashboard/__tests__/SnoozePopover.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/dashboard/__tests__/SnoozePopover.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnoozePopover } from "@/components/dashboard/SnoozePopover";

afterEach(cleanup);

describe("SnoozePopover", () => {
  it("renders all 4 presets", () => {
    render(<SnoozePopover defaultPreset="3_days" onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /tomorrow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 days/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next week/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next monday/i })).toBeInTheDocument();
  });

  it("marks the default preset", () => {
    render(<SnoozePopover defaultPreset="next_monday" onPick={() => {}} onClose={() => {}} />);
    const mon = screen.getByRole("button", { name: /next monday/i });
    expect(mon).toHaveAttribute("data-default", "true");
  });

  it("clicking a preset calls onPick with that preset's timestamp", async () => {
    const onPick = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={onPick} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /tomorrow/i }));
    expect(onPick).toHaveBeenCalled();
    const arg = onPick.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
  });

  it("keyboard shortcuts 1-4 pick presets", async () => {
    const onPick = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={onPick} onClose={() => {}} />);
    await userEvent.keyboard("2");
    expect(onPick).toHaveBeenCalledOnce();
  });

  it("Escape calls onClose", async () => {
    const onClose = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={() => {}} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run:
```bash
npm run test:run -- src/components/dashboard/__tests__/SnoozePopover.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `SnoozePopover.tsx`**

Create `src/components/dashboard/SnoozePopover.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { computeSnoozeUntil, SNOOZE_PRESETS, type SnoozePreset } from "@/lib/snooze";

type SnoozePopoverProps = {
  defaultPreset: SnoozePreset;
  onPick: (snoozedUntil: Date) => void;
  onClose: () => void;
};

const LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Tomorrow",
  "3_days": "3 days",
  next_week: "Next week (7d)",
  next_monday: "Next Monday",
};

export function SnoozePopover({ defaultPreset, onPick, onClose }: SnoozePopoverProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= SNOOZE_PRESETS.length) {
        e.preventDefault();
        const preset = SNOOZE_PRESETS[n - 1];
        onPick(computeSnoozeUntil(preset));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPick, onClose]);

  return (
    <div className="absolute z-20 mt-1 w-56 rounded-lg border border-gray-200 dark:border-gray-700/40 bg-white dark:bg-gray-900 shadow-lg p-1">
      {SNOOZE_PRESETS.map((preset, idx) => {
        const isDefault = preset === defaultPreset;
        return (
          <button
            key={preset}
            data-default={isDefault ? "true" : undefined}
            onClick={() => onPick(computeSnoozeUntil(preset))}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors ${
              isDefault ? "font-semibold text-gray-900 dark:text-white" : "text-gray-700 dark:text-gray-200"
            }`}
          >
            <span className="flex items-center gap-2">
              {isDefault && <span aria-hidden className="text-brand-600 dark:text-brand-400">✓</span>}
              {LABELS[preset]}
            </span>
            <kbd className="text-xs text-gray-500 dark:text-gray-400">{idx + 1}</kbd>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/components/dashboard/__tests__/SnoozePopover.test.tsx
```

Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/SnoozePopover.tsx src/components/dashboard/__tests__/SnoozePopover.test.tsx
git commit -m "feat: SnoozePopover with 4 presets and keyboard shortcuts

Tomorrow / 3 days / Next week / Next Monday. Default preset is
visually emphasized with a check and bold. Keyboard 1-4 picks, Esc
closes. Emits Date (computed locally) so 'Next Monday 9am local'
survives the server boundary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Integrate SnoozePopover into ItemCard

**Files:**
- Modify: `src/components/dashboard/ItemCard.tsx`
- Modify: `src/components/dashboard/ItemDetailDrawer.tsx` (only the prop type for onAction)

- [ ] **Step 1: Change `ItemCard` onAction signature and wire SnoozePopover**

Replace `src/components/dashboard/ItemCard.tsx` with (key changes: new `onAction` signature takes `snoozedUntil?: Date` instead of `snoozeDays?: number`; inline picker replaced by `SnoozePopover`; loads default preset once via `getUserPreferences()`):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { MeetingBadge } from "./MeetingBadge";
import { SnoozePopover } from "./SnoozePopover";
import { getUserPreferences } from "@/lib/client-preferences";
import type { SnoozePreset } from "@/lib/snooze";
import type { DueFromMeItem } from "@/types";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type ItemCardProps = {
  item: DueFromMeItem;
  showBlockedPerson?: boolean;
  showOwner?: boolean;
  meetings?: EnrichedMeeting[];
  onSelect?: (item: DueFromMeItem) => void;
  onAction?: (itemId: string, action: "done" | "snooze" | "ignore", snoozedUntil?: Date) => void;
  onActionComplete?: () => void;
};

const typeBorderColors = {
  reply: "border-l-blue-500",
  approval: "border-l-amber-500",
  decision: "border-l-violet-500",
  follow_up: "border-l-emerald-500",
};

const typeBadgeStyles = {
  reply: "bg-blue-500/15 text-blue-800 dark:text-blue-300",
  approval: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  decision: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  follow_up: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
};

const typeLabels = {
  reply: "Reply",
  approval: "Approval",
  decision: "Decision",
  follow_up: "Follow-up",
};

export function ItemCard({ item, showBlockedPerson, showOwner, meetings, onSelect, onAction, onActionComplete }: ItemCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showSnoozePopover, setShowSnoozePopover] = useState(false);
  const [defaultPreset, setDefaultPreset] = useState<SnoozePreset>("3_days");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getUserPreferences().then(p => setDefaultPreset(p.defaultSnoozePreset));
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!showSnoozePopover) return;
    function onDoc(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowSnoozePopover(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showSnoozePopover]);

  async function handleAction(action: "done" | "snooze" | "ignore", snoozedUntil?: Date) {
    if (onAction) {
      onAction(item.id, action, snoozedUntil);
      return;
    }

    setIsLoading(true);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "snooze" && snoozedUntil) body.snoozedUntil = snoozedUntil.toISOString();
      const res = await fetch(`/api/items/${item.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) onActionComplete?.();
    } finally {
      setIsLoading(false);
    }
  }

  const gmailUrl = item.source === "gmail"
    ? `https://mail.google.com/mail/u/0/#inbox/${item.sourceId}`
    : null;

  return (
    <div
      onClick={() => onSelect?.(item)}
      className={`bg-surface-card rounded-xl border-l-[3px] border border-gray-200 dark:border-gray-700/40 ${typeBorderColors[item.type]} p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:shadow-glow-brand transition-all duration-200 animate-fade-in ${
        onSelect ? "cursor-pointer" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${typeBadgeStyles[item.type]}`}>
              {typeLabels[item.type]}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-300">{item.agingDays}d ago</span>
            {meetings && <MeetingBadge meetings={meetings} itemId={item.id} />}
          </div>
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{item.title}</h3>
          {showBlockedPerson && item.blockingWho && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Blocking: <span className="text-rose-800 dark:text-rose-300">{item.blockingWho}</span>
            </p>
          )}
          {showOwner && item.ownerEmail && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Owner: {item.ownerEmail}</p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{item.rationale}</p>
        </div>
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          {item.suggestedAction && (
            <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300 text-center max-w-[180px] truncate">
              {item.suggestedAction}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/40 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 dark:text-gray-300">{item.confidenceScore}% confidence</span>
          {gmailUrl && (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-brand-700 dark:text-brand-300 hover:text-brand-600 dark:hover:text-brand-200 inline-flex items-center gap-1 transition-colors"
            >
              Gmail
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleAction("done")}
            disabled={isLoading}
            className="text-xs font-medium text-emerald-800 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors"
          >
            Done
          </button>

          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowSnoozePopover((v) => !v)}
              disabled={isLoading}
              className="text-xs text-gray-600 dark:text-gray-300 hover:text-amber-500 dark:hover:text-amber-400 disabled:opacity-50 transition-colors"
            >
              Snooze
            </button>
            {showSnoozePopover && (
              <SnoozePopover
                defaultPreset={defaultPreset}
                onPick={(snoozedUntil) => {
                  setShowSnoozePopover(false);
                  handleAction("snooze", snoozedUntil);
                }}
                onClose={() => setShowSnoozePopover(false)}
              />
            )}
          </div>

          <button
            onClick={() => handleAction("ignore")}
            disabled={isLoading}
            className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-50 transition-colors"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `ItemDetailDrawer.tsx` onAction prop type**

Open `src/components/dashboard/ItemDetailDrawer.tsx` and find the `onAction` prop declaration. Change its type to:
```ts
onAction: (itemId: string, action: "done" | "snooze" | "ignore", snoozedUntil?: Date) => void;
```

Leave all other body code in the drawer unchanged for now (it may still call `onAction(item.id, action, snoozeDays)` somewhere — if so, change that call site to pass `undefined` or compute a Date for snooze. If the drawer exposes its own snooze UI, replicate the popover-based flow; otherwise just accept the new signature).

- [ ] **Step 3: Build to verify types**

Run:
```bash
npm run build
```

Expected: succeeds. If drawer calls `onAction(x, "snooze", 1)` the build fails — fix call sites by removing the days-number (let the caller's popover be responsible) or by computing Date with `computeSnoozeUntil("3_days")` as a fallback.

- [ ] **Step 4: Run all tests**

Run:
```bash
npm run test:run
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/ItemCard.tsx src/components/dashboard/ItemDetailDrawer.tsx
git commit -m "feat: ItemCard uses SnoozePopover with user-configured default

Replaces the inline days-number picker with the 4-preset popover.
Loads user default via client-preferences (cached). onAction
signature changed to (itemId, action, snoozedUntil?: Date).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Fix optimistic-commit silent failure

**Files:**
- Modify: `src/components/dashboard/DueFromMeSection.tsx`
- Modify: `src/components/dashboard/BlockingOthersSection.tsx`
- Create: `src/components/dashboard/__tests__/DueFromMeSection.test.tsx`

- [ ] **Step 1: Write failing component test**

Create `src/components/dashboard/__tests__/DueFromMeSection.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DueFromMeSection } from "@/components/dashboard/DueFromMeSection";

const sampleItem = {
  id: "item-1",
  type: "reply",
  status: "not_started",
  title: "Respond to vendor",
  source: "gmail",
  sourceId: "thread-1",
  blockingWho: null,
  ownerEmail: "user@x.com",
  agingDays: 2,
  daysInCurrentStatus: 2,
  firstSeenAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
  statusChangedAt: new Date().toISOString(),
  confidenceScore: 88,
  rationale: "Vendor asked for confirmation",
  suggestedAction: "Confirm timeline",
  notes: null,
  createdAt: new Date().toISOString(),
};

function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => Response | Promise<Response>>) {
  let i = 0;
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const h = handlers[Math.min(i, handlers.length - 1)];
    i++;
    return h(url, init);
  }) as any;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DueFromMeSection optimistic commit", () => {
  it("restores item and shows error toast with retry when commit fails", async () => {
    mockFetchSequence([
      // Initial fetch
      () => new Response(JSON.stringify({ items: [sampleItem] }), { status: 200 }),
      // Commit attempt returns 500
      () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      // Retry succeeds
      () => new Response(JSON.stringify({ success: true, action: "done" }), { status: 200 }),
    ]);

    render(<DueFromMeSection />);
    await screen.findByText("Respond to vendor");

    // Click Done
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: /^done$/i }));

    // Item removed optimistically + action toast visible
    expect(screen.queryByText("Respond to vendor")).not.toBeInTheDocument();
    expect(screen.getByText(/marked as done/i)).toBeInTheDocument();

    // Advance past the 5s undo window — commit fires and fails
    await act(async () => { vi.advanceTimersByTime(5000); });

    // Error toast with retry visible, item restored
    await waitFor(() => expect(screen.getByText(/couldn't save/i)).toBeInTheDocument());
    expect(screen.getByText("Respond to vendor")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry/i });
    await user.click(retry);

    // Retry succeeds — item removed again, no error toast
    await waitFor(() => expect(screen.queryByText("Respond to vendor")).not.toBeInTheDocument());
    expect(screen.queryByText(/couldn't save/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run:
```bash
npm run test:run -- src/components/dashboard/__tests__/DueFromMeSection.test.tsx
```

Expected: FAIL — current code swallows error, doesn't restore item, no error toast.

- [ ] **Step 3: Rewrite `DueFromMeSection.tsx`**

Replace `src/components/dashboard/DueFromMeSection.tsx` with:
```tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ItemCard } from "./ItemCard";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { Toast, type ToastState } from "@/components/ui/Toast";
import { logError } from "@/lib/logger";
import type { DueFromMeItem } from "@/types";
import type { EnrichedMeeting } from "@/app/api/meetings/upcoming/route";

type ActionKind = "done" | "snooze" | "ignore";

type ToastData =
  | { state: "action"; message: string }
  | { state: "passive"; message: string }
  | { state: "error"; message: string; retry: () => void };

type PendingAction = {
  itemId: string;
  action: ActionKind;
  snoozedUntil?: Date;
  timeoutId: ReturnType<typeof setTimeout>;
};

const UNDO_WINDOW_MS = 5000;

type DueFromMeSectionProps = { meetings?: EnrichedMeeting[] };

export function DueFromMeSection({ meetings }: DueFromMeSectionProps) {
  const [items, setItems] = useState<DueFromMeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DueFromMeItem | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const itemsRef = useRef<DueFromMeItem[]>([]);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/due-from-me?filter=due");
      if (res.ok) {
        const data = await res.json();
        const fetched = data.items || [];
        setItems(fetched);
        itemsRef.current = fetched;
      }
    } catch (err) {
      logError("fetch_due_items_failed", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function commitAction(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    const body: Record<string, unknown> = { action };
    if (action === "snooze" && snoozedUntil) body.snoozedUntil = snoozedUntil.toISOString();
    return fetch(`/api/items/${itemId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function runCommit(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    try {
      const res = await commitAction(itemId, action, snoozedUntil);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setToast({ state: "passive", message: "Saved" });
    } catch (err) {
      logError("item_action_commit_failed", err, { itemId, action });
      setItems(itemsRef.current); // restore
      setToast({
        state: "error",
        message: "Couldn't save. Try again.",
        retry: () => {
          // Optimistically remove again + re-fire immediately
          setItems((prev) => prev.filter((i) => i.id !== itemId));
          setToast(null);
          void runCommit(itemId, action, snoozedUntil);
        },
      });
    } finally {
      setPending(null);
    }
  }

  function handleActionWithUndo(itemId: string, action: ActionKind, snoozedUntil?: Date) {
    setSelectedItem(null);
    if (pending) clearTimeout(pending.timeoutId);

    setItems((prev) => prev.filter((i) => i.id !== itemId));

    const timeoutId = setTimeout(() => { void runCommit(itemId, action, snoozedUntil); }, UNDO_WINDOW_MS);
    setPending({ itemId, action, snoozedUntil, timeoutId });

    const label = action === "done" ? "Marked as done"
      : action === "snooze" ? "Snoozed"
      : "Ignored";
    setToast({ state: "action", message: label });
  }

  function handleUndo() {
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    setPending(null);
    setItems(itemsRef.current);
    setToast(null);
  }

  return (
    <section>
      <button onClick={() => setIsCollapsed(!isCollapsed)} className="flex items-center justify-between mb-4 w-full group">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Due From Me</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300">{items.length}</span>
        </div>
        <svg className={`h-5 w-5 text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isCollapsed ? null : isLoading ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <div className="inline-block h-5 w-5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-gray-600 dark:text-gray-300 mt-2">Loading...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-300">No items due from you right now</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} meetings={meetings} onSelect={setSelectedItem} onAction={handleActionWithUndo} />
          ))}
        </div>
      )}

      {selectedItem && (
        <ItemDetailDrawer item={selectedItem} onClose={() => setSelectedItem(null)} onAction={handleActionWithUndo} />
      )}

      {toast && (
        <Toast
          state={toast.state as ToastState}
          message={toast.message}
          undoAction={toast.state === "action" ? handleUndo : undefined}
          action={toast.state === "error" ? { label: "Retry", onClick: (toast as any).retry } : undefined}
          onDismiss={() => setToast(null)}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Apply the same pattern to `BlockingOthersSection.tsx`**

Replace `src/components/dashboard/BlockingOthersSection.tsx` similarly (same structure; only difference is `filter=blocking` query param and "Blocking Others" heading). Copy the body of `DueFromMeSection`, change:
- Component name to `BlockingOthersSection`
- URL to `/api/due-from-me?filter=blocking`
- Heading to `"Blocking Others"`
- Badge color to rose: `bg-rose-500/15 text-rose-800 dark:text-rose-300`
- Empty-state text to `"You are not blocking anyone"`
- Pass `showBlockedPerson` to `ItemCard`

(Keep the file length acceptable; the duplication is intentional to avoid premature abstraction — factoring out comes later if a third section materializes.)

- [ ] **Step 5: Run tests to verify pass**

Run:
```bash
npm run test:run -- src/components/dashboard/__tests__/DueFromMeSection.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run full suite**

Run:
```bash
npm run test:run
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/DueFromMeSection.tsx src/components/dashboard/BlockingOthersSection.tsx src/components/dashboard/__tests__/DueFromMeSection.test.tsx
git commit -m "fix: optimistic commit failure restores item and shows retryable error

Previous behavior swallowed fetch errors with console.error, leaving
the item removed from UI without a DB write — so it reappeared on
next poll, exactly the 'done doesn't stick' bug. Now: res.ok is
checked, failure restores items from ref, persistent error toast has
a Retry button. Also switches to new Toast state machine and uses
structured logger.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: PreferencesSection in settings

**Files:**
- Create: `src/components/settings/PreferencesSection.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/settings/PreferencesSection.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { SNOOZE_PRESETS, type SnoozePreset } from "@/lib/snooze";
import { getUserPreferences, invalidateUserPreferences } from "@/lib/client-preferences";
import { Toast } from "@/components/ui/Toast";
import { logError } from "@/lib/logger";

const LABELS: Record<SnoozePreset, string> = {
  tomorrow: "Tomorrow",
  "3_days": "3 days",
  next_week: "Next week (7d)",
  next_monday: "Next Monday",
};

export function PreferencesSection() {
  const [preset, setPreset] = useState<SnoozePreset>("3_days");
  const [initialPreset, setInitialPreset] = useState<SnoozePreset>("3_days");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ state: "passive" | "error"; message: string } | null>(null);

  useEffect(() => {
    getUserPreferences().then(p => {
      setPreset(p.defaultSnoozePreset);
      setInitialPreset(p.defaultSnoozePreset);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSnoozePreset: preset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      invalidateUserPreferences();
      setInitialPreset(preset);
      setToast({ state: "passive", message: "Preferences saved" });
    } catch (err) {
      logError("preferences_save_failed", err);
      setToast({ state: "error", message: "Couldn't save preferences." });
    } finally {
      setSaving(false);
    }
  }

  const dirty = preset !== initialPreset;

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-medium text-gray-900 dark:text-white mb-3">Default snooze duration</legend>
        <div className="space-y-2">
          {SNOOZE_PRESETS.map((p) => (
            <label key={p} className="flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <input
                type="radio"
                name="default-snooze"
                value={p}
                checked={preset === p}
                onChange={() => setPreset(p)}
                className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
              />
              {LABELS[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        onClick={save}
        disabled={!dirty || saving}
        className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving…" : "Save"}
      </button>

      {toast && (
        <Toast
          state={toast.state}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Render in settings page**

Replace `src/app/(dashboard)/settings/page.tsx` with:
```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { OwnerDirectoryManager } from "@/components/settings/OwnerDirectoryManager";
import { SyncSettings } from "@/components/settings/SyncSettings";
import { PreferencesSection } from "@/components/settings/PreferencesSection";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 dark:border-gray-700/40 px-8 py-6">
        <div className="max-w-5xl">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Admin configuration</p>
          <div className="h-0.5 w-12 bg-gradient-brand rounded-full mt-3" />
        </div>
      </header>
      <div className="max-w-5xl px-8 py-8">
        <div className="space-y-8">
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Preferences</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Defaults for how you interact with items.</p>
            <PreferencesSection />
          </section>
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Owner Directory</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Map display names from the sheet to email addresses for accurate ownership tracking.</p>
            <OwnerDirectoryManager />
          </section>
          <section className="bg-surface-card rounded-xl border border-gray-200 dark:border-gray-700/40 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Sync Settings</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Configure how and when data is synced from Google Sheets.</p>
            <SyncSettings />
          </section>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build and verify**

Run:
```bash
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/PreferencesSection.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: Preferences section on settings page

Radio group for default snooze preset. Saves via PUT /api/settings/
preferences and invalidates the in-memory cache so ItemCards pick up
the new default on next mount.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Manual verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Local smoke test — snooze presets**

Start the dev server (`npm run dev`) and visit `/today` locally. On any due-from-me card:
1. Click Snooze → popover shows 4 presets, "3 days" is emphasized.
2. Press `1` → popover closes, item removed, action toast shows "Snoozed".
3. Wait 7s → passive toast appears, fades.
4. Verify in DB:
   ```bash
   psql $DATABASE_URL -c "SELECT id, status, snoozed_until FROM due_from_me_items ORDER BY updated_at DESC LIMIT 3;"
   ```
   Expected: most recent row has `status='deferred'` and `snoozed_until` roughly tomorrow 9am local.

- [ ] **Step 2: Local smoke test — done stickiness**

On any item, click Done → item removed → wait >5 seconds → refresh page. Item should NOT reappear. Check DB as above.

- [ ] **Step 3: Local smoke test — error + retry**

Temporarily break the action route (e.g., throw an error in the `try` block). Click Done → wait 5s → verify:
1. Error toast appears with Retry button.
2. Item restored to list.
3. Click Retry → fails again (still broken) → toast re-appears.
4. Un-break the route, click Retry → item removed, passive toast.

Revert the temporary break.

- [ ] **Step 4: Local smoke test — snooze default**

Go to Settings → Preferences → pick "Next Monday" → Save → passive toast. Refresh to `/today`. Open any snooze popover → "Next Monday" is now emphasized as the default.

- [ ] **Step 5: Local smoke test — thread revival**

Harder to simulate without actually receiving email. Manual test via direct DB + forcing a sync:
1. Pick a done item. Note its `statusChangedAt` timestamp.
2. Send yourself a new message on that exact thread from another account, containing an actual ask ("can you approve X?").
3. Trigger `/api/sync/gmail` manually (the Sync Settings button).
4. Verify:
   - Item reappears in Today with a fresh `agingDays` ≈ 0.
   - `userActions` has a row with `action='resurfaced'` for that item.
   - Repeat with a "thanks" message → item stays done.

- [ ] **Step 6: Deploy to Cloud Run**

Follow `/deploy` slash command steps. Before deploying, run the duplicate-sourceId safety query (Task 4 step 2) against production DB. After deploy:
1. Visit production URL, repeat smoke tests 1-4.
2. Watch Cloud Logging for any `item_action_commit_failed` or `thread_process_failed` entries — should be zero under normal use.

- [ ] **Step 7: Final commit marker**

No new files. If anything changed during verification, commit it. Otherwise, skip.

---

## Self-Review Checklist

- [x] Every spec section mapped to a task.
- [x] No TBD/TODO placeholders.
- [x] `SnoozePreset` / `SNOOZE_PRESETS` / `computeSnoozeUntil` used consistently across Tasks 3, 9, 10, 12, 13, 15.
- [x] `ItemNotFoundError` defined in Task 2, used in Tasks 5 and 6.
- [x] `resurfaceItem` signature matches between definition (Task 6) and call site (Task 7).
- [x] Toast props (`state`, `action`, `undoAction`) consistent between Task 11 and Tasks 14/15.
- [x] `onAction` signature (`snoozedUntil?: Date`) consistent across ItemCard, DueFromMeSection, BlockingOthersSection, ItemDetailDrawer.
- [x] Action API contract change (`snoozedUntil` ISO string) matches on both sides (Task 5 route, Task 13 client).
- [x] Nudge deferred fix has both blocking + overdue queries updated (Task 8 step 3).
- [x] Test DB infrastructure established before any test needing it (Task 1 first).
- [x] Migration safety check documented before applying in prod (Task 4 step 2).
