import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import i18n from "../../../src/i18n";
import { MemoryRouter, useLocation } from "react-router-dom";
import { PacketAnalyzerDrawer } from "../../../src/features/packets/PacketAnalyzerDrawer";
import type { PacketDetail } from "../../../src/types/api";
import { PayloadType, RouteType } from "../../../src/types/enums";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="search">{location.search}</div>;
}

describe("PacketAnalyzerDrawer close", () => {
  it("removes ?analyze but keeps ?hash, and calls onClose", () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=abc123&analyze=1"]}>
        <PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={onClose} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText("Close analyzer"));

    expect(onClose).toHaveBeenCalledOnce();
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).not.toContain("analyze=");
    expect(search).toContain("hash=abc123"); // row stays expanded
    expect(search).toContain("tab=Packets"); // other params survive
  });
});

describe("packet reception evidence", () => {
  const reports = () => {
    const d = makeDetail([hop("a", -79, 43), hop("b", -75, 45)]);
    d.observations[0].pathBytes = "aabb";
    d.observations[0].observerName = "Alpha";
    d.observations.push({ ...d.observations[0], id: 2, observerId: "beta", observerName: "Beta" });
    return d;
  };
  it("restores a shared report and targets its observer and map", () => {
    const onViewObserver = vi.fn(); const onViewPath = vi.fn();
    render(<MemoryRouter initialEntries={["/?tab=Packets&hash=abcdef12&analyze=1&observation=2&q=keep"]}><PacketAnalyzerDrawer detail={reports()} selectedObservationId={null} onClose={() => {}} onViewObserver={onViewObserver} onViewPath={onViewPath} /><LocationProbe /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "Reception evidence" });
    expect(within(section).getByText("Path 1").closest("details")).toHaveAttribute("open");
    const beta = within(section).getByText(/Beta/).closest("li")!;
    expect(within(beta).getByRole("button", { name: "Inspect report" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(beta).getByRole("button", { name: "Inspect observer" })); expect(onViewObserver).toHaveBeenCalledWith("beta");
    fireEvent.click(within(beta).getByRole("button", { name: "Map report" })); expect(onViewPath).toHaveBeenCalledWith("beta");
    expect(screen.getByTestId("search")).toHaveTextContent("observation=2"); expect(screen.getByTestId("search")).toHaveTextContent("q=keep");
  });
  it("reports an expired selection without quietly showing another report", () => {
    render(<MemoryRouter initialEntries={["/?tab=Packets&hash=abcdef12&analyze=1&observation=99"]}><PacketAnalyzerDrawer detail={reports()} selectedObservationId={1} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Selected report is unavailable");
    expect(screen.queryByText("Raw Packet")).not.toBeInTheDocument();
  });
  it("explains TRACE and missing-report semantics in French", async () => {
    const d = reports(); d.header.payloadType = PayloadType.TRACE; d.observations = [];
    await i18n.changeLanguage("fr");
    render(<MemoryRouter><PacketAnalyzerDrawer detail={d} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Rapports de réception" })).toHaveTextContent("itinéraire prévu");
    expect(screen.getByText("Aucun rapport conservé pour ce paquet.")).toBeInTheDocument();
  });
  it("keeps a later selected path visible while bounding the initial list", () => {
    const d = reports();
    d.observations = Array.from({ length: 12 }, (_, i) => ({ ...d.observations[0], id: i + 1, observerId: `observer-${i}`, pathBytes: i.toString(16).padStart(4, "0") }));
    render(<MemoryRouter initialEntries={["/?hash=abcdef12&analyze=1&observation=12"]}><PacketAnalyzerDrawer detail={d} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "Reception evidence" });
    expect(within(section).getByText("Path 12").closest("details")).toHaveAttribute("open");
    expect(within(section).queryByText("Path 4")).not.toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Show all 12 path groups" }));
    expect(within(section).getByText("Path 4")).toBeInTheDocument();
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

describe("PacketAnalyzerDrawer copy link", () => {
  const writeText = vi.fn();

  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, writable: true, configurable: true });
    writeText.mockClear();
  });

  afterEach(() => window.history.replaceState({}, "", "/"));

  it("copies a link that reopens the drawer over the expanded row", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=Packets&hash=abcdef12&analyze=1"]}>
        <PacketAnalyzerDrawer detail={makeDetail([])} selectedObservationId={null} onClose={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy packet link" }));

    const copied = new URL(writeText.mock.calls[0]![0] as string);
    expect(copied.searchParams.get("tab")).toBe("Packets");
    expect(copied.searchParams.get("hash")).toBe("abcdef12");
    expect(copied.searchParams.get("analyze")).toBe("1"); // the drawer is part of the shared state
  });
});

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

describe("PacketAnalyzerDrawer TRACE path data", () => {
  // After beacon-server's trace-path fix (7a58a07) a TRACE observation's pathBytes are the trace's
  // own path hashes (with matching hashSize/hopCount and a real resolvedPath), not raw SNR bytes —
  // so it must render as resolved Path Data, not under the old "Path SNR Data" label.
  function traceDetail(): PacketDetail {
    return {
      packetHash: "abcdef12",
      header: { raw: "12", routeType: RouteType.FLOOD, routeTypeName: "FLOOD", payloadType: PayloadType.TRACE, payloadTypeName: "TRACE", payloadVersion: 1 },
      firstHeardAt: 0, lastHeardAt: 0, firstToLastMs: 0, observationCount: 1,
      rawPayload: "", decrypted: false,
      observations: [{
        id: 1, observerId: "obs12345", iata: "YYZ", heardAt: 0, sourceBroker: "b",
        pathLength: { raw: "02", hashSize: 1, hopCount: 2 },
        pathBytes: "abcd",
        resolvedPath: [hop("a", -79, 43), hop("b", -75, 45)],
      }],
    } as unknown as PacketDetail;
  }

  it("renders TRACE path bytes as resolved Path Data, not raw 'Path SNR Data'", () => {
    render(
      <MemoryRouter initialEntries={["/?tab=Packets"]}>
        <PacketAnalyzerDrawer detail={traceDetail()} selectedObservationId={null} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Path SNR Data")).not.toBeInTheDocument();
    expect(screen.getByText("Path Data")).toBeInTheDocument();
    // the first trace hash renders as a resolved hop block, tinted green for high confidence
    expect(screen.getAllByText("AB").some((el) => el.className.includes("text-green"))).toBe(true);
  });
});
