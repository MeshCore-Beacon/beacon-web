import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AtlasCard } from "../../../src/features/atlas/AtlasCard";
import { targetForPin } from "../../../src/features/atlas/atlas";
import * as api from "../../../src/api/client";
import { alerts, me } from "../../../src/api/auth";
import { Probe } from "../account/Probe";
import { authError, searchOf, user } from "../account/helpers";
import type { AlertChannels, AlertRule, AlertTarget, AlertsResponse } from "../../../src/features/account/types";
import type { Node } from "../../../src/features/nodes/types";
import type { Observer } from "../../../src/features/observers/types";

vi.mock("../../../src/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/api/client")>()),
  getNode: vi.fn(),
  getNodeActivity: vi.fn(),
  getNodesPage: vi.fn(),
  getPacketDetail: vi.fn(),
  getObserver: vi.fn(),
  getObserverActivity: vi.fn(),
  getObserverTelemetry: vi.fn(),
  getServerInfo: vi.fn(),
  getNodeTelemetry: vi.fn(),
  getNodePolling: vi.fn(),
}));
vi.mock("../../../src/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/api/auth")>();
  return { ...actual, me: { ...actual.me, get: vi.fn() }, alerts: { get: vi.fn(), putRule: vi.fn(), deleteRule: vi.fn(), putChannels: vi.fn() } };
});

const KEY = "ab".repeat(32);
const pin = { kind: "node" as const, id: "11111111-1111-4111-8111-111111111111", publicKey: KEY, name: "Hilltop" };
const node = { ...pin, nodeType: 2, nodeTypeName: "REPEATER", knownNeighborCount: 4, stale: false, lastSeen: Date.now(), iatas: [], lat: null, lng: null } as Node;
const observerId = "33333333-3333-4333-8333-333333333333";
const observerPin = { kind: "observer" as const, observerId, name: "Ridge listener" };
const observer = { id: observerId, displayName: "Ridge listener", status: "online", lastStatusAt: Date.now(), iata: "YKF", publicKey: "cd".repeat(32), firstSeen: 1, lastSeen: 2, observationCount: 5, brokers: [] } as unknown as Observer;
const handlers = {
  onViewNode: vi.fn(), onViewObserver: vi.fn(), onAnalyzePacket: vi.fn(), onViewChange: vi.fn(), onRemove: vi.fn(),
  onResolved: vi.fn(), onUpgrade: vi.fn(), onTilesChange: vi.fn(), onTelemetryTilesChange: vi.fn(), onPinView: vi.fn(),
};
const info = (alertsOn: boolean) => ({ features: { polling: false, accounts: "local", telemetryRequests: false, alerts: alertsOn, alertChannels: { email: true, push: true } } }) as never;

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "u1", kind: "battery_low", threshold: 3500, thresholdHigh: null, enabled: true,
  state: "ok", stateChangedAt: 1_700_000_000_000, lastSentAt: null, ...over,
});
const target = (over: Partial<AlertTarget> = {}): AlertTarget => ({
  id: pin.id, kind: "node", publicKey: KEY.toUpperCase(), name: "Hilltop", polled: true,
  available: ["gone_quiet", "back_online", "battery_low"],
  unavailable: { temperature: "This repeater does not report a temperature." }, unavailableCodes: { temperature: "no_data" }, rules: [], ...over,
});
const other = target({ id: "99999999-9999-4999-8999-999999999999", publicKey: "ef".repeat(32), name: "Other", available: ["gone_quiet"], unavailable: {}, unavailableCodes: {}, rules: [rule({ state: "firing" })] });
const watcher = target({ id: observerId, kind: "observer", publicKey: "cd".repeat(32), name: "Ridge listener", available: ["observer_offline"], unavailable: {}, unavailableCodes: {} });
const channels = (email: Partial<AlertChannels["email"]> = {}, push: Partial<AlertChannels["push"]> = {}): AlertChannels => ({
  email: { available: true, enabled: true, reason: "", ...email },
  push: { available: true, enabled: false, hasDevice: false, ...push },
});
const response = (over: Partial<AlertsResponse> = {}): AlertsResponse => ({ channels: channels(), targets: [other, target()], ...over });

