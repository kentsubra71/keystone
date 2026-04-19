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
      + ". Run `npm run test:db:up && npm run test:db:migrate` first.",
      { cause: err }
    );
  } finally {
    await client.end();
  }
}
