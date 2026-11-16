import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLatestNodeTelemetry } from "../../api/client";
import type { NodeLatestReading } from "../nodes/types";

const EMPTY = new Map<string, NodeLatestReading>();

// Latest polled reading per node for the selected region, refetched every 5 minutes while on.
export function useMapTelemetry(selectedIatas: string[] | undefined, regionKey: string, enabled: boolean): Map<string, NodeLatestReading> {
  const { data } = useQuery({
    queryKey: ["map-telemetry", regionKey],
    queryFn: () => getLatestNodeTelemetry(selectedIatas),
    enabled,
    refetchInterval: 300_000,
  });
  return useMemo(() => (enabled && data ? new Map(data.items.map((r) => [r.nodeId, r])) : EMPTY), [enabled, data]);
}
