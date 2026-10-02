import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PacketDetail } from "../../../src/types/api";
import { PayloadType } from "../../../src/types/enums";

// stub the WebGL map; the modal's own logic is the selector + selection state
vi.mock("../../../src/features/map/PacketPathMap", () => ({
  PacketPathMap: ({ selectedKey }: { selectedKey: string | null }) => (
    <div data-testid="mini-map">{selectedKey ?? "all"}</div>
  ),
}));

import { PacketPathMapModal } from "../../../src/features/map/PacketPathMapModal";

// this Node/jsdom combo leaves window.localStorage unavailable; stub it so the modal's
// style-preference read doesn't throw.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

const hop = (id: string, lng: number, lat: number) => ({ confidence: "high" as const, nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] });
const detail = {
  packetHash: "aabbccdd",
  header: { payloadType: PayloadType.TEXT, routeType: 1 },
  observations: [
    { id: 1, observerId: "obs-alpha", observerName: "Alpha", iata: "YYZ", heardAt: 0, sourceBroker: "b", pathLength: { raw: "", hashSize: 1, hopCount: 2 }, resolvedPath: [hop("a", -79, 43), hop("b", -75, 45)], propagationTimeMs: 100 },
    { id: 2, observerId: "obs-bravo", observerName: "Bravo", iata: "YOW", heardAt: 0, sourceBroker: "b", pathLength: { raw: "", hashSize: 1, hopCount: 2 }, resolvedPath: [hop("c", -80, 44), hop("d", -76, 46)], propagationTimeMs: 480 },
  ],
} as unknown as PacketDetail;

describe("PacketPathMapModal", () => {
  it("lists All paths plus a row per observer and starts on All", async () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    expect(screen.getByText("All paths")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("all");
  });

  it("isolates a path when its row is clicked", async () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Bravo"));
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("obs-bravo");
  });

  it("shows each observer's propagation", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    expect(screen.getByText("0.100s")).toBeInTheDocument(); // formatPropagation(100)
    expect(screen.getByText("0.480s")).toBeInTheDocument();
  });

  it("closes from the close button", () => {
    const onClose = vi.fn();
    render(<PacketPathMapModal detail={detail} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close path map"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pre-selects the observer from initialSelectedKey", async () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} initialSelectedKey="obs-bravo" />);
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("obs-bravo");
  });

  it("does not silently substitute all paths for an unavailable selected path", async () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} initialSelectedKey="nope" />);
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("nope");
    expect(screen.getByRole("status")).toHaveTextContent("This path can't be mapped");
    fireEvent.click(screen.getByText("All paths"));
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("all");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders a copy-link button", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Copy path link" })).toBeInTheDocument();
  });

  describe("copy path link", () => {
    const writeText = vi.fn();

    beforeEach(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
      writeText.mockClear();
    });

    afterEach(() => window.history.replaceState({}, "", "/"));

    it("copies the selected path and strips the analyzer", () => {
      window.history.replaceState({}, "", "/?tab=Packets&hash=aabb&analyze=1");
      render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
      fireEvent.click(screen.getByText("Bravo"));

      fireEvent.click(screen.getByRole("button", { name: "Copy path link" }));

      const copied = new URL(writeText.mock.calls[0]![0] as string);
      expect(copied.searchParams.get("tab")).toBe("Packets");
      expect(copied.searchParams.get("hash")).toBe(detail.packetHash);
      expect(copied.searchParams.get("path")).toBe("obs-bravo");
      expect(copied.searchParams.has("analyze")).toBe(false); // path and analyze are exclusive
    });

    it("copies path=all when nothing is isolated", () => {
      render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy path link" }));
      expect(new URL(writeText.mock.calls[0]![0] as string).searchParams.get("path")).toBe("all");
    });
  });
});
