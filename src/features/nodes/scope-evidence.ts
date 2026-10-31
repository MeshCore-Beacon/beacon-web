import type { NodeSummary } from "./types";

export function nodeScopeStats(node: Pick<NodeSummary, "defaultScope" | "scopeEvidence">) {
  const names = new Set<string>();
  const repeats: Record<string, number> = Object.create(null);
  const valid = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 128;
  for (const scope of node.scopeEvidence?.scopes ?? []) {
    if (!valid(scope.name)) continue;
    names.add(scope.name);
    const count = Number.isSafeInteger(scope.repeatObservations) && scope.repeatObservations > 0 ? scope.repeatObservations : 0;
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
