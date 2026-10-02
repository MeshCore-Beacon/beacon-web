import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";
import type { StatsRange } from "./types";

// When the selected observer reports a status update, refresh its header + telemetry so battery,
// uptime, and the newest points reflect the change. Status messages are infrequent, so a refetch is fine.
export function useLiveObserver(wsManager: WsManager, observerId: string | null, range: StatsRange) {
  const qc = useQueryClient();

  const onStatus = useCallback(
    (data: WsObserverStatus["data"]) => {
      if (!observerId || data.observerId !== observerId) return;
      qc.invalidateQueries({ queryKey: ["observer", observerId] });
      qc.invalidateQueries({ queryKey: ["observer-telemetry", observerId, range] });
    },
    [qc, observerId, range],
  );

  useWsObserverStatusHandler(wsManager, onStatus);
}
