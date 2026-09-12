import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PacketRow } from "../../../src/features/packets/PacketRow";
import { PacketTableRow } from "../../../src/features/packets/PacketTableRow";

const packet = {
  packetHash: "AA11BB22", payloadType: 4, payloadTypeName: "ADVERT",
  routeType: 1, routeTypeName: "FLOOD", firstHeardAt: 1, lastHeardAt: 2, observationCount: 1,
};

describe.each([["mobile", PacketRow], ["desktop", PacketTableRow]] as const)("%s packet summary", (_name, Row) => {
  it("shows the packet's advertised name and keeps row selection working", () => {
    const toggle = vi.fn();
    render(<Row packet={{ ...packet, summary: "MD00-Repeater 📡" }} expanded={false} onToggle={toggle} />);
    const summary = screen.getByText("MD00-Repeater 📡");
    expect(summary).toHaveAttribute("title", "MD00-Repeater 📡");
    fireEvent.click(summary);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("supports rows from an older server without summaries", () => {
    render(<Row packet={packet} expanded={false} onToggle={() => {}} />);
    expect(screen.getByText(/AA11/)).toBeInTheDocument();
    expect(screen.queryByText("MD00-Repeater 📡")).not.toBeInTheDocument();
  });
});
