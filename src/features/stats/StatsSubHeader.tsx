import { Segmented } from "./Segmented";
import { useTranslation } from "react-i18next";
import { SelectDropdown } from "../../components/SelectDropdown";
import { useIsMobile } from "../../hooks/useMediaQuery";
import type { StatsRange, StatsTab } from "./types";

function TrafficIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <path d="M2 11.5h10M3.5 9V6.5M7 9V2.5M10.5 9V4.5" strokeLinecap="round" />
  </svg>;
}

function ScopesIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <circle cx="5" cy="7" r="3.5" /><circle cx="9" cy="7" r="3.5" strokeDasharray="2 1.5" />
  </svg>;
}

function CompareIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <path d="M3.5 2v10M10.5 2v10M1.5 4h4M8.5 10h4M5.5 7h3" strokeLinecap="round" />
    <circle cx="3.5" cy="4" r="1.5" fill="currentColor" /><circle cx="10.5" cy="10" r="1.5" fill="currentColor" />
  </svg>;
}

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

function SignalIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <path d="M1 7h2l2-4 3.5 8L11 5l1 2h1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function TalkersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M2 3.2h10v6H6.5L4 11.4V9.2H2z" strokeLinejoin="round" />
      <path d="M4.4 5.4h5.2M4.4 7.1h3.2" strokeOpacity="0.7" />
    </svg>
  );
}

function ClockDriftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="7" cy="7" r="5.2" />
      <path d="M7 4v3l2.1 1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PathsIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
    <circle cx="2.5" cy="3" r="1.5" /><circle cx="11.5" cy="11" r="1.5" />
    <path d="M4 3h4a2 2 0 0 1 0 4H6a2 2 0 0 0 0 4h4" strokeLinecap="round" />
  </svg>;
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
  { value: "mesh", icon: <MeshIcon /> },
  { value: "traffic", icon: <TrafficIcon /> },
  { value: "signal", icon: <SignalIcon /> },
  { value: "paths", icon: <PathsIcon /> },
  { value: "scopes", icon: <ScopesIcon /> },
  { value: "talkers", icon: <TalkersIcon /> },
  { value: "clockdrift", icon: <ClockDriftIcon /> },
  { value: "observer", icon: <ObserverIcon /> },
  { value: "compare", icon: <CompareIcon /> },
  { value: "graph", icon: <GraphIcon /> },
];

const RANGES: StatsRange[] = ["24h", "7d", "30d"];

interface Props {
  tab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  range: StatsRange;
  onRangeChange: (range: StatsRange) => void;
}

export function StatsSubHeader({ tab, onTabChange, range, onRangeChange }: Props) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const tabOptions = TAB_OPTIONS.map((option) => ({ ...option, label: t(`stats.tabs.${option.value}`) }));
  const rangeOptions = RANGES.map((value) => ({ value, label: t(`stats.ranges.${value}`) }));
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-surface px-4 py-2.5">
      {/* pills don't scale on a phone as sections grow — swap to a compact dropdown there */}
      {isMobile ? (
        <SelectDropdown
          label={t("stats.mobileSection")}
          hideAll
          align="left"
          options={tabOptions}
          value={tab}
          onChange={(v) => onTabChange(v as StatsTab)}
        />
      ) : (
        <div className="min-w-0 max-w-full overflow-x-auto">
          <Segmented
            options={tabOptions}
            value={tab}
            onChange={(v) => onTabChange(v as StatsTab)}
            ariaLabel={t("stats.section")}
            size="md"
          />
        </div>
      )}
      {/* Comparison has explicit dates; graph and clock drift have no rolling window. */}
      {tab !== "graph" && tab !== "clockdrift" && tab !== "compare" && tab !== "scopes" && (
        <Segmented
          className="shrink-0"
          options={rangeOptions}
          value={range}
          onChange={(v) => onRangeChange(v as StatsRange)}
          ariaLabel={t("stats.timeRange")}
        />
      )}
    </div>
  );
}
