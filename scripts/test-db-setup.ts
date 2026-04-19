import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TEST_DB_URL || "postgres://keystone_test:keystone_test@localhost:5433/keystone_test";

function ensureMigrationSql() {
  // `drizzle/*.sql` is gitignored in this repo, so a fresh clone only has the
  // meta snapshot. Regenerate the SQL file(s) if missing so migrate() can run.
  const migrationsDir = "./drizzle";
  if (!existsSync(migrationsDir)) return;

  const sqlFiles = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  if (sqlFiles.length > 0) return;

  console.log("No drizzle SQL migrations found; regenerating from schema...");
  // Wipe the meta snapshot so `drizzle-kit generate` rebuilds both snapshot
  // and SQL. (With a matching snapshot but no SQL, generate reports "no schema
  // changes" and won't emit anything.)
  const metaDir = join(migrationsDir, "meta");
  if (existsSync(metaDir)) {
    rmSync(metaDir, { recursive: true, force: true });
  }

  const env = { ...process.env } as Record<string, string>;
  if (!env.DATABASE_URL) env.DATABASE_URL = url;
  execSync("npx drizzle-kit generate", { stdio: "inherit", env });
}

async function main() {
  ensureMigrationSql();
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
