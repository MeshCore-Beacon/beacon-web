import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NodeTelemetry } from "../../../src/features/nodes/NodeTelemetry";
import { getObserver, getObserverTelemetry } from "../../../src/api/client";
import type { Observer } from "../../../src/features/observers/types";
import type { Node } from "../../../src/features/nodes/types";
vi.mock("../../../src/api/client", () => ({ getObserver: vi.fn(), getObserverTelemetry: vi.fn(), getCollectedNodeTelemetry: vi.fn().mockResolvedValue({ items: [], limit: 500 }) }));
const node = { publicKey: "ab".repeat(32), observerId: "observer-a" } as Node;
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NodeTelemetry node={node} /></QueryClientProvider>); }
describe("node telemetry identity", () => {
  it("rejects an observer with only a matching short prefix", async () => {
    vi.mocked(getObserverTelemetry).mockClear();
    vi.mocked(getObserver).mockResolvedValue({ publicKey: "ab" + "cd".repeat(31) } as Observer);
    const { container } = mount();
    await waitFor(() => expect(getObserver).toHaveBeenCalled());
    expect(getObserverTelemetry).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
  it("shows volts only from the exact full-key identity", async () => {
    vi.mocked(getObserver).mockResolvedValue({ publicKey: node.publicKey.toUpperCase() } as Observer);
    vi.mocked(getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [
      { t: Date.now()-3_600_000, batteryMv: 4000, uptimeSeconds: 100, noiseFloorDb: -110, airtimeRxSecs: null, airtimeTxSecs: null, queueLength: null, receiveErrors: null },
      { t: Date.now(), batteryMv: 3900, uptimeSeconds: 3700, noiseFloorDb: -109, airtimeRxSecs: null, airtimeTxSecs: null, queueLength: null, receiveErrors: null },
    ] });
    mount();
    await screen.findByText("3.90 V");
    expect(getObserverTelemetry).toHaveBeenCalledWith("observer-a", "24h", "1h");
  });
});
