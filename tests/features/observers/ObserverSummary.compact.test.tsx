import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObserverSummary } from "../../../src/features/observers/ObserverSummary";
import type { Observer } from "../../../src/features/observers/types";
import type { ObserverActivity, TelemetryPoint } from "../../../src/features/stats/types";

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

describe("observer summary card notes", () => {
  it("wraps the last-complete-hour window under its card instead of a non-wrapping sublabel", () => {
    const activity = { summary: {
      recordedPackets: 5, lastCompleteHour: 3, lastCompleteHourStart: 0, lastCompleteHourEnd: 3_600_000, latestRecordedAt: null,
    } } as unknown as ObserverActivity;
    render(<ObserverSummary observer={observer} activity={activity} points={[]} />);
    const note = screen.getByText("00:00–01:00 UTC");
    expect(note).not.toHaveClass("whitespace-nowrap");
    expect(note).toHaveClass("mt-1");
  });

  it("wraps the noise-floor telemetry note under its card the same way", () => {
    const points = [{ noiseFloorDb: -91 } as unknown as TelemetryPoint];
    render(<ObserverSummary observer={observer} points={points} />);
    const note = screen.getByText("Latest telemetry interval");
    expect(note).not.toHaveClass("whitespace-nowrap");
    expect(note).toHaveClass("mt-1");
  });
});
