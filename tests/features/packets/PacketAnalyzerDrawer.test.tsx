import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PacketAnalyzerDrawer } from "../../../src/features/packets/PacketAnalyzerDrawer";
import type { PacketDetail } from "../../../src/types/api";
import { PayloadType, RouteType } from "../../../src/types/enums";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

describe("PacketAnalyzerDrawer close", () => {
  it("removes ?hash from the URL and calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=abc123"]}>
        <PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Close analyzer"));

    expect(onClose).toHaveBeenCalledOnce();
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).not.toContain("hash=");
    expect(search).toContain("tab=Packets"); // other params survive
  });
});

const hop = (id: string, lng: number, lat: number) => ({ confidence: "high" as const, nodes: [{ id, publicKey: "pk", longitude: lng, latitude: lat }] });

function makeDetail(resolvedPath: unknown[]): PacketDetail {
  return {
    packetHash: "abcdef12",
    header: { raw: "12", routeType: RouteType.FLOOD, routeTypeName: "FLOOD", payloadType: PayloadType.TEXT, payloadTypeName: "TXT_MSG", payloadVersion: 1 },
    firstHeardAt: 0, lastHeardAt: 0, firstToLastMs: 0, observationCount: 1,
    rawPayload: "", decrypted: false,
    observations: [{ id: 1, observerId: "obs12345", iata: "YYZ", heardAt: 0, sourceBroker: "b", pathLength: { raw: "02", hashSize: 1, hopCount: resolvedPath.length }, resolvedPath }],
  } as unknown as PacketDetail;
}

describe("PacketAnalyzerDrawer view-path button", () => {
  it("enables the button and calls onViewPath when a path is drawable", () => {
    const onViewPath = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?tab=Packets"]}>
        <PacketAnalyzerDrawer detail={makeDetail([hop("a", -79, 43), hop("b", -75, 45)])} selectedObservationId={null} onClose={() => {}} onViewPath={onViewPath} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole("button", { name: /view path on map/i });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(onViewPath).toHaveBeenCalledOnce();
  });

  it("disables the button when no path is drawable", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=Packets"]}>
        <PacketAnalyzerDrawer detail={makeDetail([hop("a", -79, 43)])} selectedObservationId={null} onClose={() => {}} onViewPath={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /view path on map/i })).toBeDisabled();
  });
});
