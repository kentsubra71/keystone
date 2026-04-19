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
