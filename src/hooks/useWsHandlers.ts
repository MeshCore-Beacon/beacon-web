import { useEffect } from "react";
import type { WsManager } from "../api/ws-manager";
import type { WsPacketObservation, WsLagged } from "../types/ws";

export function useWsPacketHandler(
  manager: WsManager,
  handler: (data: WsPacketObservation["data"]) => void,
): void {
  useEffect(() => {
    return manager.onPacketObservation(handler);
  }, [manager, handler]);
}

export function useWsLaggedHandler(
  manager: WsManager,
  handler: (data: WsLagged) => void,
): void {
  useEffect(() => {
    return manager.onLagged(handler);
  }, [manager, handler]);
}
