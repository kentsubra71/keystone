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
