import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NodeFilterBar } from "../../../src/features/nodes/NodeFilterBar";

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => vi.restoreAllMocks());

const props = {
  search: "", onSearchChange: () => {}, searchField: "name", onSearchFieldChange: () => {},
  typeFilter: "", onTypeChange: () => {}, pathsFilter: "" as const, onPathsChange: () => {},
  tracesFilter: "" as const, onTracesChange: () => {}, scopeFilter: "", onScopeChange: () => {}, scopeOptions: [],
  pollerFilter: "" as const, onPollerChange: () => {},
};

describe("NodeFilterBar poller filter", () => {
  it("is a dropdown with Yes and No that reports the choice", async () => {
    setMobile(false);
    const onPollerChange = vi.fn();
    render(<NodeFilterBar {...props} onPollerChange={onPollerChange} />);
    fireEvent.click(within(screen.getByRole("toolbar")).getAllByRole("button", { name: /poller/i })[0]!);
    expect(await screen.findByRole("option", { name: "No" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Yes" }));
    expect(onPollerChange).toHaveBeenCalledWith("true");
  });

  it("counts in the mobile active badge and is reset by Clear", () => {
    setMobile(true);
    const onPollerChange = vi.fn();
    render(<NodeFilterBar {...props} pollerFilter="false" onPollerChange={onPollerChange} />);
    const filters = screen.getByRole("button", { name: /filters/i });
    expect(filters).toHaveTextContent("1");
    fireEvent.click(filters);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(onPollerChange).toHaveBeenCalledWith("");
  });
});
