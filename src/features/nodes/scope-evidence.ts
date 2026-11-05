import type { NodeScope, NodeSummary } from "./types";

export type ScopeHours = 1 | 6 | 24;
export const parseScopeHours = (value: unknown): ScopeHours => Number(value) === 1 ? 1 : Number(value) === 6 ? 6 : 24;
export const repeatCount = (scope: NodeScope, hours: ScopeHours = 24) => hours === 1 ? scope.repeatObservations1h ?? 0 : hours === 6 ? scope.repeatObservations6h ?? 0 : scope.repeatObservations;
export type ScopeMatch = "repeated" | "any" | "default" | "none";
export function matchesScope(node: Pick<NodeSummary,"defaultScope"|"scopeEvidence">, name: string, mode: ScopeMatch, hours: ScopeHours) {
  const stats = nodeScopeStats(node,hours);
  if (mode === "none") return !!node.scopeEvidence && stats.totalRepeatObservations === 0;
  if (mode === "default") return !name || node.defaultScope === name;
  if (mode === "any") return !name || stats.scopeNames.includes(name);
  return name ? (stats.scopeRepeats[name] ?? 0) > 0 : stats.totalRepeatObservations > 0;
}
export function nodeScopeStats(node: Pick<NodeSummary, "defaultScope" | "scopeEvidence">, hours: ScopeHours = 24) {
  const names = new Set<string>();
  const repeats: Record<string, number> = Object.create(null);
  const valid = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128;
  for (const scope of node.scopeEvidence?.scopes ?? []) {
    if (!valid(scope.name)) continue;
    names.add(scope.name);
    const value = repeatCount(scope,hours);
    const count = Number.isSafeInteger(value) && value > 0 ? value : 0;
    repeats[scope.name] = Math.max(repeats[scope.name] ?? 0, count);
  }
  if (valid(node.defaultScope)) names.add(node.defaultScope);
  let most = 0, dominant: string | null = null, total = 0;
  for (const name of names) {
    const count = repeats[name] ?? 0; total += count;
    if (count > most) { most = count; dominant = name; }
    else if (count === most) dominant = null;
  }
  return { scopeNames: [...names].sort(), scopeRepeats: repeats, repeatScope: dominant === "?" ? null : dominant, totalRepeatObservations: total };
}
