import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useLiveObserver } from "../../../src/features/stats/useLiveStats";
import type { WsManager } from "../../../src/api/ws-manager";
import type { WsObserverStatus } from "../../../src/types/ws";

describe("useLiveObserver", () => {
  it("refreshes the selected observer's telemetry, but not its heard activity, on a status event", () => {
    const qc = new QueryClient();
    qc.setQueryData(["observer-telemetry", "obs-1", "24h", "1h"], { range: "24h", interval: "1h", points: [] });
    qc.setQueryData(["observer-activity", "obs-1", "24h"], { range: "24h", interval: "15m", radio: null, payloadTypes: [], points: [] });
    const handlers: Array<(d: WsObserverStatus["data"]) => void> = [];
    const manager = {
      onObserverStatus: (h: (d: WsObserverStatus["data"]) => void) => {
        handlers.push(h);
        return () => {};
      },
    } as unknown as WsManager;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useLiveObserver(manager, "obs-1", "24h"), { wrapper });

    handlers.forEach((h) => h({ observerId: "obs-1" } as WsObserverStatus["data"]));

    expect(qc.getQueryState(["observer-telemetry", "obs-1", "24h", "1h"])?.isInvalidated).toBe(true);
    // heard activity changes with packets, not status, and refreshes on its own interval
    expect(qc.getQueryState(["observer-activity", "obs-1", "24h"])?.isInvalidated).toBe(false);
  });
});
