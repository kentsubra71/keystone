import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnoozePopover } from "@/components/dashboard/SnoozePopover";

afterEach(cleanup);

describe("SnoozePopover", () => {
  it("renders all 4 presets", () => {
    render(<SnoozePopover defaultPreset="3_days" onPick={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /tomorrow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3 days/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next week/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next monday/i })).toBeInTheDocument();
  });

  it("marks the default preset", () => {
    render(<SnoozePopover defaultPreset="next_monday" onPick={() => {}} onClose={() => {}} />);
    const mon = screen.getByRole("button", { name: /next monday/i });
    expect(mon).toHaveAttribute("data-default", "true");
  });

  it("clicking a preset calls onPick with that preset's timestamp", async () => {
    const onPick = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={onPick} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /tomorrow/i }));
    expect(onPick).toHaveBeenCalled();
    const arg = onPick.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
  });

  it("keyboard shortcuts 1-4 pick presets", async () => {
    const onPick = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={onPick} onClose={() => {}} />);
    await userEvent.keyboard("2");
    expect(onPick).toHaveBeenCalledOnce();
  });

  it("Escape calls onClose", async () => {
    const onClose = vi.fn();
    render(<SnoozePopover defaultPreset="3_days" onPick={() => {}} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
