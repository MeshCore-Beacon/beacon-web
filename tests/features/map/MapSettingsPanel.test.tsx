import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
