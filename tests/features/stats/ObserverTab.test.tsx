import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ObserverTab } from "../../../src/features/stats/ObserverTab";
import { ApiError } from "../../../src/api/client";
import type { Observer } from "../../../src/features/observers/types";
import type { ObserverActivity, ObserverTelemetry, TelemetryPoint } from "../../../src/features/stats/types";
import type { WsManager } from "../../../src/api/ws-manager";

vi.mock("../../../src/hooks/useRegion", () => ({
  useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }),
}));

vi.mock("../../../src/features/stats/useStats", () => ({
  useTopObservers: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../../src/features/stats/useLiveStats", () => ({
  useLiveObserver: () => {},
}));

// ECharts needs a real canvas; the tab's behaviour is in which cards it renders, not the pixels
vi.mock("../../../src/features/stats/EChart", () => ({
  EChart: () => <div data-testid="chart" />,
}));

const telemetryResult = { data: undefined as ObserverTelemetry | undefined, isLoading: false, isError: false };
const activityResult = {
  data: undefined as ObserverActivity | undefined,
  isLoading: false,
  isPlaceholderData: false,
  isError: false,
  error: null as unknown,
  dataUpdatedAt: 0,
};

vi.mock("../../../src/features/stats/useTelemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/features/stats/useTelemetry")>()),
  useObserver: () => ({ data: observer }),
  useObserverTelemetry: () => telemetryResult,
  useObserverActivity: () => activityResult,
}));

const observer: Observer = {
  id: "obs-1",
  displayName: "Rooftop",
  iata: "YOW",
  status: "online",
  publicKey: "aa",
  firstSeen: 0,
  lastSeen: Date.now(),
  observationCount: 12,
  brokers: [],
  radioFreqMhz: 910.525,
  radioSf: 7,
  radioBwKhz: 62.5,
  radioCr: 5,
};

const H = 3_600_000;

const point = (t: number, p: Partial<TelemetryPoint>): TelemetryPoint => ({
  t,
  batteryMv: null,
  airtimeTxSecs: null,
  airtimeRxSecs: null,
  noiseFloorDb: null,
  uptimeSeconds: null,
  queueLength: null,
  receiveErrors: null,
  ...p,
});

const telemetry: ObserverTelemetry = {
  range: "24h",
  interval: "1h",
  points: [point(0, { airtimeRxSecs: 100, airtimeTxSecs: 10, batteryMv: 4100 }), point(H, { airtimeRxSecs: 154, airtimeTxSecs: 46, batteryMv: 4100 })],
};

const activity: ObserverActivity = {
  range: "24h",
  interval: "15m",
  radio: { freqMhz: 910.525, sf: 7, bwKhz: 62.5, cr: 5, preambleSymbols: 32 },
  payloadTypes: [{ payloadType: 4, payloadTypeName: "ADVERT", count: 9 }],
  points: [{ t: Date.now() - 900_000, observations: 9, airtimeMs: 2200, snrAvg: 6.1, snrMin: -1, rssiAvg: -95 }],
};

function renderTab() {
  const qc = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<ObserverTab range="24h" selectedObserverId="obs-1" onSelectObserver={() => {}} wsManager={{} as WsManager} />, { wrapper });
}

beforeEach(() => {
  telemetryResult.data = telemetry;
  telemetryResult.isLoading = false;
  telemetryResult.isError = false;
  activityResult.data = activity;
  activityResult.isLoading = false;
  activityResult.isPlaceholderData = false;
  activityResult.isError = false;
  activityResult.error = null;
  activityResult.dataUpdatedAt = Date.now();
});

describe("ObserverTab", () => {
  it("shows the latest reported RX and TX airtime as percent in the header", () => {
    renderTab();
    // +54 s RX and +36 s TX over the hour between the two reports
    expect(screen.getByText(/RX 1\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/TX 1%/)).toBeInTheDocument();
  });

  it("renders the heard charts when the server has activity for the observer", () => {
    renderTab();
    expect(screen.getByText(/channel busy/i)).toBeInTheDocument();
    expect(screen.getByText(/heard per 15 min/i)).toBeInTheDocument();
    expect(screen.getByText(/snr heard/i)).toBeInTheDocument();
    expect(screen.getByText(/payload types heard/i)).toBeInTheDocument();
  });

  it("names the radio settings the busy percent assumes, in the same form as the header", () => {
    renderTab();
    expect(screen.getAllByText("910.525 MHz · SF7 · 62.5 kHz · CR 4/5")).toHaveLength(2);
  });

  it("hides the heard charts entirely when the server does not have the endpoint", () => {
    activityResult.data = undefined;
    activityResult.isError = true;
    activityResult.error = new ApiError(404, "not_found", "no route");
    renderTab();
    expect(screen.queryByText(/channel busy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/heard/i)).not.toBeInTheDocument();
  });

  it("leaves the header airtime stat out when the observer reports no telemetry", () => {
    const zero = point(0, { airtimeRxSecs: 0, airtimeTxSecs: 0 });
    telemetryResult.data = { ...telemetry, points: [zero, { ...zero, t: H }] };
    renderTab();
    expect(screen.queryByText(/RX 0%/)).not.toBeInTheDocument();
  });

  it("shows the heard cards as loading while the previous selection's data is only a placeholder", () => {
    activityResult.data = { ...activity, points: [] };
    activityResult.isPlaceholderData = true;
    activityResult.dataUpdatedAt = 0;
    renderTab();
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    expect(screen.queryByText(/no packets heard/i)).not.toBeInTheDocument();
    expect(screen.queryByText("910.525 MHz · SF7 · 62.5 kHz · CR 4/5")).toBeInTheDocument(); // header only
  });

  it("shows one empty card instead of flat charts when nothing was heard", () => {
    activityResult.data = { ...activity, payloadTypes: [], points: [] };
    renderTab();
    expect(screen.getByText(/no packets heard/i)).toBeInTheDocument();
    expect(screen.queryByText(/channel busy/i)).not.toBeInTheDocument();
  });
});
