import { afterEach, expect, it } from "vitest";
import i18n from "../../../src/i18n";
import { localizeMapControls, mapLocale } from "../../../src/features/map/map-locale";

afterEach(async () => { await i18n.changeLanguage("en"); });

it("keeps MapLibre's own English control tooltips", () => {
  expect(mapLocale()).toMatchObject({ "NavigationControl.ZoomIn": "Zoom in", "AttributionControl.ToggleAttribution": "Toggle attribution" });
});

it("translates the MapLibre control tooltips to French", async () => {
  await i18n.changeLanguage("fr");
  expect(mapLocale()).toMatchObject({ "NavigationControl.ZoomIn": "Zoom avant", "NavigationControl.ZoomOut": "Zoom arrière" });
});

it("updates existing map controls and stops listening when their map is removed", async () => {
  const makeContainer = () => {
    const container = document.createElement("div");
    container.innerHTML = '<canvas class="maplibregl-canvas" role="region"></canvas><button class="maplibregl-ctrl-zoom-in"></button><summary class="maplibregl-ctrl-attrib-button"></summary>';
    return container;
  };
  const main = makeContainer();
  const path = makeContainer();
  const canvas = main.querySelector("canvas");
  const stopMain = localizeMapControls(main);
  const stopPath = localizeMapControls(path);
  try {
    expect(canvas).toHaveAttribute("aria-label", "Map");
    await i18n.changeLanguage("fr");
    expect(main.querySelector("canvas")).toBe(canvas);
    expect(canvas).toHaveAttribute("aria-label", "Carte");
    expect(main.querySelector("button")).toHaveAttribute("title", "Zoom avant");
    expect(path.querySelector("button")).toHaveAttribute("aria-label", "Zoom avant");
    stopMain();
    await i18n.changeLanguage("en");
    expect(canvas).toHaveAttribute("aria-label", "Carte");
    expect(path.querySelector("button")).toHaveAttribute("aria-label", "Zoom in");
    expect(path.querySelector("summary")).toHaveAttribute("title", "Toggle attribution");
  } finally {
    stopMain();
    stopPath();
  }
});
