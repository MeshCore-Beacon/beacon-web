import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "../../src/components/AppShell";
import { RegionProvider } from "../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../src/hooks/region-selection";
import { getIatas, getRegions, getRegion } from "../../src/api/client";
import type { WsManager } from "../../src/api/ws-manager";
import { noteRateLimited, noteRequestOk } from "../../src/api/rate-limit";
import pkg from "../../package.json";

vi.mock("../../src/api/client", () => ({
  getIatas: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

const wsManager = {
  onStatusChange: () => () => {},
  getStatus: () => "connected",
  getLastEventTimestamp: () => Date.now(),
} as unknown as WsManager;

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegionProvider defaultSelection={ALL_REGIONS}>
        <AppShell activeTab="Packets" onTabChange={() => {}} wsManager={wsManager}>
          <div />
        </AppShell>
      </RegionProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(getIatas).mockReset();
  vi.mocked(getRegions).mockReset().mockResolvedValue([]);
  vi.mocked(getRegion).mockReset();
});

describe("AppShell", () => {
  it("footer shows the package.json version", () => {
    vi.mocked(getIatas).mockResolvedValue([]);
    renderShell();
    expect(screen.getByText(`BEACON v${pkg.version}`)).toBeInTheDocument();
  });

  it("region picker shows an error state when the IATA list fails to load", async () => {
    vi.mocked(getIatas).mockRejectedValue(new Error("boom"));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));

    await waitFor(() => expect(screen.getByText("Failed to load")).toBeInTheDocument());
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });
});

const IATAS = [
  { iata: "YVR", displayName: "Vancouver International" },
  { iata: "YYJ", displayName: "Victoria International" },
  { iata: "YYZ", displayName: "Toronto Pearson" },
  { iata: "XXX" }, // auto-created from packet traffic — no displayName
];

const REGIONS = [
  { id: 1, slug: "western-canada", name: "Western Canada", iatas: ["YVR", "YYJ"] },
  { id: 2, slug: "eastern-canada", name: "Eastern Canada", iatas: ["YYZ"] },
  // name and member code both contain "YYJ", so one query exercises both match paths at once
  { id: 3, slug: "yyj-corridor", name: "YYJ Corridor", iatas: ["YYJ"] },
];

// Opens the picker and returns the filter input, once both region and IATA lists have landed.
// The trigger is focused first because a real browser click focuses the button; jsdom's does not.
async function openPicker() {
  const trigger = screen.getByRole("button", { name: /REGION/ });
  trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() => expect(screen.getByText("Western Canada")).toBeInTheDocument());
  return screen.getByPlaceholderText(/Filter/);
}

