import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ObserverTab } from "../../../src/features/stats/ObserverTab";
import i18n from "../../../src/i18n";
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
  points: [
    point(0, { airtimeRxSecs: 100, airtimeTxSecs: 10, batteryMv: 4100 }),
    point(H, { airtimeRxSecs: 154, airtimeTxSecs: 46, batteryMv: 4100 }),
  ],
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
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(
    <ObserverTab range="24h" selectedObserverId="obs-1" onSelectObserver={() => {}} wsManager={{} as WsManager} />,
    { wrapper },
  );
}

beforeEach(() => {
  observer.brokers = [];
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
  it("shows the latest reported RX and TX airtime as percent beside the airtime chart", () => {
    renderTab();
    // +54 s RX and +36 s TX over the hour between the two reports
    expect(screen.getByText(/RX 1\.5%/)).toBeInTheDocument();
    expect(screen.getByText(/TX 1%/)).toBeInTheDocument();
  });

  it("renders the heard charts when the server has activity for the observer", () => {
    renderTab();
    expect(screen.getByText(/channel busy/i)).toBeInTheDocument();
    expect(screen.getByText(/recorded packets per 15 min/i)).toBeInTheDocument();
    expect(screen.getByText(/received signal/i)).toBeInTheDocument();
    expect(screen.getByText(/packet-type mix/i)).toBeInTheDocument();
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

  it("keeps the last successful activity visible after a failed poll", () => {
    activityResult.isError = true;
    activityResult.error = new Error("temporary failure");
    renderTab();
    expect(screen.getByText(/recorded packets per 15 min/i)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows one empty card instead of flat charts when nothing was heard", () => {
    activityResult.data = { ...activity, payloadTypes: [], points: [] };
    renderTab();
    expect(screen.getByText(/no packets recorded/i)).toBeInTheDocument();
    expect(screen.queryByText(/channel busy/i)).not.toBeInTheDocument();
  });
});

describe("Observer dashboard hierarchy", () => {
  it("uses period metrics rather than the legacy presence counter", () => {
    activityResult.data = {
      ...activity,
      windowStart: Date.now() - 86400000,
      windowEnd: Date.now(),
      generatedAt: Date.now(),
      source: "raw",
      summary: {
        recordedPackets: 9,
        lastCompleteHour: 2,
        lastCompleteHourStart: Date.now() - 7200000,
        lastCompleteHourEnd: Date.now() - 3600000,
        latestRecordedAt: Date.now() - 60000,
      },
    };
    renderTab();
    const cards = screen.getByRole("list", { name: "Observer metrics" });
    expect(within(cards).getByText("9")).toBeInTheDocument();
    expect(within(cards).getAllByRole("listitem")).toHaveLength(6);
    expect(within(cards).queryByText("12")).not.toBeInTheDocument();
    expect(
      screen.getByText("Recorded packets per 15 min").compareDocumentPosition(screen.getByText(/Airtime TX/)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it("does not invent zero packet metrics on an older server", () => {
    renderTab();
    expect(screen.getByText(/Packet summary unavailable/)).toBeInTheDocument();
  });
  it("provides French monitoring labels", async () => {
    await i18n.changeLanguage("fr");
    renderTab();
    expect(screen.getByText("Paquets enregistrés")).toBeInTheDocument();
    expect(screen.getByText("Détails de l’appareil")).toBeInTheDocument();
  });
});

it("keeps packet metrics without the removed traffic text badge", () => {
  const now = Date.now();
  observer.brokers = [{ name: "one", lastSeenAt: now, lastPacketAt: now }];
  activityResult.data = {
    ...activity,
    summary: {
      recordedPackets: 9,
      lastCompleteHour: 2,
      lastCompleteHourStart: now - 7200000,
      lastCompleteHourEnd: now - 3600000,
      latestRecordedAt: now - 3600000,
    },
  };
  renderTab();
  expect(screen.queryByText("Recent packet traffic")).not.toBeInTheDocument();
  expect(within(screen.getByRole("list", { name: "Observer metrics" })).getByText("9")).toBeInTheDocument();
});

it("omits the duplicate observer picker and marked explanatory sections", () => {
  renderTab();
  expect(screen.queryByRole("searchbox", { name: "Find an observer" })).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox", { name: "Choose an observer" })).not.toBeInTheDocument();
  expect(screen.queryByText("Exact activity values")).not.toBeInTheDocument();
  expect(screen.queryByText(/History for this observer across all received regions/)).not.toBeInTheDocument();
});
