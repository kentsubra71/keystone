import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

export async function truncateAll() {
  const url = process.env.TEST_DB_URL;
  if (!url) throw new Error("TEST_DB_URL required for truncateAll()");
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const isTestDb = /keystone_test/.test(url);
  if (!isLocal || !isTestDb) {
    throw new Error(
      `truncateAll() refused: TEST_DB_URL (${url}) is not a local keystone_test database`
    );
  }
  const pool = new Pool({ connectionString: url });
  try {
    // Discover tables at runtime so the TRUNCATE list can't drift from the
    // schema. Excludes drizzle's own migrations table.
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`
    );
    if (rows.length === 0) return;
    const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
    await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}

// `testDb()` exists separately from `db` in `src/lib/db/index.ts` because tests
// need the raw `Pool` handle for explicit cleanup (`pool.end()`) between cases.
// The shared `db` export hides the pool behind the drizzle wrapper, so tests
// that construct their own connection use this helper instead of duplicating
// the pool/drizzle plumbing everywhere.
export function testDb() {
  const url = process.env.TEST_DB_URL!;
  const pool = new Pool({ connectionString: url });
  return { db: drizzle(pool, { schema }), pool };
}
