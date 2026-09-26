import { afterEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PacketEndpoints } from "../../../src/features/packets/PacketEndpoints";
import type { LatestObserver, PacketSummary } from "../../../src/types/api";

const pkt = (observer?: LatestObserver): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 0, lastHeardAt: 0, observationCount: 1, latestObserver: observer,
});

const obs = (over: Partial<LatestObserver> = {}): LatestObserver => ({
  id: "o1", iata: "YVR", pathLength: { raw: "00", hashSize: 1, hopCount: 0 }, ...over,
});

afterEach(() => vi.restoreAllMocks());

const ambiguousSource = {
  confidence: "ambiguous" as const,
  nodes: [
    { id: "source-a", name: "Alpha", publicKey: "aa010203" },
    { id: "source-b", name: "Beta", publicKey: "aa040506" },
  ],
};

describe("PacketEndpoints", () => {
  it("renders a single n/a when there is no observer at all", () => {
    render(<PacketEndpoints packet={pkt()} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("renders both endpoints with the arrow glyph between them", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "s", publicKey: "aa", name: "SrcNode" }] },
      resolvedDestination: { confidence: "high", nodes: [{ id: "d", publicKey: "bb", name: "DstNode" }] },
    }))} />);
    expect(screen.getByText("SrcNode")).toBeInTheDocument();
    expect(screen.getByText("DstNode")).toBeInTheDocument();
    expect(screen.getByText("→")).toBeInTheDocument();
  });

  it("shows n/a for a missing endpoint while the present one still renders", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "s", publicKey: "aa", name: "SrcNode" }] },
    }))} />);
    expect(screen.getByText("SrcNode")).toBeInTheDocument();
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  // The REST list leaves both nil, so this is the common scrollback case — one n/a, no arrow.
  it("collapses to a single n/a when both endpoints are absent", () => {
    render(<PacketEndpoints packet={pkt(obs())} />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(screen.queryByText("→")).not.toBeInTheDocument();
  });

  it("tints an ambiguous endpoint with the warn token", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "ambiguous", nodes: [{ id: "n", publicKey: "ab", name: "Raven" }] },
    }))} />);
    expect(screen.getByText("Raven").className).toContain("text-warn");
  });

  it("tints a high-confidence endpoint with the green token", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "high", nodes: [{ id: "n", publicKey: "ab", name: "Falcon" }] },
    }))} />);
    expect(screen.getByText("Falcon").className).toContain("text-green");
  });

  it("renders a bare ? for an endpoint the backend could not resolve", () => {
    render(<PacketEndpoints packet={pkt(obs({
      resolvedSource: { confidence: "none", nodes: [] },
    }))} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("shows an advert as its single source node with no destination", () => {
    const advert = { ...pkt(obs({ resolvedSource: { confidence: "high", nodes: [{ id: "s", publicKey: "aa", name: "Fuzz HQ" }] } })), payloadType: 4, summary: "Fuzz HQ" };
    render(<PacketEndpoints packet={advert} />);
    expect(screen.getAllByText("Fuzz HQ")).toHaveLength(1);
    expect(screen.queryByText("→")).not.toBeInTheDocument();
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
  });

  it("falls back to the summary name for an advert with no resolved source", () => {
    render(<PacketEndpoints packet={{ ...pkt(obs()), payloadType: 4, summary: "Fuzz HQ" }} />);
    expect(screen.getByText("Fuzz HQ").className).toContain("text-green");
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
  });

  it("replaces n/a with the summary when there are no endpoints", () => {
    render(<PacketEndpoints packet={{ ...pkt(obs()), payloadType: 9, summary: "TRACE 2ca2a79c" }} />);
    expect(screen.getByText("TRACE 2ca2a79c").className).toContain("text-text-muted");
    expect(screen.queryByText("n/a")).not.toBeInTheDocument();
  });

  it("shows all ambiguous candidates on hover, with an additional-match count", () => {
    render(<PacketEndpoints packet={pkt(obs({ resolvedSource: ambiguousSource }))} />);
    const trigger = screen.getByRole("button", { name: "Alpha +1" });
    fireEvent.mouseEnter(trigger);
    const tip = screen.getByRole("tooltip");
    expect(within(tip).getByText("Alpha")).toBeInTheDocument();
    expect(within(tip).getByText("Beta")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-describedby", tip.id);
    expect(within(tip).queryByText(/SNR/)).not.toBeInTheDocument();
  });

  it("opens candidates from the keyboard and closes with Escape without selecting the packet", () => {
    const select = vi.fn();
    render(<div onClick={select} onKeyDown={select}><PacketEndpoints packet={pkt(obs({ resolvedSource: ambiguousSource }))} /></div>);
    const trigger = screen.getByRole("button", { name: "Alpha +1" });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    fireEvent.blur(trigger, { relatedTarget: document.body });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens all candidates on touch without activating the packet row", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
    const select = vi.fn();
    render(<div onClick={select}><PacketEndpoints packet={pkt(obs({ resolvedDestination: ambiguousSource }))} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Alpha +1" }));
    expect(within(screen.getByRole("tooltip")).getByText("Beta")).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders resolved endpoints without requiring physical path metadata", () => {
    render(<PacketEndpoints packet={pkt(obs({ pathLength: undefined, resolvedSource: { confidence: "high", nodes: [{ id: "s", name: "Source", publicKey: "aa" }] } }))} />);
    expect(screen.getByText("Source")).toBeInTheDocument();
  });
});
