import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "@/components/ui/Toast";

afterEach(cleanup);

describe("Toast", () => {
  it("renders action state with undo button", () => {
    render(
      <Toast state="action" message="Marked done" onDismiss={() => {}} undoAction={() => {}} />
    );
    expect(screen.getByText("Marked done")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
  });

  it("clicking undo calls undoAction and onDismiss", async () => {
    const undo = vi.fn();
    const dismiss = vi.fn();
    render(<Toast state="action" message="x" onDismiss={dismiss} undoAction={undo} />);
    await userEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(undo).toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalled();
  });

  it("renders passive state without buttons", () => {
    render(<Toast state="passive" message="Saved" onDismiss={() => {}} />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders error state with retry button when provided", () => {
    render(
      <Toast
        state="error"
        message="Couldn't save."
        onDismiss={() => {}}
        action={{ label: "Retry", onClick: () => {} }}
      />
    );
    expect(screen.getByText("Couldn't save.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("clicking retry calls action.onClick", async () => {
    const retry = vi.fn();
    render(
      <Toast
        state="error"
        message="fail"
        onDismiss={() => {}}
        action={{ label: "Retry", onClick: retry }}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("error state has a dismiss (close) button", async () => {
    const dismiss = vi.fn();
    render(<Toast state="error" message="fail" onDismiss={dismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(dismiss).toHaveBeenCalled();
  });

  it("action state auto-dismisses after duration", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast state="action" message="x" duration={5000} onDismiss={dismiss} undoAction={() => {}} />);
    vi.advanceTimersByTime(5000);
    // Allow the internal 300ms exit animation to pass
    vi.advanceTimersByTime(300);
    expect(dismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("error state does NOT auto-dismiss", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast state="error" message="fail" onDismiss={dismiss} />);
    vi.advanceTimersByTime(60_000);
    expect(dismiss).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
