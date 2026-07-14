import { useState } from "react";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { SegmentedControl } from "./SegmentedControl";
import { NODE_TYPE_FILTER_OPTIONS, type NeighborLinesMode } from "./types";
import { Section } from "../../components/DetailPanel";
import { CopyLinkButton } from "../../components/CopyLinkButton";
import { useIsMobile } from "../../hooks/useMediaQuery";

// Open/closed state persists across sessions; no click-outside dismiss, so it stays open while you pan.
const OPEN_STORAGE_KEY = "beacon-map-settings-open";

const TYPE_OPTIONS = [{ value: "", label: "All" }, ...NODE_TYPE_FILTER_OPTIONS];
const CLUSTER_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];
const NEIGHBOR_OPTIONS = [
  { value: "on", label: "On" },
  { value: "selected", label: "Selected" },
  { value: "off", label: "Off" },
];

// Legend for a selected node's coloured edges. Gradient stops mirror the map paint's log anchors
// (red ~1, yellow ~20 at 60%, green ~150+); palette vars keep it in step with the active theme.
function NeighborLegend() {
  return (
    <div className="mt-2.5">
      <div className="text-[10px] text-text-dim uppercase tracking-wider mb-1">Observations</div>
      <div
        className="h-2 rounded-sm border border-border-subtle"
        style={{ background: "linear-gradient(to right, var(--palette-danger) 0%, var(--palette-warn) 60%, var(--palette-green) 100%)" }}
      />
      <div className="relative h-3 mt-0.5 text-[9px] text-text-dim tabular-nums">
        <span className="absolute left-0">1</span>
        <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>20</span>
        <span className="absolute right-0">150+</span>
      </div>
      <div className="text-[9px] text-text-dim mt-1">fainter = heard longer ago</div>
    </div>
  );
}

interface MapSettingsPanelProps {
  styleId: string;
  onStyleChange: (id: string) => void;
  typeFilter: string;
  onTypeChange: (t: string) => void;
  clustered: boolean;
  onClusteredChange: (c: boolean) => void;
  neighborLines: NeighborLinesMode;
  onNeighborLinesChange: (mode: NeighborLinesMode) => void;
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
  buildShareParams,
}: MapSettingsPanelProps) {
  const isMobile = useIsMobile();
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
          Map Settings
        </span>
        <span aria-hidden className="text-text-dim text-[9px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-border-subtle">
          <Section title="Map Tiles" first>
            <MapStyleSwitcher styleId={styleId} onChange={onStyleChange} className="w-full" />
          </Section>
          <Section title="Node Type">
            <SegmentedControl
              wrap
              ariaLabel="Node type"
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={onTypeChange}
            />
          </Section>
          <Section title="Clustering">
            <SegmentedControl
              ariaLabel="Clustering"
              options={CLUSTER_OPTIONS}
              value={clustered ? "on" : "off"}
              onChange={(v) => onClusteredChange(v === "on")}
              className="w-full"
            />
          </Section>
          <Section title="Neighbor Lines">
            <SegmentedControl
              ariaLabel="Neighbor lines"
              options={NEIGHBOR_OPTIONS}
              value={neighborLines}
              onChange={(v) => onNeighborLinesChange(v as NeighborLinesMode)}
              className="w-full"
            />
            {neighborLines === "selected" && <NeighborLegend />}
          </Section>
          <div className="px-3 py-2.5 border-t border-border-subtle flex justify-end">
            <CopyLinkButton
              params={buildShareParams}
              label="Copy map link"
              ariaLabel="Copy a link to this map view"
            />
          </div>
        </div>
      )}
    </div>
  );
}
