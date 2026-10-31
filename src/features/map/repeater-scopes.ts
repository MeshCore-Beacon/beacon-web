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
  const names = [...new Set(fc.features.filter(f => f.properties.nodeTypeName === "repeater")
    .map(f => reportedScope(f.properties.defaultScope)).filter((s): s is string => s !== undefined))].sort();
  const entries = names.slice(0, MAX_COLORED_SCOPES).map(name => ({ name, color: scopeColor(name, dark) }));
  const neutral = dark ? "#94a3b8" : "#64748b";
  const repeater: ExpressionSpecification = ["==", ["get", "nodeTypeName"], "repeater"];
  const scope: ExpressionSpecification = ["coalesce", ["get", "defaultScope"], ""];
  const pointColor: ExpressionSpecification = entries.length
    ? ["match", scope, ...entries.flatMap(e => [e.name, e.color]), neutral] as ExpressionSpecification
    : ["literal", neutral];
  const clusterProperties: RepeaterScopeStyle["clusterProperties"] = {
    scopeRepeaters: ["+", ["case", repeater, 1, 0]],
    scopeUnknown: ["+", ["case", ["all", repeater, ["!", ["in", scope, ["literal", entries.map(e => e.name)]]]], 1, 0]],
  };
  entries.forEach((e, i) => {
    clusterProperties[`scope${i}`] = ["+", ["case", ["all", repeater, ["==", scope, e.name]], 1, 0]];
  });
  const counts: ExpressionSpecification[] = entries.map((_, i) => ["get", `scope${i}`]);
  const allCounts: ExpressionSpecification[] = [...counts, ["get", "scopeUnknown"]];
  // Only a unique winner can colour a cluster. Unknown/overflow members compete
  // too, so a lone known scope cannot colour a mostly-unknown cluster.
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

export interface ScopeLegendRow { name: string | null; color: string; count: number; kind: "named" | "unknown" | "other" }
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
    const name = reportedScope(f.properties.defaultScope);
    const kind = !name ? "unknown" : palette.has(name) ? "named" : "other";
    const key = kind === "named" ? `name:${name}` : kind;
    const row = rows.get(key) ?? { name: kind === "named" ? name! : null, color: name ? palette.get(name) ?? style.neutral : style.neutral, count: 0, kind };
    row.count++; rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || (a.name ?? a.kind).localeCompare(b.name ?? b.kind));
}
