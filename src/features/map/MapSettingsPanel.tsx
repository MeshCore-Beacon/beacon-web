import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { SegmentedControl } from "./SegmentedControl";
import { NODE_TYPE_FILTER_OPTIONS, type NeighborLinesMode } from "./types";
import { Section } from "../../components/DetailPanel";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { useIsMobile } from "../../hooks/useMediaQuery";

// Open/closed state persists across sessions; no click-outside dismiss, so it stays open while you pan.
const OPEN_STORAGE_KEY = "beacon-map-settings-open";

// Swatch matching the border layer paint (secondary line over a faint fill), so the legend tracks the theme.
function BorderLegend() {
  const { t } = useTranslation();
  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-text-dim">
      <span
        className="inline-block h-2.5 w-4 rounded-sm border"
        style={{ borderColor: "var(--palette-secondary)", backgroundColor: "var(--palette-secondary)", opacity: 0.5 }}
      />
      {t("map.areaOutline")}
    </div>
  );
}

// Legend for a selected node's coloured edges. Gradient stops mirror the map paint's log anchors
// (red ~1, yellow ~20 at 60%, green ~150+); palette vars keep it in step with the active theme.
function NeighborLegend() {
  const { t } = useTranslation();
  return (
    <div className="mt-2.5">
      <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">{t("map.observations")}</div>
      <div
        className="h-2 rounded-sm border border-border-subtle"
        style={{ background: "linear-gradient(to right, var(--palette-danger) 0%, var(--palette-warn) 60%, var(--palette-green) 100%)" }}
      />
      <div className="relative h-3 mt-0.5 text-[9px] text-text-dim tabular-nums">
        <span className="absolute left-0">1</span>
        <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>20</span>
        <span className="absolute right-0">150+</span>
      </div>
      <div className="text-[9px] text-text-dim mt-1">{t("map.fainter")}</div>
    </div>
  );
}

interface MapSettingsPanelProps {
  dimNodes?: boolean;
  onDimNodesChange?: (on: boolean) => void;
  styleId: string;
  onStyleChange: (id: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  clustered: boolean;
  onClusteredChange: (c: boolean) => void;
  neighborLines: NeighborLinesMode;
  onNeighborLinesChange: (mode: NeighborLinesMode) => void;
  borders: boolean;
  onBordersChange: (on: boolean) => void;
  // builds deep-link params for the current view, evaluated at copy time (reads the live camera)
  buildShareParams: () => Record<string, string | null>;
}

export function MapSettingsPanel({
  styleId,
  onStyleChange,
  typeFilter,
  onTypeChange,
  clustered,
  onClusteredChange,
  neighborLines,
  onNeighborLinesChange,
  borders,
  onBordersChange,
  buildShareParams,
  dimNodes = false,
  onDimNodesChange,
}: MapSettingsPanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const on = { value: "on", label: t("map.on") };
  const off = { value: "off", label: t("map.off") };
  const typeOptions = [
    { value: "", label: t("map.all") },
    ...NODE_TYPE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(`nodeTypes.${o.value}`, { defaultValue: o.label }) })),
  ];
  const neighborOptions = [on, { value: "selected", label: t("map.selected") }, off];
  // collapsed by default on mobile (the card would cover the map); a saved preference still wins
  const [open, setOpen] = useState(() => {
    const stored = localStorage.getItem(OPEN_STORAGE_KEY);
    return stored === null ? !isMobile : stored === "true";
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      // private mode / quota — the toggle still works, just not persisted
    }
  };

  return (
    <div className="absolute top-3 left-3 z-10 w-60 max-w-[calc(100vw-1.5rem)] bg-bg-raised border border-border rounded-md shadow-lg overflow-hidden font-mono">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center justify-between w-full px-3 py-2 text-[11px] uppercase tracking-wider text-text-dim hover:text-text-normal transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 4.5h7M2 11.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <circle cx="12" cy="4.5" r="1.7" fill="currentColor" />
            <circle cx="9" cy="11.5" r="1.7" fill="currentColor" />
            <path d="M9 11.5h5M12 4.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {t("map.settings")}
        </span>
        <span aria-hidden className="text-text-dim text-[9px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-border-subtle">
          <Section title={t("map.tiles")} first>
            <MapStyleSwitcher styleId={styleId} onChange={onStyleChange} className="w-full" />
          </Section>
          <Section title={t("map.nodeType")}>
            <SegmentedControl
              wrap
              ariaLabel={t("map.nodeTypeLabel")}
              options={typeOptions}
              value={typeFilter}
              onChange={onTypeChange}
            />
          </Section>
          <Section title={t("map.clustering")}>
            <SegmentedControl
              ariaLabel={t("map.clustering")}
              options={[on, off]}
              value={clustered ? "on" : "off"}
              onChange={(v) => onClusteredChange(v === "on")}
              className="w-full"
            />
          </Section>
          <Section title={t("map.neighborLines")}>
            <SegmentedControl
              ariaLabel={t("map.neighborLinesLabel")}
              options={neighborOptions}
              value={neighborLines}
              onChange={(v) => onNeighborLinesChange(v as NeighborLinesMode)}
              className="w-full"
            />
            {neighborLines === "selected" && <NeighborLegend />}
          </Section>
          {onDimNodesChange && <Section title={t("map.liveNodes")}>
            <label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={dimNodes} onChange={event => onDimNodesChange(event.target.checked)} />{t("map.dimLiveNodes")}</label>
          </Section>}
          <Section title={t("map.areaBorders")}>
            <SegmentedControl
              ariaLabel={t("map.areaBordersLabel")}
              options={[on, off]}
              value={borders ? "on" : "off"}
              onChange={(v) => onBordersChange(v === "on")}
              className="w-full"
            />
            {borders && <BorderLegend />}
          </Section>
          <div className="px-3 py-2.5 border-t border-border-subtle flex justify-end">
            <CopyLinkButton
              params={buildShareParams}
              label={t("map.copyLink")}
              ariaLabel={t("map.copyLinkLabel")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
