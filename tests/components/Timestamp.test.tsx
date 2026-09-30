import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { Timestamp } from "../../src/components/Timestamp";
import i18n from "../../src/i18n";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Timestamp", () => {
  it("shows relative text, revealing the absolute time on hover (instant tooltip)", () => {
    const fiveMinAgo = Date.now() - 5 * 60_000;
    render(<Timestamp value={fiveMinAgo} />);
    const el = screen.getByText("5m ago");
    expect(el).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(); // hidden until hover

    fireEvent.mouseEnter(el);
    expect(screen.getByRole("tooltip").textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("renders the absolute string in absolute mode, relative on hover", () => {
    render(<Timestamp value={1717689045123} mode="absolute" />);
    const el = screen.getByText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    fireEvent.mouseEnter(el);
    expect(screen.getByRole("tooltip").textContent).toMatch(/ago$/);
  });

  it("includes milliseconds when ms is set", () => {
    render(<Timestamp value={1717689045123} mode="absolute" ms />);
    expect(screen.getByText(/\.123$/)).toBeInTheDocument();
  });

  it.each([
    [59_999, "59s", "59 s"],
    [60_000, "1m", "1 min"],
    [3_600_000, "1h", "1 h"],
    [86_400_000, "1d", "1 j"],
    [7 * 86_400_000, "7d", "7 j"],
    [-60_000, "0s", "0 s"],
  ])("translates the phrase while preserving duration %s", async (age, enDuration, frDuration) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
    render(<Timestamp value={Date.now() - age} />);
    const label = screen.getByText(`${enDuration} ago`);

    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByText(`il y a ${frDuration}`)).toBe(label);
    await act(() => i18n.changeLanguage("en"));
    expect(screen.getByText(`${enDuration} ago`)).toBe(label);
  });

  it("updates an open relative tooltip without changing the absolute value or milliseconds", async () => {
    vi.useFakeTimers();
    const value = new Date(2026, 8, 25, 12, 34, 56, 123).getTime();
    vi.setSystemTime(value + 5 * 60_000);
    render(<Timestamp value={value} mode="absolute" ms className="timestamp-label" />);
    const label = screen.getByText("2026-09-25 12:34:56.123");
    expect(label).toHaveClass("timestamp-label");
    fireEvent.mouseEnter(label);
    expect(screen.getByRole("tooltip")).toHaveTextContent("5m ago");

    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("il y a 5 min");
    expect(screen.getByText("2026-09-25 12:34:56.123")).toBe(label);
    expect(label).toHaveClass("timestamp-label");
  });

  it("keeps one shared timer for many translated timestamps and releases it on unmount", async () => {
    // Count polling intervals without counting React's asynchronous scheduling.
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(2026, 8, 25, 12, 0, 0));
    const value = Date.now() - 60_000;
    const { unmount } = render(<>{Array.from({ length: 100 }, (_, id) => <Timestamp key={id} value={value} />)}</>);
    expect(screen.getAllByText("1m ago")).toHaveLength(100);
    expect(vi.getTimerCount()).toBe(1);

    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getAllByText("il y a 1 min")).toHaveLength(100);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText("il y a 2 min")).toHaveLength(100);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
