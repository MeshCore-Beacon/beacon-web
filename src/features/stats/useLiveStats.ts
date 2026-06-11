import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import { useWsPacketHandler, useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import type { WsManager } from "../../api/ws-manager";
import type { WsPacketObservation, WsObserverStatus } from "../../types/ws";
import type { StatsOverview, StatsRange } from "./types";

// Live overview KPIs: every packetObservation bumps the cached overview counters (no refetch). High
// frequency, so increments are coalesced and flushed once per animation frame. The overview query also
// refetches periodically (useStatsOverview) so the live deltas self-correct against the server.
// both totalPackets and totalObservations feed the top KPIs, so both bumps count.
export function useLiveOverview(wsManager: WsManager) {
  const { regionKey } = useRegion();
  const qc = useQueryClient();
  const pending = useRef({ packets: 0, obs: 0 });
  const raf = useRef<number | null>(null);

  const flush = useCallback(() => {
    raf.current = null;
    const { packets, obs } = pending.current;
    if (!packets && !obs) return;
    pending.current = { packets: 0, obs: 0 };
    qc.setQueryData<StatsOverview>(["stats-overview", regionKey], (old) =>
      old
        ? { ...old, totalPackets: old.totalPackets + packets, totalObservations: old.totalObservations + obs }
        : old,
    );
  }, [qc, regionKey]);

  const onPacket = useCallback(
    (data: WsPacketObservation["data"]) => {
      pending.current.obs += 1;
      if (data.packet?.isFirstObservation) pending.current.packets += 1;
      if (raf.current == null) raf.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  useWsPacketHandler(wsManager, onPacket);

  // drop counts accumulated for the previous region so they don't bleed into the new one's KPIs
  useEffect(() => {
    pending.current = { packets: 0, obs: 0 };
  }, [regionKey]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );
}

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
