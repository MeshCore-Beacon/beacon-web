import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ObservationTable } from "../../../src/features/packets/ObservationTable";
import i18n from "../../../src/i18n";
import type { Observation } from "../../../src/types/api";

const obs = (id: number, over: Partial<Observation> = {}): Observation => ({
  id, observerId: `o${id}`, observerName: `Observer ${id}`, iata: "YVR",
  heardAt: 1700000000 + id, pathLength: { raw: "41", hashSize: 1, hopCount: 1 },
  sourceBroker: "b1", resolvedPath: [], ...over,
});

describe("ObservationTable", () => {
  it("renders one row per observation in the given order", () => {
    render(<ObservationTable observations={[obs(1), obs(2)]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("Observer 1")).toBeInTheDocument();
    expect(screen.getByText("Observer 2")).toBeInTheDocument();
  });

  it("selects an observation on click", () => {
    const onSelect = vi.fn();
    render(<ObservationTable observations={[obs(1)]} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Observer 1"));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("marks the selected row", () => {
    render(<ObservationTable observations={[obs(1)]} selectedId={1} onSelect={() => {}} />);
    expect(screen.getByRole("row", { selected: true })).toBeInTheDocument();
  });

  it("leaves an unselected row's aria-selected false", () => {
    render(<ObservationTable observations={[obs(1), obs(2)]} selectedId={1} onSelect={() => {}} />);
    const rows = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
    expect(rows[1]).toHaveAttribute("aria-selected", "false");
  });

  it("falls back to a truncated observer id when the name is missing", () => {
    render(<ObservationTable observations={[obs(1, { observerName: undefined, observerId: "abcdefgh1234" })]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("abcdefgh")).toBeInTheDocument();
  });

  it("renders em dashes for every absent optional field and no path row", () => {
    render(<ObservationTable observations={[obs(1)]} selectedId={null} onSelect={() => {}} />);
    const row = screen.getAllByRole("row")[1]!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[3]).toHaveTextContent("—"); // SNR
    expect(cells[4]).toHaveTextContent("—"); // RSSI
    expect(cells[5]).toHaveTextContent("—"); // Prop
    expect(cells[7]).toHaveTextContent("—"); // Path
  });

  it("renders every field when all optional data is present", () => {
    render(
      <ObservationTable
        observations={[
          obs(1, { rssi: -87, snr: 6.2, propagationTimeMs: 1234, pathBytes: "ab", pathLength: { raw: "41", hashSize: 1, hopCount: 1 } }),
        ]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    const row = screen.getAllByRole("row")[1]!;
    const cells = within(row).getAllByRole("cell");
    expect(cells[3]).toHaveTextContent("6.20");
    expect(cells[4]).toHaveTextContent("-87");
    expect(cells[5]).toHaveTextContent("1.234s");
    expect(cells[6]).toHaveTextContent("1");
    expect(within(cells[7]!).getByText("AB")).toBeInTheDocument();
  });

  it("colors a good SNR", () => {
    render(<ObservationTable observations={[obs(1, { snr: 12 })]} selectedId={null} onSelect={() => {}} />);
    const row = screen.getAllByRole("row")[1]!;
    const cell = within(row).getAllByRole("cell")[3]!;
    expect(cell.className).toContain("text-green");
  });

  it("colors a mid SNR", () => {
    render(<ObservationTable observations={[obs(1, { snr: 7 })]} selectedId={null} onSelect={() => {}} />);
    const row = screen.getAllByRole("row")[1]!;
    const cell = within(row).getAllByRole("cell")[3]!;
    expect(cell.className).toContain("text-warn");
  });

  it("colors a bad SNR", () => {
    render(<ObservationTable observations={[obs(1, { snr: 2 })]} selectedId={null} onSelect={() => {}} />);
    const row = screen.getAllByRole("row")[1]!;
    const cell = within(row).getAllByRole("cell")[3]!;
    expect(cell.className).toContain("text-danger");
  });

  it("colors a null SNR as dim", () => {
    render(<ObservationTable observations={[obs(1, { snr: undefined })]} selectedId={null} onSelect={() => {}} />);
    const row = screen.getAllByRole("row")[1]!;
    const cell = within(row).getAllByRole("cell")[3]!;
    expect(cell.className).toContain("text-text-dim");
  });
});

describe("ObservationTable in French", () => {
  it("translates the column headers", async () => {
    await i18n.changeLanguage("fr");
    render(<ObservationTable observations={[obs(1)]} selectedId={null} onSelect={() => {}} />);
    for (const h of ["Observateur", "Zone", "Reçu", "Prop.", "Sauts", "Trajet"]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
  });
});
