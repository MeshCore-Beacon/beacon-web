import type { ScopeStats } from "./types";
import { leaderboardOption } from "./chartOptions";
import { tooltipStyle, type ChartColors } from "./chartTheme";
import type { EChartsOption } from "./echarts-setup";

export type ScopeMetric = "packetCount" | "observerCount" | "nodeCount";

export function scopeSummary(rows: ScopeStats[]) {
  return rows.reduce((summary, row) => ({
    active: summary.active + (row.packetCount || row.observerCount || row.nodeCount ? 1 : 0),
    packets: summary.packets + row.packetCount,
    memberships: summary.memberships + row.observerCount,
    nodes: summary.nodes + row.nodeCount,
  }), { active: 0, packets: 0, memberships: 0, nodes: 0 });
}

export function scopeChartOption(rows: ScopeStats[], metric: ScopeMetric, colors: ChartColors): EChartsOption {
  const indices = new Map(rows.map((row) => row.name).sort().map((name, index) => [name, index]));
  const ranked = rows.map((row) => ({ name: row.name, value: row[metric], color: colors.series[(indices.get(row.name) ?? 0) % colors.series.length] ?? colors.primary }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const shown = ranked.slice(0, 12);
  if (ranked.length > 12) shown.push({ name: "Other scopes", value: ranked.slice(12).reduce((sum, row) => sum + row.value, 0), color: colors.textDim });
  return { ...leaderboardOption(shown, colors, 126), tooltip: { trigger: "item", renderMode: "richText", ...tooltipStyle(colors) },
    aria: { enabled: true, label: { description: "Counts by transport scope. Exact values for all matching scopes are listed in the table." } } };
}