let client: QueryClient;
function mount(overrides: Partial<Parameters<typeof AtlasCard>[0]> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/?tab=Atlas"]}>
        <AtlasCard pin={pin} range="24h" active view="analytics" home="analytics" handle={{}} {...handlers} {...overrides} />
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const bell = () => screen.findByRole("button", { name: /^Alerts/ });
const signedIn = (data: AlertsResponse = response()) => {
  vi.mocked(me.get).mockResolvedValue({ user });
  vi.mocked(alerts.get).mockResolvedValue(data);
};
async function openDialog(name = "Hilltop") {
  fireEvent.click(await bell());
  return within(await screen.findByRole("dialog", { name: `Alerts for ${name}` }));
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  vi.mocked(api.getNode).mockResolvedValue(node);
  vi.mocked(api.getNodeActivity).mockResolvedValue({ windowStart: 0, windowEnd: 0, generatedAt: 0, range: "24h", summary: { observations: 0, snrAvg: null, rssiAvg: null, hopAvg: null }, points: [], latest: null } as never);
  vi.mocked(api.getObserver).mockResolvedValue(observer);
  vi.mocked(api.getObserverActivity).mockResolvedValue({ range: "24h", interval: "1h", radio: null, payloadTypes: [], points: [] } as never);
  vi.mocked(api.getObserverTelemetry).mockResolvedValue({ range: "24h", interval: "1h", points: [] } as never);
  vi.mocked(api.getNodesPage).mockResolvedValue({ items: [], hasMore: false } as never);
  vi.mocked(api.getServerInfo).mockResolvedValue(info(true));
  vi.mocked(me.get).mockRejectedValue(authError("not_signed_in", 401));
  vi.mocked(alerts.putRule).mockResolvedValue(rule());
});
afterEach(() => client.clear());

