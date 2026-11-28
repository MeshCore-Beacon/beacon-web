import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNodeActivity, isNotFound } from "../../api/client";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useDisplayUnits, useFeatures, useFeaturesLoading } from "../../hooks/useFeatures";
import { useTick } from "../../hooks/useTick";
import { formatTemp } from "../../lib/units";
import { mvToVolts } from "../stats/chartOptions";
import type { NodeTelemetryPoint } from "../nodes/types";
import { isPolledNodeType } from "../nodes/polledType";
import { useNodePoller, useNodePolling, useNodeTelemetry } from "../nodes/useNodeTelemetry";
import { loadAtlasNode, summarizeActivity, type NodePin, type AtlasRange } from "./atlas";
import { OBSERVER_RANGE } from "./observer-sample";
import { summarizeTelemetry, telemetryInterval, telemetryRange } from "./telemetry-sample";

export const ATLAS_REFRESH_MS = 60_000;
// A pin whose radio is gone is checked rarely, so it can come back after a reset without costing a poll a minute.
export const ATLAS_MISSING_REFRESH_MS = 600_000;
export const pollUnlessGone = (error: unknown) => (isNotFound(error) ? ATLAS_MISSING_REFRESH_MS : ATLAS_REFRESH_MS);
// A 404 means this server has no such endpoint; nothing to poll for.
export const pollUnlessMissing = (error: unknown) => (isNotFound(error) ? false : ATLAS_REFRESH_MS);

export function useThrottled() {
  return useRateLimit() !== null;
}

// A null pin (an observer-only card) leaves the queries disabled. Activity waits for the node record,
// which settles the server ID to ask about.
export function useAtlasNode(pin: NodePin | null, range: AtlasRange, active: boolean) {
  const now = useTick(ATLAS_REFRESH_MS);
  // Disabling a query drops its timer, so a poll can't fire inside the throttle window.
  const throttled = useThrottled();
  const base = {
    staleTime: ATLAS_REFRESH_MS,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  };
  const query = useQuery({
    ...base,
    queryKey: ["atlas-node", pin?.publicKey ?? null],
    queryFn: ({ signal }) => loadAtlasNode(pin!, signal),
    enabled: pin !== null && active && !throttled,
    refetchInterval: (query) => pollUnlessGone(query.state.error),
  });
  const node = query.data;
  const nodeId = node?.id ?? null;
  const activity = useQuery({
    ...base,
    queryKey: ["atlas-node-activity", nodeId, range],
    queryFn: ({ signal }) => getNodeActivity(nodeId!, OBSERVER_RANGE[range], signal),
    enabled: nodeId !== null && active && !throttled,
    refetchInterval: (query) => pollUnlessMissing(query.state.error),
  });
  const sample = useMemo(() => summarizeActivity(activity.data, range, now), [activity.data, range, now]);
  return {
    query,
    node,
    sample,
    activity: {
      loading: activity.isLoading,
      unsupported: isNotFound(activity.error),
      failed: activity.isError && !isNotFound(activity.error),
    },
  };
}

// Newest value of a field is the last hourly average that carries it, so battery and temperature may come from different hours.
function newest(points: NodeTelemetryPoint[], key: "batteryMv" | "temperatureC"): number | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i]![key];
    if (typeof v === "number") return v;
  }
  return null;
}

// "4.23 V · 16.5 °C" (°F when the instance uses it) for a polled repeater or room server, else null.
// Read only; a card with a Telemetry tab shows the readings there instead.
export function useAtlasReadings(nodeId: string | null, nodeTypeName: string | undefined, active: boolean): string | null {
  const { polling } = useFeatures();
  const { temperature: tempUnit } = useDisplayUnits();
  const throttled = useThrottled();
  const polled = polling && isPolledNodeType(nodeTypeName);
  const { data } = useNodeTelemetry(nodeId ?? undefined, "24h", polled && active && !throttled, ATLAS_REFRESH_MS);
  // The Telemetry tab fills the same cache entry, so cached data alone must not bring the line back.
  if (!polled || !active || !data) return null;
  const volts = mvToVolts(newest(data.points, "batteryMv"));
  const temp = newest(data.points, "temperatureC");
  const parts = [volts != null && `${volts.toFixed(2)} V`, temp != null && formatTemp(temp, tempUnit)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// Does this node get a Telemetry tab? It is a polled type on a server with polling, and either the
// polling route says it is polled or the readings route holds something from the last 30 days. The
// polling route is one small request per card; the 30-day check only runs for a node it does not call
// polled, and only while `look` is true (the card is on a tab that needs the answer).
export function useTelemetryTab(nodeId: string | null, nodeTypeName: string | undefined, active: boolean, look: boolean) {
  const { polling: on } = useFeatures();
  const featuresLoading = useFeaturesLoading();
  const throttled = useThrottled();
  const eligible = on && isPolledNodeType(nodeTypeName);
  const ask = eligible && active && !throttled && nodeId !== null;
  const route = useNodePolling(nodeId ?? undefined, ask);
  const routePolled = route.data?.polled === true;
  const history = useNodeTelemetry(nodeId ?? undefined, "720h", ask && look && route.isFetched && !routePolled, undefined);
  const hasHistory = !!history.data && history.data.points.length > 0;
  return {
    available: eligible && (routePolled || hasHistory),
    // Still finding out, so a card pinned to the tab does not flash another one first.
    settling: nodeId === null || featuresLoading || (ask && (!route.isFetched || (look && !routePolled && history.isPending && !history.isError))),
    polling: route.data,
  };
}

// Does this node get a Poller tab? The server calls it a poller, polling is on, it is linked to its
// observer and the poller route answers with a claim. One small request per poller card. A 404 or a
// missing claim takes the tab away; a failed read does not, so a card pinned to it can say so.
export function usePollerTab(node: { id: string; isPoller?: boolean } | undefined, observerId: string | null, active: boolean) {
  const { polling } = useFeatures();
  const featuresLoading = useFeaturesLoading();
  const throttled = useThrottled();
  const eligible = polling && !!node?.isPoller && observerId !== null;
  const ask = eligible && active && !throttled;
  const query = useNodePoller(node?.id, ask, ATLAS_REFRESH_MS);
  return {
    available: eligible && query.state === "ready",
    // Still finding out, so a card pinned to the tab does not flash another one first.
    settling: !node || featuresLoading || (ask && query.state === "loading"),
    poller: eligible ? query.data : undefined,
    loading: query.isLoading,
    failed: ask && query.state === "failed",
    refreshFailed: eligible && query.refreshFailed,
    refetch: query.refetch,
  };
}

// The polled readings behind the Telemetry tab, for the card's range. One query, made only while the tab is showing.
export function useAtlasTelemetry(nodeId: string | null, range: AtlasRange, enabled: boolean) {
  const { atlasTelemetry } = useFeatures();
  const now = useTick(ATLAS_REFRESH_MS);
  const throttled = useThrottled();
  const query = useNodeTelemetry(nodeId ?? undefined, telemetryRange(range, atlasTelemetry), enabled && !throttled, ATLAS_REFRESH_MS, telemetryInterval(range));
  const sample = useMemo(() => summarizeTelemetry(query.data, range, now), [query.data, range, now]);
  return { sample, loading: query.isLoading, failed: query.isError, unsupported: query.unsupported };
}
