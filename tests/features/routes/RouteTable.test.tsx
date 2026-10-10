import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { RouteTable } from "../../../src/features/routes/RouteTable";
import { MemoryRouter, useLocation } from "react-router-dom";
import { RegionProvider, useRegionSelection } from "../../../src/hooks/useRegion";
import { ALL_REGIONS } from "../../../src/hooks/region-selection";
import {
  getKnownRoutesPage,
  searchKnownRoutes,
  searchCrossIATARoutes,
  getIatas,
  getRegions,
  getRegion,
} from "../../../src/api/client";
import type { KnownRoute, CrossIATARoute } from "../../../src/types/api";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({
  getKnownRoutesPage: vi.fn(),
  searchKnownRoutes: vi.fn(),
  searchCrossIATARoutes: vi.fn(),
  getIatas: vi.fn(),
  getRegions: vi.fn(),
  getRegion: vi.fn(),
}));

vi.mock("../../../src/features/routes/RouteDetailPanel", () => ({ RouteDetailPanel: ({ pathKey }: { pathKey?: string }) => <div data-testid="saved-route-selection">{pathKey}</div> }));

const mockGetKnownRoutesPage = vi.mocked(getKnownRoutesPage);
const mockSearchKnownRoutes = vi.mocked(searchKnownRoutes);
const mockSearchCrossIATARoutes = vi.mocked(searchCrossIATARoutes);
const mockGetIatas = vi.mocked(getIatas);
const mockGetRegions = vi.mocked(getRegions);

const node = (id: string, name: string) => ({ id, name, publicKey: "deadbeef" });

function renderTable(selection = ALL_REGIONS, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter><RegionProvider defaultSelection={selection}>{children}</RegionProvider></MemoryRouter>
    </QueryClientProvider>
  );
  render(<RouteTable />, { wrapper });
}

const openIataPicker = () => fireEvent.click(screen.getByText("Areas"));
const checkIata = (code: string) => fireEvent.click(screen.getByRole("option", { name: new RegExp(code) }));

beforeEach(() => {
  mockGetKnownRoutesPage.mockReset();
  mockSearchKnownRoutes.mockReset();
  mockSearchCrossIATARoutes.mockReset();
  mockGetIatas.mockReset();
  mockGetRegions.mockReset();
  mockGetKnownRoutesPage.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  mockSearchKnownRoutes.mockResolvedValue([]);
  mockSearchCrossIATARoutes.mockResolvedValue([]);
  mockGetRegions.mockResolvedValue([]);
  mockGetIatas.mockResolvedValue([
    { iata: "AAA", displayName: "Alpha" },
    { iata: "BBB", displayName: "Beta" },
    { iata: "CCC", displayName: "Gamma" },
  ]);
});