describe("Atlas card alert bell", () => {
  it("is absent when the server has alerts off", async () => {
    vi.mocked(api.getServerInfo).mockResolvedValue(info(false));
    signedIn();
    mount();
    await screen.findByRole("button", { name: "Hilltop" });
    await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /^Alerts/ })).not.toBeInTheDocument();
    expect(alerts.get).not.toHaveBeenCalled();
  });

  it("sits before the pin, remove and drag buttons", async () => {
    mount();
    const actions = (await bell()).closest("[data-card-actions]") as HTMLElement;
    expect(within(actions).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Alerts", "Open on this tab", "Remove", "Drag to reorder, or use the arrow keys"]);
  });

  it("is an outline when no rule is on", async () => {
    signedIn(response({ targets: [other, target({ rules: [rule({ enabled: false, state: "firing" })] })] }));
    mount();
    await waitFor(() => expect(alerts.get).toHaveBeenCalled());
    const button = await bell();
    expect(button).toHaveAccessibleName("Alerts");
    expect(button).toHaveAttribute("data-alert-state", "off");
    expect(button.querySelector("svg")).toHaveAttribute("fill", "none");
  });

  it("is filled and counts the rules that are on", async () => {
    signedIn(response({ targets: [other, target({ rules: [rule(), rule({ id: "u2", kind: "gone_quiet", threshold: 24 }), rule({ id: "u3", kind: "back_online", enabled: false })] })] }));
    mount();
    const button = await screen.findByRole("button", { name: "Alerts: 2 on" });
    expect(button).toHaveAttribute("data-alert-state", "on");
    expect(button).toHaveClass("bg-primary/10");
    expect(button.querySelector("svg")).toHaveAttribute("fill", "currentColor");
  });

  it("turns to danger while an enabled rule is firing", async () => {
    signedIn(response({ targets: [target({ rules: [rule({ state: "firing" }), rule({ id: "u2", kind: "gone_quiet", threshold: 24 })] })] }));
    mount();
    const button = await screen.findByRole("button", { name: "Alerts: 1 firing" });
    expect(button).toHaveAttribute("data-alert-state", "firing");
    expect(button).toHaveClass("text-danger");
    expect(button).not.toHaveClass("text-primary");
  });

  it("asks a signed-out visitor to sign in and opens the sign-in view", async () => {
    mount();
    const dialog = await openDialog();
    expect(dialog.getByText("Sign in to set alerts for this radio.")).toBeInTheDocument();
    expect(dialog.queryByRole("switch")).not.toBeInTheDocument();
    expect(alerts.get).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(searchOf(screen.getByTestId("search")).get("view")).toBe("signin"));
    expect(searchOf(screen.getByTestId("search")).get("tab")).toBe("Atlas");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists this radio's rules, not another target's, and saves through the shared mutation", async () => {
    signedIn();
    mount();
    const dialog = await openDialog();
    expect(dialog.getAllByRole("switch")).toHaveLength(3);
    expect(dialog.getByTestId("alert-battery_low")).toBeInTheDocument();
    expect(dialog.getByText("Temperature").closest("li")).toHaveClass("opacity-60");
    expect(dialog.queryByText(/Alerting since/)).not.toBeInTheDocument();
    fireEvent.click(within(dialog.getByTestId("alert-gone_quiet")).getByRole("switch"));
    await waitFor(() => expect(alerts.putRule).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: "node", publicKey: KEY.toUpperCase() }, kind: "gone_quiet", enabled: true })));
    await waitFor(() => expect(alerts.get).toHaveBeenCalledTimes(2));
  });

  it("matches an observer pin to the observer target by id", async () => {
    signedIn(response({ targets: [target(), watcher] }));
    mount({ pin: observerPin, view: "observer", home: "observer" });
    const dialog = await openDialog("Ridge listener");
    expect(dialog.getAllByRole("switch")).toHaveLength(1);
    expect(dialog.getByTestId("alert-observer_offline")).toBeInTheDocument();
  });

  it("closes on Escape and from its close button", async () => {
    signedIn();
    mount();
    await openDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const dialog = await openDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape when focus has dropped to the body", async () => {
    signedIn();
    mount();
    await openDialog();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links to the profile's alerts for channels, plainly when one reaches the user", async () => {
    signedIn();
    mount();
    const dialog = await openDialog();
    expect(dialog.getByText(/Email and push are set in your profile/)).not.toHaveClass("text-warn");
    fireEvent.click(dialog.getByRole("button", { name: "Open alert settings" }));
    await waitFor(() => expect(searchOf(screen.getByTestId("search")).get("view")).toBe("profile"));
    expect(searchOf(screen.getByTestId("search")).get("section")).toBe("alerts");
  });

  it("warns when no channel reaches the user: email off and push on without a device", async () => {
    signedIn(response({ channels: channels({ enabled: false }, { enabled: true, hasDevice: false }) }));
    mount();
    const dialog = await openDialog();
    expect(dialog.getByText(/will not be delivered until you turn on email or push/)).toHaveClass("text-warn");
    expect(dialog.getByRole("button", { name: "Open alert settings" })).toBeInTheDocument();
  });

  it("shows the plain link for a server that sends no channels", async () => {
    signedIn({ targets: [target()] });
    mount();
    const dialog = await openDialog();
    expect(dialog.getByText(/Email and push are set in your profile/)).toBeInTheDocument();
    expect(dialog.queryByText(/will not be delivered/)).not.toBeInTheDocument();
  });

  it("says so when the pin has no target yet", async () => {
    signedIn(response({ targets: [other] }));
    mount();
    const dialog = await openDialog();
    expect(dialog.getByText(/not available for this radio yet/)).toBeInTheDocument();
    expect(dialog.queryByRole("switch")).not.toBeInTheDocument();
    expect(await bell()).toHaveAttribute("data-alert-state", "off");
  });

  it("shows the error when the alerts request fails", async () => {
    vi.mocked(me.get).mockResolvedValue({ user });
    vi.mocked(alerts.get).mockRejectedValue(authError("forbidden", 403));
    mount();
    const dialog = await openDialog();
    expect(await dialog.findByRole("alert")).toBeInTheDocument();
    expect(dialog.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("shares one alerts request between cards", async () => {
    signedIn(response({ targets: [target(), watcher] }));
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AtlasCard pin={pin} range="24h" active view="analytics" home="analytics" handle={{}} {...handlers} />
          <AtlasCard pin={observerPin} range="24h" active view="observer" home="observer" handle={{}} {...handlers} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Alerts/ })).toHaveLength(2));
    await waitFor(() => expect(alerts.get).toHaveBeenCalled());
    expect(alerts.get).toHaveBeenCalledTimes(1);
  });
});

describe("targetForPin", () => {
  it("matches a node by key whatever the case, and never across kinds", () => {
    expect(targetForPin([other, target()], pin)?.name).toBe("Hilltop");
    expect(targetForPin([target({ kind: "observer" })], pin)).toBeUndefined();
    expect(targetForPin(undefined, pin)).toBeUndefined();
  });

  it("matches an observer by id, or by its loaded key when the pin holds a stand-in id", () => {
    expect(targetForPin([target(), watcher], observerPin)?.name).toBe("Ridge listener");
    const gone = { ...watcher, id: null };
    expect(targetForPin([gone], observerPin)).toBeUndefined();
    expect(targetForPin([gone], observerPin, "CD".repeat(32))?.name).toBe("Ridge listener");
  });
});
