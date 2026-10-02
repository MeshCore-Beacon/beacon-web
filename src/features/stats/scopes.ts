import type { TFunction } from "i18next";
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

export function scopeChartOption(rows: ScopeStats[], metric: ScopeMetric, colors: ChartColors, t: TFunction): EChartsOption {
  const indices = new Map(rows.map((row) => row.name).sort().map((name, index) => [name, index]));
  const ranked = rows.map((row) => ({ name: row.name, value: row[metric], color: colors.series[(indices.get(row.name) ?? 0) % colors.series.length] ?? colors.primary }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const shown = ranked.slice(0, 12);
  if (ranked.length > 12) shown.push({ name: t("scopes.other"), value: ranked.slice(12).reduce((sum, row) => sum + row.value, 0), color: colors.textDim });
  return { ...leaderboardOption(shown, colors, 126), tooltip: { trigger: "item", renderMode: "richText", ...tooltipStyle(colors) },
    aria: { enabled: true, label: { description: t("scopes.chartDescription") } } };
}

// Per-hour scoped packets and active scopes for the shown rows. The series says which hours are rolled:
// an hour missing from a scope's hourly is zero, an unrolled hour is a gap. Older servers send no hourly.
export function scopeHourly(rows: ScopeStats[], hours: { hour: number; status: string }[] | undefined) {
  if (!hours || rows.some((row) => !row.hourly)) return null;
  const byHour = new Map<number, number[]>();
  for (const row of rows) {
    for (const { hour, packets } of row.hourly ?? []) {
      if (packets > 0) byHour.set(hour, [...(byHour.get(hour) ?? []), packets]);
    }
  }
  const complete = hours.map((h) => (h.status === "complete" ? (byHour.get(h.hour) ?? []) : null));
  return {
    packets: complete.map((counts) => counts && counts.reduce((a, b) => a + b, 0)),
    active: complete.map((counts) => counts && counts.length),
  };
}
