import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SearchBar } from "../../src/components/SearchBar";

describe("compact observer search", () => {
  it("omits the field menu and coalesces typing before querying", () => {
    vi.useFakeTimers();
    try {
      const change = vi.fn();
      render(<SearchBar value="" onChange={change} fields={[{ value: "name", label: "Name" }]} field="name" onFieldChange={() => {}} hideField inputLabel="Search observers" />);
      const input = screen.getByRole("textbox", { name: "Search observers" });
      fireEvent.change(input, { target: { value: "Ro" } });
      fireEvent.change(input, { target: { value: "Roof" } });
      expect(change).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(300));
      expect(change).toHaveBeenCalledExactlyOnceWith("Roof");
      expect(screen.queryByRole("button", { name: /Name/ })).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });
});

describe("clearing the search", () => {
  it("reports an emptied box immediately instead of waiting out the debounce", () => {
    vi.useFakeTimers();
    try {
      const change = vi.fn();
      render(<SearchBar value="abcd" onChange={change} fields={[{ value: "hash", label: "Hash" }]} field="hash" onFieldChange={() => {}} hideField inputLabel="Search" />);
      fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: "" } });
      expect(change).toHaveBeenCalledExactlyOnceWith("");
      act(() => vi.advanceTimersByTime(300));
      expect(change).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
