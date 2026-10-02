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

// Per-hour activity for the shown rows. The series says which hours are rolled: an hour missing from a
// scope's hourly is zero, an unrolled hour is a gap. Like the cards, observers and nodes add up per scope.
// Hours outside `window` (what the scopes fetch covered) are gaps too, since its hourly can't speak for them.
export function scopeHourly(rows: ScopeStats[], hours: { hour: number; status: string }[] | undefined, window?: { since: number; until: number }) {
  if (!hours || rows.some((row) => !row.hourly)) return null;
  const zero = { packets: 0, active: 0, observers: 0, nodes: 0 };
  const byHour = new Map<number, typeof zero>();
  let hasActivity = true;
  for (const row of rows) {
    for (const entry of row.hourly ?? []) {
      if (entry.observers === undefined || entry.nodes === undefined) hasActivity = false;
      const observers = entry.observers ?? 0, nodes = entry.nodes ?? 0;
      const sum = byHour.get(entry.hour) ?? { ...zero };
      byHour.set(entry.hour, {
        packets: sum.packets + entry.packets,
        active: sum.active + (entry.packets || observers || nodes ? 1 : 0),
        observers: sum.observers + observers,
        nodes: sum.nodes + nodes,
      });
    }
  }
  const covered = (hour: number) => !window || (hour >= window.since && hour < window.until);
  const slots = hours.map((h) => (h.status === "complete" && covered(h.hour) ? (byHour.get(h.hour) ?? zero) : null));
  const line = (key: keyof typeof zero) => slots.map((slot) => slot && slot[key]);
  return {
    packets: line("packets"),
    active: line("active"),
    observers: hasActivity ? line("observers") : undefined,
    nodes: hasActivity ? line("nodes") : undefined,
  };
}
