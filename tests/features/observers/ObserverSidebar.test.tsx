import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "../../../src/i18n";
import { ObserverSidebar } from "../../../src/features/observers/ObserverSidebar";
import { directoryRow } from "../../fixtures/observer-directory";

const props = {
  observers: [directoryRow("Charlie", 900), directoryRow("Alpha", 100), directoryRow("Zero", 0), directoryRow("Unavailable", null)],
  filtered: false, isPending: false, isError: false, unsupported: false, onRetry: vi.fn(),
  sort: "traffic" as const, onSortChange: vi.fn(), maxObservationCount: 1000,
  hasNextPage: true, isFetchingNextPage: false, onLoadMore: vi.fn(),
  selectedId: "Alpha", onSelect: vi.fn(),
};

it("preserves server order and distinguishes known zero from unavailable counts", () => {
  render(<ObserverSidebar {...props} />);
  const rows = screen.getAllByRole("option");
  expect(rows.map(row => row.textContent)).toEqual(["Receiver Charlie900", "Receiver Alpha100", "Receiver Zero0", "Receiver Unavailable-"]);
  expect(rows[1]).toHaveAttribute("aria-selected", "true");
  expect(rows[1].querySelector('[style]')).toHaveStyle({ width: "10%" });
  expect(rows[2].querySelector('[style]')).toHaveStyle({ width: "0%" });
  expect(rows[3].querySelector('[style]')).toBeNull();
  fireEvent.click(rows[0]);
  expect(props.onSelect).toHaveBeenCalledWith("Charlie");
});

it("requests server Name sorting and keeps normalization fixed when pages append", () => {
  const { rerender } = render(<ObserverSidebar {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Name" }));
  expect(props.onSortChange).toHaveBeenCalledWith("name");
  rerender(<ObserverSidebar {...props} observers={[...props.observers, directoryRow("Later", 2000)]} />);
  expect(screen.getByRole("option", { name: /Receiver Alpha/ }).querySelector('[style]')).toHaveStyle({ width: "10%" });
  expect(screen.getByRole("option", { name: /Receiver Later/ }).querySelector('[style]')).toHaveStyle({ width: "100%" });
});

it("loads near the scroll end but not at the top of a long list or while loading", () => {
  const onLoadMore = vi.fn();
  const { rerender } = render(<ObserverSidebar {...props} onLoadMore={onLoadMore} />);
  const scroll = screen.getByRole("listbox").parentElement!;
  Object.defineProperties(scroll, { clientHeight: { value: 400 }, scrollHeight: { value: 2000 }, scrollTop: { value: 0, writable: true } });
  fireEvent.scroll(scroll);
  expect(onLoadMore).not.toHaveBeenCalled();
  scroll.scrollTop = 1500;
  fireEvent.scroll(scroll);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
  rerender(<ObserverSidebar {...props} onLoadMore={onLoadMore} isFetchingNextPage />);
  fireEvent.scroll(scroll);
  expect(onLoadMore).toHaveBeenCalledTimes(1);
});

it("fills a short viewport automatically, and stops on errors or the final page", () => {
  const height = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
  const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100);
  const onLoadMore = vi.fn();
  try {
    const { rerender } = render(<ObserverSidebar {...props} onLoadMore={onLoadMore} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(<ObserverSidebar {...props} onLoadMore={onLoadMore} isError />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("option")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(props.onRetry).toHaveBeenCalled();
    rerender(<ObserverSidebar {...props} onLoadMore={onLoadMore} hasNextPage={false} />);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("All observers loaded")).toBeInTheDocument();
  } finally { height.mockRestore(); scrollHeight.mockRestore(); }
});

it("explains incomplete analytics and the server's effective Name order", () => {
  render(<ObserverSidebar {...props} maxObservationCount={null} effectiveSort="name" coverage={{ status: "partial", expectedHours: 168, completeHours: 160, missingHours: 8, partialHours: 0 }} />);
  expect(screen.getByText(/Traffic counts unavailable/)).toHaveTextContent(/Name order/);
  expect(screen.getAllByRole("option")[0]).toHaveTextContent("Receiver Charlie-");
  expect(screen.getAllByRole("option")[0].querySelector('[style]')).toBeNull();
});

it("shows upgrade and retry, loading, and empty-filter states", () => {
  const { rerender } = render(<ObserverSidebar {...props} observers={[]} unsupported />);
  expect(screen.getByText(/server upgrade/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
  rerender(<ObserverSidebar {...props} observers={[]} isPending />);
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  rerender(<ObserverSidebar {...props} observers={[]} filtered hasNextPage={false} />);
  expect(screen.getByText("No matches")).toBeInTheDocument();
});


it.each(["partial", "unavailable"] as const)("renders available traffic and zero counts without a Name fallback when coverage is %s", status => {
  render(<ObserverSidebar {...props} observers={props.observers.slice(0, 3)} effectiveSort="traffic"
    windowEnd={1791162000000} coverage={{ status, expectedHours: 168, completeHours: 0, missingHours: 168, partialHours: 0 }} />);
  const rows = screen.getAllByRole("option");
  expect(rows.map(row => row.textContent)).toEqual(["Receiver Charlie900", "Receiver Alpha100", "Receiver Zero0"]);
  expect(rows[0].querySelector('[style]')).toHaveStyle({ width: "90%" });
  expect(rows[2].querySelector('[style]')).toHaveStyle({ width: "0%" });
  expect(screen.queryByText(/counts unavailable/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Name order/)).not.toBeInTheDocument();
  expect(screen.getByText(/coverage is incomplete/)).toBeInTheDocument();
  expect(screen.getByText(/Available history, up to 7 days/)).toBeInTheDocument();
});
