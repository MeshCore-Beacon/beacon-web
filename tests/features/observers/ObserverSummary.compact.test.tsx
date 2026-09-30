import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObserverSummary } from "../../../src/features/observers/ObserverSummary";
import type { Observer } from "../../../src/features/observers/types";

const observer = { id: "observer", displayName: "Roof", iata: "YKF", brokers: [], lastStatusAt: Date.now() - 600_000 } as unknown as Observer;

describe("compact observer header", () => {
  it("uses an accessible stale icon and omits the traffic text badge", () => {
    render(<ObserverSummary observer={observer} points={[]} />);
    expect(screen.getByRole("img", { name: "Status is stale" })).toHaveClass("text-warn");
    expect(screen.queryByText("Status is stale")).not.toBeInTheDocument();
    expect(screen.queryByText(/No recent recorded packets|Packet freshness unavailable/)).not.toBeInTheDocument();
  });
  it("distinguishes recent and absent status without inventing telemetry", () => {
    const { rerender } = render(<ObserverSummary observer={{ ...observer, lastStatusAt: Date.now() }} points={[]} />);
    expect(screen.getByRole("img", { name: "Recent status" })).toHaveClass("text-green");
    rerender(<ObserverSummary observer={{ ...observer, lastStatusAt: null }} points={[]} />);
    expect(screen.getByRole("img", { name: "No status report" })).toHaveClass("text-text-muted");
  });
});
