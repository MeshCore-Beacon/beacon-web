import { useSyncExternalStore } from "react";
import type { WsManager, WsStatus } from "../api/ws-manager";

export function useWsStatus(manager: WsManager): { status: WsStatus } {
  const status = useSyncExternalStore(
    (cb) => manager.onStatusChange(cb),
    () => manager.getStatus(),
  );

  return { status };
}
