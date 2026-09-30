import { it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "../../../src/i18n";
import { ObserverPicker } from "../../../src/features/observers/ObserverPicker";
import { getObserversPage } from "../../../src/api/client";

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ regionKey: "YOW", iatas: ["YOW"] }) }));
vi.mock("../../../src/api/client", () => ({ getObserversPage: vi.fn(async () => ({ items: [], hasMore: false })) }));

beforeEach(() => { vi.mocked(getObserversPage).mockClear(); });

function view(id: string, name: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ObserverPicker id={id} name={name} onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
}

it("shows the placeholder name, not the dropdown's default All label, before a partner is chosen", () => {
  view("", "Choose an observer to compare…");
  const trigger = screen.getByRole("button", { name: /Choose an observer to compare…/ });
  expect(trigger).not.toHaveTextContent("All");
});

it("keeps a trailing space visible while typing and trims only the query sent to the server", async () => {
  vi.useFakeTimers();
  try {
    view("", "Choose an observer");
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Node " } });
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(input).toHaveValue("Node ");
    expect(getObserversPage).toHaveBeenCalledWith(["YOW"], { name: "Node", limit: 50 });
  } finally {
    vi.useRealTimers();
  }
});
