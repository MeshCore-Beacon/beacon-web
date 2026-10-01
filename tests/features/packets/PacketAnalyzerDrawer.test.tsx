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
  it("leaves the originating packet URL unchanged when used in an overlay", () => {
    const onClose = vi.fn();
    render(<MemoryRouter initialEntries={["/?tab=Packets&hash=origin&analyze=1&observation=7"]}><PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={onClose} syncUrl={false} /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText("Close analyzer"));
    expect(screen.getByTestId("search")).toHaveTextContent("hash=origin&analyze=1&observation=7");
    expect(onClose).toHaveBeenCalledOnce();
  });
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
    const section = screen.getByRole("region", { name: "Observations" });
    expect(within(section).getByText("Path 1").closest("details")).toHaveAttribute("open");
    const beta = within(section).getByText(/Beta/).closest("li")!;
    expect(within(beta).getByRole("button", { name: /Select observation.*Beta/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(beta).getByText("SNR")).toBeInTheDocument();
    expect(screen.queryByText(/^Observations \(/)).not.toBeInTheDocument();
    for (const name of ["Inspect observer", "Map path"]) expect(within(beta).getByRole("button", { name })).toHaveClass("border", "border-border", "text-primary");
    fireEvent.click(within(beta).getByRole("button", { name: "Inspect observer" })); expect(onViewObserver).toHaveBeenCalledWith("beta", 2);
    fireEvent.click(within(beta).getByRole("button", { name: "Map path" })); expect(onViewPath).toHaveBeenCalledWith("beta");
    expect(screen.getByTestId("search")).toHaveTextContent("observation=2"); expect(screen.getByTestId("search")).toHaveTextContent("q=keep");
  });
  it("collapses the observations list unless a report was picked", () => {
    render(<MemoryRouter><PacketAnalyzerDrawer detail={reports()} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "Observations" });
    const toggle = within(section).getByRole("button", { name: "Observations" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(section).toHaveTextContent("Heard by 2 observers");
    expect(within(section).queryByText("Path 1")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getByText("Path 1")).toBeInTheDocument();
  });
  it("keeps the evidence notes in an info tip instead of paragraphs", () => {
    render(<MemoryRouter><PacketAnalyzerDrawer detail={reports()} selectedObservationId={null} onClose={() => {}} onViewPath={() => {}} /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "Observations" });
    expect(within(section).getByRole("button", { name: /Grouped by the repeaters.*One entry per observer/ })).toBeInTheDocument();
    expect(within(section).queryByText(/Grouped by the repeaters/, { selector: "p" })).not.toBeInTheDocument();
    expect(within(section).queryByText(/One entry per observer/, { selector: "p" })).not.toBeInTheDocument();
    expect(within(section).queryByText(/Needs at least two repeaters/, { selector: "p" })).not.toBeInTheDocument();
  });
  it("shows the selected report only in the observations list, above the raw packet", () => {
    render(<MemoryRouter><PacketAnalyzerDrawer detail={reports()} selectedObservationId={1} onClose={() => {}} /></MemoryRouter>);
    const list = screen.getByRole("region", { name: "Observations" });
    expect(screen.queryByText("Observation", { exact: true })).not.toBeInTheDocument();
    expect(within(list).getByRole("button", { name: /Select observation.*Alpha/ })).toHaveAttribute("aria-pressed", "true");
    const raw = screen.getByText("Raw Packet");
    expect(list.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("reports an expired selection without quietly showing another report", () => {
    render(<MemoryRouter initialEntries={["/?tab=Packets&hash=abcdef12&analyze=1&observation=99"]}><PacketAnalyzerDrawer detail={reports()} selectedObservationId={1} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("That observation is no longer available");
    expect(screen.queryByText("Raw Packet")).not.toBeInTheDocument();
  });
  it("keeps route evidence selections strict without requiring packet URL state", () => {
    render(<MemoryRouter initialEntries={["/?tab=Routes&route=keep"]}><PacketAnalyzerDrawer detail={reports()} selectedObservationId={99} requireSelectedObservation onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("That observation is no longer available");
    expect(screen.queryByText("Raw Packet")).not.toBeInTheDocument();
  });
  it("explains TRACE and missing-report semantics in French", async () => {
    const d = reports(); d.header.payloadType = PayloadType.TRACE; d.observations = [];
    await i18n.changeLanguage("fr");
    render(<MemoryRouter><PacketAnalyzerDrawer detail={d} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Observations" })).toHaveTextContent("itinéraire prévu");
    expect(screen.getByText("Aucune observation pour ce paquet.")).toBeInTheDocument();
  });
  it("keeps a later selected path visible while bounding the initial list", () => {
    const d = reports();
    d.observations = Array.from({ length: 12 }, (_, i) => ({ ...d.observations[0], id: i + 1, observerId: `observer-${i}`, pathBytes: i.toString(16).padStart(4, "0") }));
    render(<MemoryRouter initialEntries={["/?hash=abcdef12&analyze=1&observation=12"]}><PacketAnalyzerDrawer detail={d} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    const section = screen.getByRole("region", { name: "Observations" });
    expect(within(section).getByText("Path 12").closest("details")).toHaveAttribute("open");
    expect(within(section).queryByText("Path 4")).not.toBeInTheDocument();
    fireEvent.click(within(section).getByRole("button", { name: "Load more (9 left)" }));
    expect(within(section).getByText("Path 4")).toBeInTheDocument();
    expect(within(section).getByText("Path 6")).toBeInTheDocument();
    expect(within(section).queryByText("Path 7")).not.toBeInTheDocument();
  });
});

describe("PacketAnalyzerDrawer in French", () => {
  it("translates the empty state and close control", async () => {
    await i18n.changeLanguage("fr");
    render(<MemoryRouter><PacketAnalyzerDrawer detail={undefined} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByText("Analyseur de paquets")).toBeInTheDocument();
    expect(screen.getByText("Sélectionnez un paquet à analyser")).toBeInTheDocument();
    expect(screen.getByLabelText("Fermer l’analyseur")).toBeInTheDocument();
  });
  it("translates the structure section and payload fields", async () => {
    const d = makeDetail([]);
    d.observations[0].pathBytes = "aabb";
    d.header = { ...d.header, raw: "14", routeType: RouteType.TRANSPORT_FLOOD, routeTypeName: "TRANSPORT_FLOOD" };
    d.transportCodes = { regionCode: 49240, subRegionCode: 0 };
    d.parsedPayload = { type: "TEXT_MESSAGE", destinationHash: "aa", sourceHash: "bb", ciphertext: "0011" };
    await i18n.changeLanguage("fr");
    render(<MemoryRouter><PacketAnalyzerDrawer detail={d} selectedObservationId={1} onClose={() => {}} /></MemoryRouter>);
    for (const text of ["Résumé", "Paquet brut", "Structure du paquet", "Octet d’en-tête", "Longueur du trajet", "Données du trajet", "Détail de la charge utile"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getByText("Codes de transport").parentElement!).toHaveTextContent("Code de portée 58C0 (2B) = 49240");
    expect(screen.getByText("Codes de transport").parentElement!).toHaveTextContent("aucune portée connue");
    expect(screen.getByText("sauts=2")).toBeInTheDocument();
    expect(screen.getByText("Chiffré — clé non disponible")).toBeInTheDocument();
  });
});

describe("transport scope", () => {
  const transport = () => {
    const d = makeDetail([]);
    d.header = { ...d.header, raw: "14", routeType: RouteType.TRANSPORT_FLOOD, routeTypeName: "TRANSPORT_FLOOD" };
    d.transportCodes = { regionCode: 49240, subRegionCode: 0 };
    d.scope = "#yow";
    return d;
  };
  it("boxes the summary scope chip like the type badge", () => {
    render(<MemoryRouter><PacketAnalyzerDrawer detail={transport()} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    const chip = within(screen.getByText("Summary").parentElement!).getByText("#yow");
    expect((chip.getAttribute("class") ?? "").split(/\s+/)).toEqual(expect.arrayContaining(["border", "px-2", "py-0.5"]));
  });
  it("breaks the transport codes out of the frame and shows the matched scope", () => {
    render(<MemoryRouter><PacketAnalyzerDrawer detail={transport()} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    const field = screen.getByText("Transport Codes").parentElement!;
    expect(field).toHaveTextContent("Scope code 58C0 (2B) = 49240");
    expect(within(field).getByText("#yow")).toBeInTheDocument();
    expect(field).toHaveTextContent("Code 2 0000 (2B) = 0");
  });
  it("says when a scope code matched no known scope", () => {
    const d = transport(); delete d.scope;
    render(<MemoryRouter><PacketAnalyzerDrawer detail={d} selectedObservationId={null} onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByText("Transport Codes").parentElement!).toHaveTextContent("no known scope");
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
    const btn = screen.getByRole("button", { name: /map all paths/i });
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
    expect(screen.getByRole("button", { name: /map all paths/i })).toBeDisabled();
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
