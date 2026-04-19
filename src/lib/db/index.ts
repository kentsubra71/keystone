import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const testUrl = process.env.TEST_DB_URL;

// `db`'s inferred type is a union: `NeonHttpDatabase<typeof schema>` in prod
// (HTTP driver against Neon) and `NodePgDatabase<typeof schema>` in tests
// (node-postgres against local Postgres). Both satisfy the same drizzle query
// surface, but driver-specific features can behave differently between
// environments: notably `.transaction()` semantics, raw `sql` execution, and
// error shapes from the underlying client. Tests that exercise those areas
// should go through `testDb()` in `src/test/db-helpers.ts` and not assume
// parity with the Neon HTTP path.
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
