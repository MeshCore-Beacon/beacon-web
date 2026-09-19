import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { CompareObserversTab } from "../../../src/features/stats/CompareObserversTab";
import { getObserverComparison, getObserversPage, getObserver } from "../../../src/api/client";

const region = { iatas: ["YVR"], regionKey: "YVR" };
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/api/client", () => ({
  getObserverComparison: vi.fn(), getObserversPage: vi.fn(), getObserver: vi.fn(),
}));
vi.mock("../../../src/features/stats/EChart", () => ({ EChart: () => null }));

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";
const query = `?tab=Analytics&statsTab=compare&compareA=${a}&compareB=${b}&compareSince=1000&compareUntil=2000`;
const counts = { observerA: a, observerB: b, since: 1000, until: 2000, totalPackets: 4, onlyA: 1, onlyB: 2, both: 1 };

function Location() { return <output aria-label="Current URL">{useLocation().search}</output>; }
function mount(url = "?statsTab=compare") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><CompareObserversTab /><Location /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  region.iatas = ["YVR"]; region.regionKey = "YVR";
  vi.mocked(getObserversPage).mockResolvedValue({ items: [
    { id: a, displayName: "Rooftop", iata: "YVR", status: "online" },
    { id: b, displayName: "Hilltop", iata: "YVR", status: "online" },
  ], hasMore: false, nextCursor: null });
  vi.mocked(getObserver).mockImplementation(async (id) => ({ id, displayName: id === a ? "Rooftop" : "Hilltop", iata: "YVR", status: "online", publicKey: "00", firstSeen: 0, lastSeen: 0, observationCount: 0, brokers: [] }));
  vi.mocked(getObserverComparison).mockResolvedValue(counts);
});

describe("observer comparison", () => {
  it("waits for Compare, sends explicit dates and region, and puts the selection in the URL", async () => {
    mount();
    await screen.findAllByRole("option", { name: /Rooftop/ });
    expect(getObserverComparison).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Observer A"), { target: { value: a } });
    fireEvent.change(screen.getByLabelText("Observer B"), { target: { value: b } });
    fireEvent.change(screen.getByLabelText("Start (local time)"), { target: { value: "2026-01-01T00:00" } });
    fireEvent.change(screen.getByLabelText("End (local time)"), { target: { value: "2026-02-15T00:00" } });
    expect(getObserverComparison).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    await waitFor(() => expect(getObserverComparison).toHaveBeenCalledWith(["YVR"], {
      observerA: a, observerB: b, since: new Date("2026-01-01T00:00").getTime(), until: new Date("2026-02-15T00:00").getTime(),
    }, expect.any(AbortSignal)));
    expect(screen.getByLabelText("Current URL").textContent).toContain(`compareA=${a}`);
  });

  it("restores a shared comparison and shows disjoint counts and union percentages", async () => {
    mount(query);
    const table = await screen.findByRole("table", { name: "Flood packet comparison" });
    expect(within(table).getByRole("row", { name: /Only A.*1.*25.0%/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Only B.*2.*50.0%/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Both.*1.*25.0%/ })).toBeInTheDocument();
    expect(screen.getByText(/Percentages use the union/)).toBeInTheDocument();
  });

  it("rejects equal observers without sending an expensive query", async () => {
    mount();
    await screen.findAllByRole("option", { name: /Rooftop/ });
    fireEvent.change(screen.getByLabelText("Observer A"), { target: { value: a } });
    fireEvent.change(screen.getByLabelText("Observer B"), { target: { value: a } });
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/different observers/);
    expect(getObserverComparison).not.toHaveBeenCalled();
  });

  it("renders an empty period without NaN percentages", async () => {
    vi.mocked(getObserverComparison).mockResolvedValue({ ...counts, totalPackets: 0, onlyA: 0, onlyB: 0, both: 0 });
    mount(query);
    expect(await screen.findByText(/No flood packets were reported/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("NaN");
  });

  it("searches the server beyond the initial observer page", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Search Observer A"), { target: { value: "Distant station" } });
    await waitFor(() => expect(getObserversPage).toHaveBeenCalledWith(["YVR"], { name: "Distant station", limit: 50 }));
  });

  it("keeps applied result labels when the draft selection changes", async () => {
    mount(query);
    await screen.findByRole("table", { name: "Flood packet comparison" });
    expect(await screen.findByText("A: Rooftop · B: Hilltop")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Observer A"), { target: { value: b } });
    expect(screen.getByText("A: Rooftop · B: Hilltop")).toBeInTheDocument();
    expect(getObserverComparison).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed shared dates without issuing a comparison", async () => {
    mount(query.replace("compareUntil=2000", "compareUntil=bad"));
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid or missing/);
    await screen.findAllByRole("option", { name: /Rooftop/ });
    expect(getObserverComparison).not.toHaveBeenCalled();
  });

  it("shows query failures and retries only when requested", async () => {
    vi.mocked(getObserverComparison).mockRejectedValueOnce(new Error("comparison timed out; try a shorter time period"));
    mount(query);
    expect(await screen.findByRole("alert")).toHaveTextContent(/shorter time period/);
    fireEvent.click(screen.getByRole("button", { name: "Retry comparison" }));
    await screen.findByRole("table", { name: "Flood packet comparison" });
    expect(getObserverComparison).toHaveBeenCalledTimes(2);
  });
});
