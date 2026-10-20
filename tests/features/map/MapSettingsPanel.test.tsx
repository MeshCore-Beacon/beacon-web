import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MapSettingsPanel } from "../../../src/features/map/MapSettingsPanel";
import { PacketFlowButton } from "../../../src/features/map/PacketFlowButton";
import i18n from "../../../src/i18n";

function mount() {
  render(<>
    <MapSettingsPanel styleId="dark" onStyleChange={() => {}} typeFilter="" onTypeChange={() => {}}
      clustered onClusteredChange={() => {}} neighborLines="selected" onNeighborLinesChange={() => {}}
      borders onBordersChange={() => {}} buildShareParams={() => ({})} />
    <PacketFlowButton active={false} onToggle={() => {}} />
  </>);
}

describe("map settings", () => {
  it("renders in English", () => {
    mount();
    expect(screen.getByText("Map Settings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repeater" })).toBeInTheDocument();
    expect(screen.getByText("fainter = heard longer ago")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play live map packet flow" })).toHaveTextContent("Live Map");
  });

  it("renders in French", async () => {
    await i18n.changeLanguage("fr");
    mount();
    expect(screen.getByText("Paramètres de la carte")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Répéteur" })).toBeInTheDocument();
    expect(screen.getByText("Contour de zone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lancer le flux de paquets en direct sur la carte" })).toHaveTextContent("Carte en direct");
  });

  it("shows clustering off and disabled with a note while Live Map is on", async () => {
    await i18n.changeLanguage("en");
    const onClusteredChange = vi.fn();
    render(
      <MapSettingsPanel styleId="dark" onStyleChange={() => {}} typeFilter="" onTypeChange={() => {}}
        clustered onClusteredChange={onClusteredChange} neighborLines="selected" onNeighborLinesChange={() => {}}
        borders onBordersChange={() => {}} buildShareParams={() => ({})} liveMap />,
    );
    const group = screen.getByRole("group", { name: "Clustering" });
    const off = within(group).getByRole("button", { name: "Off" });
    expect(off).toHaveAttribute("aria-pressed", "true");
    expect(off).toBeDisabled();
    expect(screen.getByText("Off while Live Map is on")).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: "On" }));
    expect(onClusteredChange).not.toHaveBeenCalled();
  });

  it("disables all-node neighbour lines with a note while Live Map is on", async () => {
    await i18n.changeLanguage("en");
    const onNeighborLinesChange = vi.fn();
    render(
      <MapSettingsPanel styleId="dark" onStyleChange={() => {}} typeFilter="" onTypeChange={() => {}}
        clustered onClusteredChange={() => {}} neighborLines="on" onNeighborLinesChange={onNeighborLinesChange}
        borders onBordersChange={() => {}} buildShareParams={() => ({})} liveMap />,
    );
    const group = screen.getByRole("group", { name: "Neighbor lines" });
    const on = within(group).getByRole("button", { name: "On" });
    expect(on).toBeDisabled();
    expect(within(group).getByRole("button", { name: "Selected" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Off" })).toBeEnabled();
    expect(screen.getByText("All lines are off while Live Map is on")).toBeInTheDocument();
    fireEvent.click(on);
    expect(onNeighborLinesChange).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole("button", { name: "Off" }));
    expect(onNeighborLinesChange).toHaveBeenCalledWith("off");
  });
});
