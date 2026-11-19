import i18n from "../../i18n";

export function mapLocale() {
  return {
    "AttributionControl.ToggleAttribution": i18n.t("map.controls.toggleAttribution"),
    "AttributionControl.MapFeedback": i18n.t("map.controls.mapFeedback"),
    "Map.Title": i18n.t("map.controls.map"),
    "NavigationControl.ResetBearing": i18n.t("map.controls.resetBearing"),
    "NavigationControl.ZoomIn": i18n.t("map.controls.zoomIn"),
    "NavigationControl.ZoomOut": i18n.t("map.controls.zoomOut"),
    "Popup.Close": i18n.t("map.controls.closePopup"),
  };
}

// MapLibre 6 reads locale at construction. Update the existing controls' DOM
// labels on language changes without rebuilding the map or touching private state.
export function localizeMapControls(container: HTMLElement): () => void {
  const update = () => {
    const locale = mapLocale();
    for (const [selector, key] of [
      [".maplibregl-canvas", "Map.Title"],
      [".maplibregl-ctrl-zoom-in", "NavigationControl.ZoomIn"],
      [".maplibregl-ctrl-zoom-out", "NavigationControl.ZoomOut"],
      [".maplibregl-ctrl-compass", "NavigationControl.ResetBearing"],
      [".maplibregl-ctrl-attrib-button", "AttributionControl.ToggleAttribution"],
    ] as const) {
      for (const element of container.querySelectorAll<HTMLElement>(selector)) {
        element.setAttribute("aria-label", locale[key]);
        if (key !== "Map.Title") element.title = locale[key];
      }
    }
  };
  update();
  i18n.on("languageChanged", update);
  return () => { i18n.off("languageChanged", update); };
}
