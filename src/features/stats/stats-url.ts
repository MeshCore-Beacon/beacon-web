import type { StatsRange, StatsTab } from "./types";

// Sub-tab and range live in the URL (?statsTab/?range); kept out of the lazy Analytics chunk so the
// shell can read them to prefetch.
export const STATS_TABS: StatsTab[] = ["mesh", "traffic", "signal", "paths", "scopes", "talkers", "clockdrift", "compare", "graph"];
export const STATS_RANGES: StatsRange[] = ["24h", "7d", "30d"];

export const asStatsTab = (v: string | null): StatsTab => (STATS_TABS.includes(v as StatsTab) ? (v as StatsTab) : "mesh");
export const asStatsRange = (v: string | null): StatsRange => (STATS_RANGES.includes(v as StatsRange) ? (v as StatsRange) : "7d");
