import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/i18n";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WsManager } from "../../../src/api/ws-manager";
import { ObserverTable } from "../../../src/features/observers/ObserverTable";
import { getObserversPage } from "../../../src/api/client";
import type { ObserverSummary } from "../../../src/features/observers/types";

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }) }));
vi.mock("../../../src/hooks/useScopes", () => ({ useScopes: () => [] }));
vi.mock("../../../src/hooks/useWsHandlers", () => ({ useWsObserverStatusHandler: () => {} }));
vi.mock("../../../src/api/client", () => ({
  getObserversPage: vi.fn(),
  getBrokers: vi.fn(async () => []),
}));

const online = { id: "a", displayName: "Rooftop", iata: "YOW", status: "online" } as ObserverSummary;
const offline = { id: "b", displayName: "Hilltop", iata: "YOW", status: "offline" } as ObserverSummary;

function table(compact: boolean) {
  return <ObserverTable compact={compact} wsManager={{} as WsManager} selectedObserverId={compact ? "a" : null} onSelectObserver={() => {}} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getObserversPage).mockImplementation(async (_iatas, opts) => ({
    items: opts?.status === "offline" ? [offline] : [online, offline],
    hasMore: false,
    nextCursor: null,
  }));
});

describe("compact observer sidebar", () => {
  it("does not apply directory filters it has no controls for", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<QueryClientProvider client={client}>{table(false)}</QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: /Status/ }));
    fireEvent.click(screen.getByText("Offline"));
    await waitFor(() => expect(screen.queryByText("Rooftop")).not.toBeInTheDocument());

    rerender(<QueryClientProvider client={client}>{table(true)}</QueryClientProvider>);
    expect(await screen.findByText("Rooftop")).toBeInTheDocument();
    expect(screen.getByText("Hilltop")).toBeInTheDocument();
  });
});
