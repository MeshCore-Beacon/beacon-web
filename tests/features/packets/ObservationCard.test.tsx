import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObservationCard } from "../../../src/features/packets/ObservationCard";
import type { Observation } from "../../../src/types/api";
import i18n from "../../../src/i18n";

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

  it("shows the observer's radio settings", () => {
    render(<ObservationCard observation={obs({ radio: { freqMhz: 910.525, spreadFactor: 7, bandwidthKhz: 62.5, codingRate: 5 } })} />);
    expect(screen.getByText("910.525 MHz")).toBeInTheDocument();
    expect(screen.getByText("SF7")).toBeInTheDocument();
    expect(screen.getByText("62.5 kHz")).toBeInTheDocument();
    expect(screen.getByText("CR 4/5")).toBeInTheDocument();
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
    expect(cls).toEqual(expect.arrayContaining(["border-l-primary", "bg-primary/6"]));
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

  // the server swaps a TRACE's pathBytes to its hop hashes; per-hop SNR comes from the parsed payload
  it("renders a TRACE path as resolvable hops with each hop's SNR underneath", () => {
    render(
      <ObservationCard
        observation={obs({
          pathBytes: "abcdef", pathLength: { raw: "03", hashSize: 1, hopCount: 3 },
          resolvedPath: [{ confidence: "high", nodes: [{ id: "n1", publicKey: "ab", name: "Alpha" }] }],
        })}
        isTrace
        snrValues={[-5, 7.25]}
      />,
    );

    expect(screen.getByText("Path")).toBeInTheDocument();
    expect(screen.queryByText("ABCDEF")).not.toBeInTheDocument();
    for (const hop of ["AB", "CD", "EF"]) expect(screen.getByText(hop)).toBeInTheDocument();
    expect(screen.getByText("AB").className).toContain("text-green");
    expect(screen.getByText("-5.00 dB")).toBeInTheDocument();
    expect(screen.getByText("7.25 dB")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("keeps non-trace paths free of SNR sub-lines", () => {
    render(<ObservationCard observation={obs({ pathBytes: "4142", pathLength: { raw: "02", hashSize: 1, hopCount: 2 } })} />);
    expect(screen.queryByText("-")).not.toBeInTheDocument();
  });

  it("labels the stats and path in French", async () => {
    await i18n.changeLanguage("fr");
    render(<ObservationCard observation={obs({ pathBytes: "41", radio: { freqMhz: 910.525 } })} />);
    for (const label of ["Prop.", "Sauts", "Radio", "Trajet"]) expect(screen.getByText(label)).toBeInTheDocument();
  });
});
