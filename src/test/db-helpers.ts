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
