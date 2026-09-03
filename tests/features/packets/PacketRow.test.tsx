import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PacketRow } from "../../../src/features/packets/PacketRow";
import type { PacketSummary } from "../../../src/types/api";

const pkt = (over: Partial<PacketSummary> = {}): PacketSummary => ({
  packetHash: "AA11", payloadType: 1, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD",
  firstHeardAt: 1700000000, lastHeardAt: 1700000002, observationCount: 2, ...over,
});

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

describe("PacketRow", () => {
  // expanded card loses its bottom radius so the expansion below reads as the same card unfolding
  it("squares its bottom corners while expanded", () => {
    const { container } = render(<PacketRow packet={pkt()} expanded onToggle={() => {}} />);
    expect(tokens(container.firstElementChild!)).toContain("rounded-b-none");
  });

  it("keeps rounded corners while collapsed", () => {
    const { container } = render(<PacketRow packet={pkt()} expanded={false} onToggle={() => {}} />);
    expect(tokens(container.firstElementChild!)).not.toContain("rounded-b-none");
  });

  it("toggles on click", () => {
    const onToggle = vi.fn();
    render(<PacketRow packet={pkt()} expanded={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText("AA11"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
