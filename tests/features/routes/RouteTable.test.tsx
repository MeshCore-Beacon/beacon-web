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

function renderTable(selection = ALL_REGIONS) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  ]);
});

describe("RouteTable search", () => {
  it("searches within a single IATA when exactly one IATA is selected", async () => {
    renderTable();
    await screen.findByText("Find path");

    fireEvent.change(screen.getByPlaceholderText("from hash"), { target: { value: "aa11" } });
    fireEvent.change(screen.getByPlaceholderText("to hash"), { target: { value: "bb22" } });
    openIataPicker();
    checkIata("AAA");
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() => expect(mockSearchKnownRoutes).toHaveBeenCalledWith("AAA", "aa11", "bb22"));
    expect(mockSearchCrossIATARoutes).not.toHaveBeenCalled();
  });

  it("searches cross-IATA when two IATAs are selected, rendering the segmented chain", async () => {
    const cross: CrossIATARoute = {
      sourceSegment: [{ nodeId: "n1", hashBytes: "aa11", node: node("n1", "Src Node") }],
      crossHop: { fromNode: node("n1", "Src Node"), toNode: node("n2", "Dst Node"), fromIata: "AAA", toIata: "BBB", lastSeen: 2 },
      targetSegment: [{ nodeId: "n2", hashBytes: "bb22", node: node("n2", "Dst Node") }],
      totalHops: 3,
    };
    mockSearchCrossIATARoutes.mockImplementation((_f, fromIata, _t, toIata) =>
      Promise.resolve(fromIata === "AAA" && toIata === "BBB" ? [cross] : []),
    );

    renderTable();
    await screen.findByText("Find path");

    fireEvent.change(screen.getByPlaceholderText("from hash"), { target: { value: "aa11" } });
    fireEvent.change(screen.getByPlaceholderText("to hash"), { target: { value: "bb22" } });
    openIataPicker();
    checkIata("AAA");
    checkIata("BBB");
    fireEvent.click(screen.getByText("Search"));

    await waitFor(() =>
      expect(mockSearchCrossIATARoutes).toHaveBeenCalledWith("aa11", "AAA", "bb22", "BBB"),
    );
    expect(mockSearchKnownRoutes).not.toHaveBeenCalled();
    expect(await screen.findByText("Src Node")).toBeInTheDocument();
    expect(screen.getByText("Dst Node")).toBeInTheDocument();
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