describe("region picker filter", () => {
  beforeEach(() => {
    vi.mocked(getIatas).mockResolvedValue(IATAS);
    vi.mocked(getRegions).mockResolvedValue(REGIONS.map(({ id, slug, name }) => ({ id, slug, name })));
    vi.mocked(getRegion).mockImplementation(async (id: number) => REGIONS.find((r) => r.id === id)!);
  });

  it("focuses the filter input when the picker opens", async () => {
    renderShell();
    const input = await openPicker();
    expect(input).toHaveFocus();
  });

  it("hands focus back to the trigger when the panel closes", async () => {
    renderShell();
    const input = await openPicker();
    expect(input).toHaveFocus();

    fireEvent.keyDown(input, { key: "Escape" }); // empty query, so this closes
    expect(screen.getByRole("button", { name: /REGION/ })).toHaveFocus();
  });

  it("narrows the IATA list by code, ignoring surrounding whitespace", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "  yvr  " } });

    expect(screen.getByText("Vancouver International")).toBeInTheDocument();
    expect(screen.queryByText("Toronto Pearson")).not.toBeInTheDocument();
    expect(screen.queryByText("Victoria International")).not.toBeInTheDocument();
    expect(screen.queryByText("No matches")).not.toBeInTheDocument();
  });

  it("narrows the IATA list by display name", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "toronto" } });

    expect(screen.getByText("Toronto Pearson")).toBeInTheDocument();
    expect(screen.queryByText("Vancouver International")).not.toBeInTheDocument();
    // no region name or member code contains "toronto"
    expect(screen.queryByText("Regions")).not.toBeInTheDocument();
    // nothing above it, so the header must not draw a divider
    expect(screen.getByText("IATA")).not.toHaveClass("border-t");
  });

  it("surfaces a region whose member IATA matches, tagged with the matching code", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "yvr" } });

    expect(screen.getByText("Western Canada")).toBeInTheDocument();
    expect(screen.getByText("· YVR")).toBeInTheDocument();
    expect(screen.queryByText("Eastern Canada")).not.toBeInTheDocument();
    // something is above it now, so the header does draw a divider
    expect(screen.getByText("IATA")).toHaveClass("border-t");
  });

  it("tags a code match but not a name match, for the same query", async () => {
    renderShell();
    const input = await openPicker();
    // "yyj" is in YYJ Corridor's *name* and in Western Canada's *member codes*
    fireEvent.change(input, { target: { value: "yyj" } });

    expect(screen.getByRole("button", { name: /Western Canada/ }).textContent).toContain("· YYJ");
    expect(screen.getByRole("button", { name: /YYJ Corridor/ }).textContent).not.toContain("·");
  });

  it("omits the matched-code tag when the region matched on its name", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "western" } });

    expect(screen.getByText("Western Canada")).toBeInTheDocument();
    expect(screen.queryByText("· YVR")).not.toBeInTheDocument();
    // nothing in the IATA group matches, so its header goes too
    expect(screen.queryByText("IATA")).not.toBeInTheDocument();
  });

  it("keeps an IATA with no display name matchable by code", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "xxx" } });

    // code column plus the displayName fallback, so the row renders the code twice
    expect(screen.getAllByText("XXX")).toHaveLength(2);
    expect(screen.queryByText("YVR")).not.toBeInTheDocument();
  });

  it("filters out the All Regions row unless it matches", async () => {
    renderShell();
    const input = await openPicker();

    fireEvent.change(input, { target: { value: "yvr" } });
    expect(screen.queryByText("All Regions")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "all" } });
    expect(screen.getByText("All Regions")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("All Regions")).toBeInTheDocument();
  });

  it("reports no matches without leaving a dangling group header", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "zzzz" } });

    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("Regions")).not.toBeInTheDocument();
    expect(screen.queryByText("IATA")).not.toBeInTheDocument();
    expect(screen.queryByText("All Regions")).not.toBeInTheDocument();
  });

  it("clears the query on Escape before closing the picker", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "yvr" } });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByPlaceholderText(/Filter/)).toHaveValue("");
    expect(screen.getByText("All Regions")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByPlaceholderText(/Filter/), { key: "Escape" });
    expect(screen.queryByText("All Regions")).not.toBeInTheDocument();
  });

  it("drops the query when the picker is reopened", async () => {
    renderShell();
    const input = await openPicker();
    fireEvent.change(input, { target: { value: "yvr" } });

    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));
    fireEvent.click(screen.getByRole("button", { name: /REGION/ }));

    await waitFor(() => expect(screen.getByPlaceholderText(/Filter/)).toHaveValue(""));
    expect(screen.getByText("Eastern Canada")).toBeInTheDocument();
  });
});

describe("rate limit badge", () => {
  beforeEach(() => {
    vi.mocked(getIatas).mockResolvedValue([]);
    vi.useFakeTimers();
  });

  afterEach(() => {
    noteRequestOk();
    vi.useRealTimers();
  });

  it("is hidden by default", () => {
    renderShell();
    expect(screen.queryByText(/RATE LIMITED/)).not.toBeInTheDocument();
  });

  it("shows a countdown after a 429 and hides once Retry-After elapses", () => {
    renderShell();

    act(() => noteRateLimited(5_000));
    expect(screen.getByText(/RATE LIMITED 5s/)).toHaveAttribute("role", "status");

    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText(/RATE LIMITED 3s/)).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.queryByText(/RATE LIMITED/)).not.toBeInTheDocument();
  });

  it("clears on the next successful request", () => {
    renderShell();

    act(() => noteRateLimited(30_000));
    expect(screen.getByText(/RATE LIMITED/)).toBeInTheDocument();

    act(() => noteRequestOk());
    expect(screen.queryByText(/RATE LIMITED/)).not.toBeInTheDocument();
  });
});
