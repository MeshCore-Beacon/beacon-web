import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("keeps the status icon and IATA chip on the name row", () => {
    render(<ObserverSummary observer={observer} points={[]} />);
    const row = screen.getByRole("heading", { level: 1 }).parentElement!;
    expect(screen.getByRole("img", { name: "Status is stale" }).parentElement).toBe(row);
    expect(screen.getByText("YKF").parentElement).toBe(row);
  });

  it("names the last complete hour by its UTC window instead of a note under the card", () => {
    const activity = { summary: {
      recordedPackets: 5, lastCompleteHour: 3, lastCompleteHourStart: 0, lastCompleteHourEnd: 3_600_000, latestRecordedAt: null,
    } } as unknown as ObserverActivity;
    render(<ObserverSummary observer={observer} activity={activity} points={[]} />);
    const tile = screen.getByText("Packets 00–01 UTC").closest("li")!;
    expect(tile).toHaveTextContent("3");
    expect(tile).toHaveClass("text-center");
    expect(screen.queryByText(/00:00–01:00/)).not.toBeInTheDocument();
  });

  it("labels the noise tile as the last reading and sets the unit apart from the number", () => {
    const points = [{ noiseFloorDb: -91 } as unknown as TelemetryPoint];
    render(<ObserverSummary observer={observer} points={points} />);
    const tile = screen.getByText("Last noise floor").closest("li")!;
    expect(screen.queryByText(/Latest telemetry interval|Latest status/)).not.toBeInTheDocument();
    expect(within(tile).getByText("-91")).not.toHaveClass("text-sm");
    expect(within(tile).getByText("dBm")).toHaveClass("text-sm");
  });
});

describe("observer identity panel", () => {
  const full = {
    ...observer,
    hardwareModel: "Heltec V3",
    firmwareVersion: "v1.16.0-observer-8fa3870",
    softwareVersion: "meshcore/v1.16.0-observer-8fa3870",
    radioFreqMhz: 910.525, radioSf: 7, radioBwKhz: 62.5, radioCr: 5,
    publicKey: "04ebc137a3e94d78c376ee356293343f1751f3d9e023960af02c14c63b839a29",
    firstSeen: Date.now() - 86_400_000,
    brokers: [{ name: "mqtt1", lastSeenAt: Date.now() - 60_000, lastPacketAt: Date.now() - 60_000 }],
  } as unknown as Observer;

  it("puts device details beside the name instead of a separate card", () => {
    render(<ObserverSummary observer={full} points={[]} />);
    const panel = screen.getByRole("region", { name: "Roof" });
    expect(panel).toContainElement(screen.getByRole("heading", { level: 1, name: "Roof" }));
    expect(panel).toHaveTextContent("Heltec V3");
    expect(panel).toHaveTextContent("v1.16.0-observer-8fa3870");
    expect(panel).toHaveTextContent("910.525 MHz");
    expect(panel).not.toHaveTextContent("meshcore/v1.16.0");
    expect(panel).toHaveTextContent("mqtt1");
    expect(panel).toHaveTextContent("1d ago");
  });

  it("shortens the public key but copies all of it", () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ObserverSummary observer={full} points={[]} />);
    expect(screen.getByText("04ebc137…b839a29")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy public key" }));
    expect(writeText).toHaveBeenCalledWith(full.publicKey);
  });

  it("keeps a client version that adds information", () => {
    render(<ObserverSummary observer={{ ...full, softwareVersion: "meshcore-mqtt 2.1" }} points={[]} />);
    expect(screen.getByRole("region", { name: "Roof" })).toHaveTextContent("meshcore-mqtt 2.1");
  });
});
