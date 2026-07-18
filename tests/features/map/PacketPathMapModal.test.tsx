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
  header: { payloadType: PayloadType.TEXT, routeType: 1 },
  observations: [
    { id: 1, observerId: "obs-alpha", observerName: "Alpha", iata: "YYZ", heardAt: 0, sourceBroker: "b", pathLength: { raw: "", hashSize: 1, hopCount: 2 }, resolvedPath: [hop("a", -79, 43), hop("b", -75, 45)], propagationTimeMs: 100 },
    { id: 2, observerId: "obs-bravo", observerName: "Bravo", iata: "YOW", heardAt: 0, sourceBroker: "b", pathLength: { raw: "", hashSize: 1, hopCount: 2 }, resolvedPath: [hop("c", -80, 44), hop("d", -76, 46)], propagationTimeMs: 480 },
  ],
} as unknown as PacketDetail;

describe("PacketPathMapModal", () => {
  it("lists All paths plus a row per observer and starts on All", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    expect(screen.getByText("All paths")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByTestId("mini-map")).toHaveTextContent("all");
  });

  it("isolates a path when its row is clicked", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Bravo"));
    expect(screen.getByTestId("mini-map")).toHaveTextContent("obs-bravo");
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

  it("pre-selects the observer from initialSelectedKey", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} initialSelectedKey="obs-bravo" />);
    expect(screen.getByTestId("mini-map")).toHaveTextContent("obs-bravo");
  });

  it("falls back to All when initialSelectedKey isn't a known path", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} initialSelectedKey="nope" />);
    expect(screen.getByTestId("mini-map")).toHaveTextContent("all");
  });

  it("renders a copy-link button", () => {
    render(<PacketPathMapModal detail={detail} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Copy path link" })).toBeInTheDocument();
  });
});
