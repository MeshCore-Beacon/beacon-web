import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { App } from "../../../src/App";
import { mocks, resetMocks } from "./helpers";

vi.mock("../../../src/api/ws-manager", () => ({
  WsManager: class {
    constructor() {
      return new Proxy(this, { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => () => {}) });
    }
    connect() {}
    disconnect() {}
    updateSubscription() {}
  },
}));
vi.mock("../../../src/api/client", () => ({ getRegions: async () => [], getRegion: async () => ({ iatas: [] }), getScopes: async () => [] }));
vi.mock("../../../src/components/SplashScreen", () => ({ SplashScreen: () => null }));
vi.mock("../../../src/components/VersionGate", () => ({ VersionGate: () => null }));
vi.mock("../../../src/components/AppShell", () => ({
  AppShell: ({ children, onTabChange }: { children: ReactNode; onTabChange: (tab: string) => void }) => (
    <>
      <button onClick={() => onTabChange("Nodes")}>Nodes tab</button>
      {children}
    </>
  ),
}));
vi.mock("../../../src/features/packets/PacketList", () => ({ PacketList: () => <p>Packets tab content</p> }));
vi.mock("../../../src/features/nodes/NodeTable", () => ({ NodeTable: () => <p>Nodes tab content</p> }));
vi.mock("../../../src/features/account/AccountViews", () => ({ AccountViews: () => <p>Account view content</p> }));
vi.mock("../../../src/hooks/useFeatures", () => ({
  useFeatures: () => mocks.features,
  useFeaturesLoading: () => mocks.featuresLoading,
  useDisplayUnits: () => ({ temperature: "c", distance: "metric" }),
}));

beforeEach(() => {
  resetMocks();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe("App with account views", () => {
  it("shows the view instead of the tab when accounts are on", async () => {
    window.history.replaceState({}, "", "/?tab=Packets&view=signin");
    render(<App />);
    expect(await screen.findByText("Account view content")).toBeInTheDocument();
    expect(screen.queryByText("Packets tab content")).not.toBeInTheDocument();
  });

  it("ignores ?view= when accounts are off", async () => {
    mocks.features = { ...mocks.features, accounts: "off" };
    window.history.replaceState({}, "", "/?tab=Packets&view=signin");
    render(<App />);
    expect(await screen.findByText("Packets tab content")).toBeInTheDocument();
    expect(screen.queryByText("Account view content")).not.toBeInTheDocument();
  });

  it("holds the view area (no tab flash) while features load", async () => {
    mocks.featuresLoading = true;
    mocks.features = { ...mocks.features, accounts: "off" };
    window.history.replaceState({}, "", "/?tab=Packets&view=signin");
    render(<App />);
    expect(await screen.findByText("Account view content")).toBeInTheDocument();
    expect(screen.queryByText("Packets tab content")).not.toBeInTheDocument();
  });

  it("picking a tab closes the view and shows that tab", async () => {
    window.history.replaceState({}, "", "/?tab=Packets&view=verify&token=t");
    render(<App />);
    await screen.findByText("Account view content");
    fireEvent.click(screen.getByText("Nodes tab"));
    expect(await screen.findByText("Nodes tab content")).toBeInTheDocument();
    expect(window.location.search).not.toContain("view=");
    expect(window.location.search).not.toContain("token=");
  });
});
