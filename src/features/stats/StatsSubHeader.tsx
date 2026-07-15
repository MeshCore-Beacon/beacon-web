import { Segmented } from "./Segmented";
import { SelectDropdown } from "../../components/SelectDropdown";
import { useIsMobile } from "../../hooks/useMediaQuery";
import type { StatsRange, StatsTab } from "./types";

function MeshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="3" cy="3" r="1.6" />
      <circle cx="11" cy="4" r="1.6" />
      <circle cx="7" cy="11" r="1.6" />
      <path d="M4.3 3.6 9.7 4.4M3.6 4.4 6.4 9.6M10.4 5.4 7.7 9.7" strokeOpacity="0.7" />
    </svg>
  );
}

function ObserverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="7" cy="9.5" r="1.4" />
      <path d="M7 8V4M4.5 6.5a3.5 3.5 0 0 1 5 0M2.7 4.7a6 6 0 0 1 8.6 0" strokeOpacity="0.85" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="7" cy="7" r="1.7" />
      <circle cx="2.4" cy="3" r="1.3" />
      <circle cx="11.6" cy="3.4" r="1.3" />
      <circle cx="4" cy="12" r="1.3" />
      <circle cx="11" cy="11" r="1.3" />
      <path d="M3.3 3.7 5.6 6M10.4 4 8.4 6M5.2 8.2 4.3 10.7M8.5 8.1 10.2 9.9" strokeOpacity="0.7" />
    </svg>
  );
}

const TAB_OPTIONS = [
  { value: "mesh", label: "Mesh", icon: <MeshIcon /> },
  { value: "observer", label: "Observer", icon: <ObserverIcon /> },
  { value: "graph", label: "Neighbour Graph", icon: <GraphIcon /> },
];

// Same sections, minus icons, for the mobile dropdown (which is text-only). Scales with TAB_OPTIONS.
const TAB_SELECT_OPTIONS = TAB_OPTIONS.map(({ value, label }) => ({ value, label }));

const RANGE_OPTIONS = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

interface Props {
  tab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
}

export function StatsSubHeader({ tab, onTabChange, range, onRangeChange }: Props) {
  const isMobile = useIsMobile();
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-surface px-4 py-2.5">
      {/* pills don't scale on a phone as sections grow — swap to a compact dropdown there */}
      {isMobile ? (
        <SelectDropdown
          label="Section"
          hideAll
          align="left"
          options={TAB_SELECT_OPTIONS}
          value={tab}
          onChange={(v) => onTabChange(v as StatsTab)}
        />
      ) : (
        <div className="min-w-0 max-w-full overflow-x-auto">
          <Segmented
            options={TAB_OPTIONS}
            value={tab}
            onChange={(v) => onTabChange(v as StatsTab)}
            ariaLabel="Stats section"
            size="md"
          />
        </div>
      )}
      {/* the graph is topology, not time-series — no range to pick */}
      {tab !== "graph" && (
        <Segmented
          className="shrink-0"
          options={RANGE_OPTIONS}
          value={range}
          onChange={(v) => onRangeChange(v as StatsRange)}
          ariaLabel="Time range"
        />
      )}
    </div>
  );
}