describe("RouteTable search", () => {
  const fillHashes = (from = "aa11", to = "bb22") => {
    fireEvent.change(screen.getByPlaceholderText("from hash"), { target: { value: from } });
    fireEvent.change(screen.getByPlaceholderText("to hash"), { target: { value: to } });
  };
  const known = (id: number, hopCount: number, lastSeen: number, iata = "AAA"): KnownRoute =>
    ({ id, iata, hopCount, hops: [], firstSeen: 1, lastSeen, observationCount: 40 + id });
  const crossRoute = (totalHops: number, lastSeen: number): CrossIATARoute => ({
    sourceSegment: [{ nodeId: "n1", hashBytes: "aa11", node: node("n1", "Src Node") }],
    crossHop: { fromNode: node("n1", "Src Node"), toNode: node("n2", "Dst Node"), fromIata: "AAA", toIata: "BBB", lastSeen },
    targetSegment: [{ nodeId: "n2", hashBytes: "bb22", node: node("n2", "Dst Node") }],
    totalHops,
  });
  const apiError = (status: number, message: string) => Object.assign(new Error(message), { status, code: "x" });

  it("searches only within the area when exactly one IATA is picked", async () => {
    renderTable();
    await screen.findByText("Find path");
    fillHashes("AA11", "bb22");
    openIataPicker();
    checkIata("AAA");
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchKnownRoutes).toHaveBeenCalledWith(["AAA"], "aa11", "bb22", expect.any(AbortSignal)));
    expect(mockSearchCrossIATARoutes).not.toHaveBeenCalled();
  });

  it("makes one call per endpoint for a multi-IATA pick, with the sorted list", async () => {
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    openIataPicker();
    checkIata("BBB");
    checkIata("AAA");
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchCrossIATARoutes).toHaveBeenCalledWith(["AAA", "BBB"], "aa11", "bb22", expect.any(AbortSignal)));
    expect(mockSearchCrossIATARoutes).toHaveBeenCalledTimes(1);
    expect(mockSearchKnownRoutes).toHaveBeenCalledTimes(1);
    expect(mockSearchKnownRoutes).toHaveBeenCalledWith(["AAA", "BBB"], "aa11", "bb22", expect.any(AbortSignal));
  });

  it("falls back to the region's IATAs when nothing is picked", async () => {
    renderTable({ regions: [], iatas: ["BBB", "AAA"] });
    await screen.findByText("Find path");
    fillHashes();
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchKnownRoutes).toHaveBeenCalledWith(["AAA", "BBB"], "aa11", "bb22", expect.any(AbortSignal)));
    expect(mockSearchCrossIATARoutes).toHaveBeenCalledWith(["AAA", "BBB"], "aa11", "bb22", expect.any(AbortSignal));
  });

  it("searches globally with no region and nothing picked", async () => {
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchKnownRoutes).toHaveBeenCalledWith(undefined, "aa11", "bb22", expect.any(AbortSignal)));
    expect(mockSearchCrossIATARoutes).toHaveBeenCalledWith(undefined, "aa11", "bb22", expect.any(AbortSignal));
  });

  it("treats every area picked as global", async () => {
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    openIataPicker();
    fireEvent.click(screen.getByText("All"));
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchKnownRoutes).toHaveBeenCalledWith(undefined, "aa11", "bb22", expect.any(AbortSignal)));
  });

  it("blocks a search over more than 100 areas", async () => {
    const codes = Array.from({ length: 102 }, (_, i) => `X${String(i).padStart(3, "0")}`);
    mockGetIatas.mockResolvedValue(codes.map((iata) => ({ iata })));
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    openIataPicker();
    fireEvent.click(screen.getByText("All"));
    checkIata(codes[0]!);

    expect(screen.getByText("Pick at most 100 areas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("rejects a hash that isn't 1–4 bytes of hex", async () => {
    renderTable();
    await screen.findByText("Find path");
    fillHashes("abc", "bb22");
    fireEvent.click(screen.getByText("Search"));

    expect(await screen.findByText("Hashes must be 2, 4, 6 or 8 hex characters")).toBeInTheDocument();
    expect(mockSearchKnownRoutes).not.toHaveBeenCalled();
  });

  it("merges both result sets by hop count, then most recently seen", async () => {
    mockSearchKnownRoutes.mockResolvedValue([known(1, 2, 10), known(2, 4, 50)]);
    mockSearchCrossIATARoutes.mockResolvedValue([crossRoute(2, 30)]);
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    fireEvent.click(screen.getByText("Search"));

    const crossLabel = await screen.findByText("AAA → BBB");
    const rowsText = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const order = ["AAA → BBB", "41", "42"].map((needle) => rowsText.findIndex((t) => t.includes(needle)));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order[0]).toBeGreaterThan(-1);
    const crossRow = crossLabel.closest("tr")!;
    expect(crossRow.textContent).toContain("AA11");
    expect(crossRow.textContent).toContain("BB22");
  });

  it("shows the server's 400 message as-is and never 'no matches'", async () => {
    const msg = "hash matches too many areas; use a longer hash or fewer iatas";
    mockSearchKnownRoutes.mockRejectedValue(apiError(400, msg));
    mockSearchCrossIATARoutes.mockRejectedValue(apiError(400, msg));
    renderTable();
    await screen.findByText("Find path");
    fillHashes("aa", "bb");
    fireEvent.click(screen.getByText("Search"));

    expect(await screen.findByText(msg)).toBeInTheDocument();
    expect(screen.queryByText("No matching routes")).not.toBeInTheDocument();
  });

  it("shows the timeout message on a 503", async () => {
    mockSearchKnownRoutes.mockRejectedValue(apiError(503, "timeout"));
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    openIataPicker();
    checkIata("AAA");
    fireEvent.click(screen.getByText("Search"));

    expect(await screen.findByText(/Route search timed out/)).toBeInTheDocument();
  });

  it("never retries a failed search, even when the app retries other queries", async () => {
    mockSearchKnownRoutes.mockRejectedValue(apiError(503, "timeout"));
    mockSearchCrossIATARoutes.mockRejectedValue(apiError(503, "timeout"));
    renderTable(ALL_REGIONS, new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } }));
    await screen.findByText("Find path");
    fillHashes();
    fireEvent.click(screen.getByText("Search"));

    expect(await screen.findByText(/Route search timed out/)).toBeInTheDocument();
    expect(mockSearchKnownRoutes).toHaveBeenCalledTimes(1);
    expect(mockSearchCrossIATARoutes).toHaveBeenCalledTimes(1);
  });

  it("keeps the results that loaded when the other call fails", async () => {
    mockSearchKnownRoutes.mockResolvedValue([known(1, 2, 10)]);
    mockSearchCrossIATARoutes.mockRejectedValue(new Error("network"));
    renderTable();
    await screen.findByText("Find path");
    fillHashes();
    fireEvent.click(screen.getByText("Search"));

    expect(await screen.findByText("Route search failed")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
  });

  it("keeps paging for a multi-IATA region until its routes surface", async () => {
    const foreign: KnownRoute = { id: 1, iata: "CCC", hopCount: 1, hops: [], firstSeen: 1, lastSeen: 5, observationCount: 9 };
    const wanted: KnownRoute = { id: 2, iata: "AAA", hopCount: 2, hops: [], firstSeen: 1, lastSeen: 3, observationCount: 17 };
    // first global page has nothing from the region; the region's route sits on page two
    mockGetKnownRoutesPage.mockImplementation(({ cursor } = {}) =>
      Promise.resolve(
        cursor === undefined
          ? { items: [foreign], nextCursor: 5, hasMore: true }
          : { items: [wanted], nextCursor: null, hasMore: false },
      ),
    );

    renderTable({ regions: [], iatas: ["AAA", "BBB"] });

    // without fill-paging the table dead-ends on "No routes" — scroll can never fire on an empty list
    expect(await screen.findByText("17")).toBeInTheDocument();
    expect(mockGetKnownRoutesPage.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("shows a route's observation count in the list", async () => {
    const route: KnownRoute = {
      id: 7,
      iata: "AAA",
      hopCount: 2,
      hops: [],
      firstSeen: 1,
      lastSeen: 2,
      observationCount: 42,
    };
    mockGetKnownRoutesPage.mockResolvedValue({ items: [route], nextCursor: null, hasMore: false });

    renderTable();

    expect(await screen.findByText("42")).toBeInTheDocument();
  });
});

function LocationKeyProbe({ keys }: { keys: string[] }) {
  const location = useLocation();
  useEffect(() => {
    if (keys[keys.length - 1] !== location.key) keys.push(location.key);
  }, [location.key, keys]);
  return null;
}

function ChangeRegionButton() {
  const { setSelection } = useRegionSelection();
  return <button onClick={() => setSelection({ regions: [], iatas: ["AAA"] })}>Change region</button>;
}

it("does not navigate on a region change with no route selected", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const keys: string[] = [];
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RegionProvider defaultSelection={ALL_REGIONS}>
          <LocationKeyProbe keys={keys} />
          <ChangeRegionButton />
          <RouteTable />
        </RegionProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Find path");
  const initialKeyCount = keys.length;

  fireEvent.click(screen.getByRole("button", { name: "Change region" }));

  await waitFor(() => expect(mockGetKnownRoutesPage).toHaveBeenCalledWith(expect.objectContaining({ iata: "AAA" })));
  expect(keys.length).toBe(initialKeyCount);
});

it("preserves a shared saved route while a named region resolves", async () => {
  vi.mocked(getRegions).mockResolvedValue([{ id: 1, slug: "ontario", name: "Ontario" }]);
  vi.mocked(getRegion).mockResolvedValue({ id: 1, slug: "ontario", name: "Ontario", iatas: ["YOW"] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/?tab=Routes&regions=ontario&route=shared-key&routeIata=YOW"]}><RegionProvider defaultSelection={{ regions: ["ontario"], iatas: [] }}><RouteTable /></RegionProvider></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(getRegion).toHaveBeenCalledWith(1));
  await waitFor(() => expect(getKnownRoutesPage).toHaveBeenCalledWith(expect.objectContaining({ iata: "YOW" })));
  expect(screen.getByTestId("saved-route-selection")).toHaveTextContent("shared-key");
  client.clear();
});

it("translates the search bar, headers and empty state", async () => {
  await i18n.changeLanguage("fr");
  renderTable();
  expect(await screen.findByText("Chercher un trajet")).toBeInTheDocument();
  expect(screen.getByLabelText("Hash de départ")).toHaveAttribute("placeholder", "hash de départ");
  expect(screen.getByRole("button", { name: "Rechercher" })).toBeInTheDocument();
  expect(await screen.findByText("Aucun trajet")).toBeInTheDocument();
});

it("shows no routes for a region with no IATAs", async () => {
  vi.mocked(getRegions).mockResolvedValue([{ id: 2, slug: "empty", name: "Empty" }]);
  vi.mocked(getRegion).mockResolvedValue({ id: 2, slug: "empty", name: "Empty", iatas: [] });
  mockGetKnownRoutesPage.mockResolvedValue({ items: [{ id: 1, iata: "CCC", hopCount: 1, hops: [], firstSeen: 1, lastSeen: 5, observationCount: 9 }], nextCursor: null, hasMore: false });

  renderTable({ regions: ["empty"], iatas: [] });

  await waitFor(() => expect(getRegion).toHaveBeenCalled());
  expect(await screen.findByText("No routes")).toBeInTheDocument();
  expect(screen.queryByText("9")).not.toBeInTheDocument();
});
