import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNodeActivity, isNotFound } from "../../api/client";
import { useRateLimit } from "../../hooks/useRateLimit";
import { useFeatures } from "../../hooks/useFeatures";
import { useTick } from "../../hooks/useTick";
import { mvToVolts } from "../stats/chartOptions";
import type { NodeTelemetryPoint } from "../nodes/types";
import { isPolledNodeType } from "../nodes/polledType";
import { useNodeTelemetry } from "../nodes/useNodeTelemetry";
import { loadAtlasNode, summarizeActivity, type NodePin, type AtlasRange } from "./atlas";
import { OBSERVER_RANGE } from "./observer-sample";

export const ATLAS_REFRESH_MS = 60_000;
// A pin whose radio is gone is checked rarely, so it can come back after a reset without costing a poll a minute.
export const ATLAS_MISSING_REFRESH_MS = 600_000;
export const pollUnlessGone = (error: unknown) => (isNotFound(error) ? ATLAS_MISSING_REFRESH_MS : ATLAS_REFRESH_MS);
// A 404 means this server has no such endpoint; nothing to poll for.
export const pollUnlessMissing = (error: unknown) => (isNotFound(error) ? false : ATLAS_REFRESH_MS);

// True while the API is throttling us. A timer marks the window over: the flag itself only clears on a
// successful request, and a paused Atlas makes none.
export function useThrottled() {
  const until = useRateLimit();
  const [ended, setEnded] = useState<number | null>(null);
  useEffect(() => {
    if (until === null) return;
    const id = setTimeout(() => setEnded(until), Math.max(0, until - Date.now()));
    return () => clearTimeout(id);
  }, [until]);
  return until !== null && ended !== until;
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

// "4.23 V · 16.5 °C" for a polled repeater or room server, or null when there is nothing to show.
// Reads only; the card's saved shape is untouched.
export function useAtlasReadings(nodeId: string | null, nodeTypeName: string | undefined, active: boolean): string | null {
  const { polling } = useFeatures();
  const throttled = useThrottled();
  const polled = polling && isPolledNodeType(nodeTypeName);
  const { data } = useNodeTelemetry(nodeId ?? undefined, "24h", polled && active && !throttled, ATLAS_REFRESH_MS);
  if (!polled || !data) return null;
  const volts = mvToVolts(newest(data.points, "batteryMv"));
  const temp = newest(data.points, "temperatureC");
  const parts = [volts != null && `${volts.toFixed(2)} V`, temp != null && `${temp.toFixed(1)} °C`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
