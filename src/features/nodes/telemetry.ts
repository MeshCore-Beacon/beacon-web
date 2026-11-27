import type { NodeTelemetry } from "./types";

// Something to chart: the node is polled and the range holds at least one point.
export function hasNodeTelemetry(t: NodeTelemetry | undefined): boolean {
  return !!t && t.polled && t.points.length > 0;
}

// Airtime is an increment over the span the server reports, so a rate needs that span. No span, or
// a result over 100, means the data is unusable: leave a gap rather than stretch the axis.
export function airtimePct(secs: number | undefined, span: number | undefined): number | null {
  if (secs == null || !span) return null;
  const raw = (secs * 100) / span;
  return raw > 100 ? null : Math.round(raw * 1000) / 1000;
}
