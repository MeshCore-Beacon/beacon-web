import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObservationCard } from "../../../src/features/packets/ObservationCard";
import type { Observation } from "../../../src/types/api";

const obs = (over: Partial<Observation> = {}): Observation => ({
  id: 1, observerId: "o1", observerName: "Observer 1", iata: "YVR",
  heardAt: 1700000000, pathLength: { raw: "41", hashSize: 1, hopCount: 1 },
  sourceBroker: "b1", resolvedPath: [], ...over,
});

const tokens = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

describe("ObservationCard", () => {
  // jsdom can't measure layout, so these assert the class tokens that encode the behavior.
  it("lets a long observer name truncate instead of overflowing the card", () => {
    render(<ObservationCard observation={obs({ observerName: "a-very-long-observer-station-name" })} />);

    const name = screen.getByText("a-very-long-observer-station-name");
    expect(tokens(name)).toEqual(expect.arrayContaining(["flex-1", "min-w-0", "truncate"]));
  });

  it("lays the four stats out as equal grid columns that can shrink", () => {
    render(<ObservationCard observation={obs()} />);

    const stats = screen.getByText("SNR").parentElement!.parentElement!;
    expect(tokens(stats)).toEqual(expect.arrayContaining(["grid", "grid-cols-4"]));
    for (const label of ["SNR", "RSSI", "Prop", "Hops"]) {
      expect(tokens(screen.getByText(label).parentElement!)).toContain("min-w-0");
    }
  });

  // The left edge mirrors the SNR coloring the desktop table applies to its SNR column.
  it.each([
    [12, "border-l-green"],
    [7, "border-l-warn"],
    [2, "border-l-danger"],
  ])("colors the left edge by signal level (snr %s → %s)", (snr, cls) => {
    const { container } = render(<ObservationCard observation={obs({ snr })} />);
    expect(tokens(container.firstElementChild!)).toContain(cls);
  });

  it("keeps a neutral edge when SNR is unknown", () => {
    const { container } = render(<ObservationCard observation={obs()} />);
    expect(tokens(container.firstElementChild!)).toContain("border-l-primary");
  });

  it("lets selection override the signal edge", () => {
    const { container } = render(<ObservationCard observation={obs({ snr: 12 })} selected />);
    const cls = tokens(container.firstElementChild!);
    expect(cls).toContain("border-l-secondary");
    expect(cls).not.toContain("border-l-green");
  });

  // Guards the analyzer-drawer usage: content and click-through must survive the layout change.
  it("still renders IATA, timestamp, path row and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <ObservationCard
        observation={obs({ pathBytes: "4142", pathLength: { raw: "4142", hashSize: 1, hopCount: 2 }, snr: 8.5, rssi: -108 })}
        onClick={onClick}
      />,
    );

    expect(screen.getByText("YVR")).toBeInTheDocument();
    expect(screen.getByText("8.50")).toBeInTheDocument();
    expect(screen.getByText("-108")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Observer 1"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
