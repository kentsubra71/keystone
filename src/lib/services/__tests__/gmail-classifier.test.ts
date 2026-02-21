import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// Mock heavy dependencies to prevent slow module initialization
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { OAuth2: vi.fn() },
    gmail: vi.fn(),
  },
}));

// Re-create the schema here to test it independently
const ClassificationSchema = z.object({
  isDueFromMe: z.boolean(),
  type: z.enum(["reply", "approval", "decision", "follow_up"]).nullable(),
  confidence: z.number().min(0).max(100),
  rationale: z.string(),
  blockingWho: z.string().nullable(),
  suggestedAction: z.string().nullable(),
});

describe("ClassificationSchema (Zod validation)", () => {
  it("accepts a valid due-from-me response", () => {
    const valid = {
      isDueFromMe: true,
      type: "reply",
      confidence: 85,
      rationale: "Someone asked for a response",
      blockingWho: "alice@example.com",
      suggestedAction: "Send a response",
    };
    const result = ClassificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a valid not-due response", () => {
    const valid = {
      isDueFromMe: false,
      type: null,
      confidence: 10,
      rationale: "This is a newsletter",
      blockingWho: null,
      suggestedAction: null,
    };
    const result = ClassificationSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects response with invalid type", () => {
    const invalid = {
      isDueFromMe: true,
      type: "question", // not in enum
      confidence: 70,
      rationale: "test",
      blockingWho: null,
      suggestedAction: null,
    };
    const result = ClassificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects response with confidence out of range", () => {
    const invalid = {
      isDueFromMe: true,
      type: "reply",
      confidence: 150, // > 100
      rationale: "test",
      blockingWho: null,
      suggestedAction: null,
    };
    const result = ClassificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects response with negative confidence", () => {
    const invalid = {
      isDueFromMe: true,
      type: "reply",
      confidence: -5,
      rationale: "test",
      blockingWho: null,
      suggestedAction: null,
    };
    const result = ClassificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects response missing required fields", () => {
    const invalid = {
      isDueFromMe: true,
      type: "reply",
      // missing confidence, rationale
    };
    const result = ClassificationSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(ClassificationSchema.safeParse("not json").success).toBe(false);
    expect(ClassificationSchema.safeParse(null).success).toBe(false);
    expect(ClassificationSchema.safeParse(42).success).toBe(false);
  });

  it("accepts all four valid types", () => {
    for (const type of ["reply", "approval", "decision", "follow_up"]) {
      const result = ClassificationSchema.safeParse({
        isDueFromMe: true,
        type,
        confidence: 80,
        rationale: "test",
        blockingWho: null,
        suggestedAction: null,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("getSuggestedAction", () => {
  // Import the actual function
  it("returns correct suggestions for each type", async () => {
    const { getSuggestedAction } = await import("@/lib/services/gmail-classifier");
    expect(getSuggestedAction("reply")).toBe("Send a response");
    expect(getSuggestedAction("approval")).toBe("Review and approve/reject");
    expect(getSuggestedAction("decision")).toBe("Make a decision");
    expect(getSuggestedAction("follow_up")).toBe("Complete your commitment");
  });
});
