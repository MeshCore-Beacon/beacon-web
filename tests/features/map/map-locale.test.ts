import { expect, it, vi } from "vitest";
import i18n from "../../../src/i18n";

vi.mock("maplibre-gl", () => ({}));
vi.mock("../../../src/features/map/maplibre-worker", () => ({}));

const { mapLocale } = await import("../../../src/features/map/useMapLibre");

it("keeps MapLibre's own English control tooltips", () => {
  expect(mapLocale()).toMatchObject({ "NavigationControl.ZoomIn": "Zoom in", "AttributionControl.ToggleAttribution": "Toggle attribution" });
});

it("translates the MapLibre control tooltips to French", async () => {
  await i18n.changeLanguage("fr");
  expect(mapLocale()).toMatchObject({ "NavigationControl.ZoomIn": "Zoom avant", "NavigationControl.ZoomOut": "Zoom arrière" });
});
