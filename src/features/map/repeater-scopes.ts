import type { ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { NodeFeatureProps } from "./node-geojson";
import { nodeIconId } from "./types";

export const SCOPE_CLUSTER_ICON = "node-scope-cluster";
export const MAX_COLORED_SCOPES = 64;
export const SCOPE_IMAGE_PREFIX = "scope-";
export const scopeImageId = (color: string, base: string) => `${SCOPE_IMAGE_PREFIX}${color.slice(1)}-${base}`;

export interface ScopeEntry { name: string; color: string }
export interface RepeaterScopeStyle {
  key: string;
  entries: ScopeEntry[];
  neutral: string;
  overflow: boolean;
  pointColor: ExpressionSpecification;
  clusterColor: ExpressionSpecification;
  clusterProperties: Record<string, [string, ExpressionSpecification]>;
  imageIds: string[];
}

// Scope names are case-sensitive transport-key identities. Do not fold case or
// guess an unreported scope from geography, neighbours or a short node hash.
export function reportedScope(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : undefined;
}

// Name-derived colours stay stable across panning, pagination and region changes.
// A darker tone keeps the same hue legible against light basemaps.
export function scopeColor(name: string, dark: boolean): string {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619) >>> 0;
  const hue = hash % 360;
  const saturation = (70 + ((hash >>> 12) % 16)) / 100;
  const lightness = (dark ? 58 + ((hash >>> 24) % 8) : 30 + ((hash >>> 24) % 8)) / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function buildRepeaterScopeStyle(fc: FeatureCollection<Point, NodeFeatureProps>, dark: boolean): RepeaterScopeStyle {
  const totals = new Map<string, number>();
  for (const f of fc.features) {
    if (f.properties.nodeTypeName !== "repeater") continue;
    for (const [i, name] of (f.properties.scopeNames ?? []).entries()) {
      if (name !== "?" && reportedScope(name)) totals.set(name, (totals.get(name) ?? 0) + (f.properties.scopeRepeatValues?.[i] ?? 0));
    }
  }
  // Keep the busiest scopes visible when a world view exceeds the sprite budget.
  const names = [...totals.keys()].sort((a,b) => totals.get(b)! - totals.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
  const entries = names.slice(0, MAX_COLORED_SCOPES).sort().map(name => ({ name, color: scopeColor(name, dark) }));
  const neutral = dark ? "#94a3b8" : "#64748b";
  const repeater: ExpressionSpecification = ["==", ["get", "nodeTypeName"], "repeater"];
  const scope: ExpressionSpecification = ["coalesce", ["get", "repeatScope"], ""];
  const pointColor: ExpressionSpecification = entries.length
    ? ["match", scope, ...entries.flatMap(e => [e.name, e.color]), neutral] as ExpressionSpecification
    : ["literal", neutral];
  const weights: ExpressionSpecification[] = entries.map(e => ["let", "scopeIndex", ["index-of", e.name, ["coalesce", ["get", "scopeNames"], ["literal", []]]],
    ["case", [">=", ["var", "scopeIndex"], 0], ["number", ["at", ["var", "scopeIndex"], ["coalesce", ["get", "scopeRepeatValues"], ["literal", []]]], 0], 0]]);
  const clusterProperties: RepeaterScopeStyle["clusterProperties"] = {
    scopeFocusCount: ["+", ["case", ["boolean", ["get", "scopeFocus"], true], 1, 0]],
    scopeRepeaters: ["+", ["case", repeater, 1, 0]],
    scopeUnknown: ["+", ["case", repeater, ["max", 0, ["-", ["number", ["get", "totalRepeatObservations"], 0], ["+", 0, ...weights]]], 0]],
  };
  entries.forEach((_, i) => {
    clusterProperties[`scope${i}`] = ["+", ["case", repeater, weights[i]!, 0]];
  });
  const counts: ExpressionSpecification[] = entries.map((_, i) => ["get", `scope${i}`]);
  const allCounts: ExpressionSpecification[] = [...counts, ["get", "scopeUnknown"]];
  // Sum observed repeat reports, never configured memberships or advert defaults.
  // Overflow traffic competes too; ties and a lack of repeat evidence stay neutral.
  const clusterColor: ExpressionSpecification = ["let", "most", ["max", 0, ...allCounts],
    ["case", ["all", [">", ["var", "most"], 0],
      ["==", ["+", 0, ...allCounts.map<ExpressionSpecification>(c => ["case", ["==", c, ["var", "most"]], 1, 0])], 1],
      ["<", ["get", "scopeUnknown"], ["var", "most"]]],
    entries.length ? ["case", ...entries.flatMap((e, i) => [["==", counts[i]!, ["var", "most"]], e.color]), neutral] : neutral,
    neutral]] as ExpressionSpecification;
  const colors = [...new Set([...entries.map(e => e.color), neutral])];
  return {
    key: JSON.stringify([neutral, entries]), entries, neutral, overflow: names.length > entries.length,
    pointColor, clusterColor, clusterProperties,
    imageIds: colors.flatMap(color => [nodeIconId("repeater"), `${nodeIconId("repeater")}-observer`, SCOPE_CLUSTER_ICON].map(base => scopeImageId(color, base))),
  };
}

export function scopePointImage(style: RepeaterScopeStyle | null, base: ExpressionSpecification): ExpressionSpecification {
  return style ? ["case", ["==", ["get", "nodeTypeName"], "repeater"],
    ["concat", SCOPE_IMAGE_PREFIX, ["slice", style.pointColor, 1], "-", base], base] : base;
}

export function scopeClusterImage(style: RepeaterScopeStyle | null, base: ExpressionSpecification): ExpressionSpecification {
  return style ? ["case", [">", ["get", "scopeRepeaters"], 0],
    ["concat", SCOPE_IMAGE_PREFIX, ["slice", style.clusterColor, 1], `-${SCOPE_CLUSTER_ICON}`], base] : base;
}

export interface ScopeLegendRow { name: string | null; color: string; count: number; repeats: number; kind: "named" | "unknown" | "other" | "empty" | "unmatched" }
export interface MapBounds { getWest(): number; getEast(): number; getSouth(): number; getNorth(): number }

// O(loaded nodes), on settled camera/data changes only. Bounds counts are not
// cluster leaf counts: a cluster near the edge may include offscreen members.
export function visibleScopeRows(fc: FeatureCollection<Point, NodeFeatureProps>, style: RepeaterScopeStyle, bounds: MapBounds): ScopeLegendRow[] {
  const palette = new Map(style.entries.map(e => [e.name, e.color]));
  const rows = new Map<string, ScopeLegendRow>();
  const west = bounds.getWest(), east = bounds.getEast();
  const span = east - west;
  const width = Math.abs(span) >= 360 ? 360 : (span + 360) % 360;
  for (const f of fc.features) {
    if (f.properties.nodeTypeName !== "repeater") continue;
    const [lng, lat] = f.geometry.coordinates;
    if (lng === undefined || lat === undefined || lat < bounds.getSouth() || lat > bounds.getNorth()) continue;
    if (width < 360 && ((lng - west) % 360 + 360) % 360 > width) continue;
    const names = f.properties.scopeNames?.length ? f.properties.scopeNames : [undefined];
    const counted = new Set<string>();
    for (const name of names) {
      const kind = name === "?" ? "unmatched" : !name ? f.properties.scopeReportedEmpty ? "empty" : "unknown" : palette.has(name) ? "named" : "other";
      const key = kind === "named" ? `name:${name}` : kind;
      const row = rows.get(key) ?? { name: kind === "named" || kind === "unmatched" ? name! : null, color: name ? palette.get(name) ?? style.neutral : style.neutral, count: 0, repeats: 0, kind };
      if (!counted.has(key)) { row.count++; counted.add(key); }
      row.repeats += name ? f.properties.scopeRepeatValues?.[f.properties.scopeNames!.indexOf(name)] ?? 0 : 0;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.repeats - a.repeats || b.count - a.count || (a.name ?? a.kind).localeCompare(b.name ?? b.kind));
}
