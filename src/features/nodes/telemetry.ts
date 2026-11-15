import type { NodeTelemetry } from "./types";

// Something to chart: the node is polled and the range holds at least one point.
export function hasNodeTelemetry(t: NodeTelemetry | undefined): boolean {
  return !!t && t.polled && t.points.length > 0;
}
