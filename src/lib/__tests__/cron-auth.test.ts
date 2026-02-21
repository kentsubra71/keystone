import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyCronSecret } from "@/lib/cron-auth";

describe("verifyCronSecret", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns false when CRON_SECRET is not set", () => {
    vi.stubEnv("CRON_SECRET", "");
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
      headers: { authorization: "Bearer anything" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false when CRON_SECRET env var is undefined", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
      headers: { authorization: "Bearer test" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false for wrong token", () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns false for missing authorization header", () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
    });
    expect(verifyCronSecret(req)).toBe(false);
  });

  it("returns true for correct token", () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
      headers: { authorization: "Bearer correct-secret" },
    });
    expect(verifyCronSecret(req)).toBe(true);
  });

  it("returns false for partial match (timing-safe)", () => {
    vi.stubEnv("CRON_SECRET", "my-secret-123");
    const req = new Request("http://localhost/api/cron/gmail", {
      method: "POST",
      headers: { authorization: "Bearer my-secret" },
    });
    expect(verifyCronSecret(req)).toBe(false);
  });
});
