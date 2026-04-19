import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DueFromMeSection } from "@/components/dashboard/DueFromMeSection";
import { invalidateUserPreferences } from "@/lib/client-preferences";

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

beforeEach(() => {
  invalidateUserPreferences();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DueFromMeSection optimistic commit", () => {
  it("restores item and shows error toast with retry when commit fails", async () => {
    let itemActionCallCount = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("/api/due-from-me")) {
        return new Response(JSON.stringify({ items: [sampleItem] }), { status: 200 });
      }
      if (href.includes("/api/settings/preferences")) {
        return new Response(JSON.stringify({ defaultSnoozePreset: "3_days" }), { status: 200 });
      }
      if (href.includes("/api/items/") && href.includes("/action")) {
        itemActionCallCount++;
        if (itemActionCallCount === 1) {
          return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
        }
        return new Response(JSON.stringify({ success: true, action: "done" }), { status: 200 });
      }
      return new Response("not handled", { status: 404 });
    }) as unknown as typeof fetch;

    render(<DueFromMeSection />);
    await screen.findByText("Respond to vendor");

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });

    // Click Done
    await user.click(screen.getByRole("button", { name: /^done$/i }));

    // Item removed optimistically + action toast visible
    expect(screen.queryByText("Respond to vendor")).not.toBeInTheDocument();
    expect(screen.getByText(/marked as done/i)).toBeInTheDocument();

    // Advance past the 5s undo window — commit fires and fails
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

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
