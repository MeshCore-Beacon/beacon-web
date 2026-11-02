import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { WsManager } from "../api/ws-manager";
import { WS_HIDDEN_PAUSE_MS } from "../lib/constants";

// Live views patch their caches from the feed, so after a pause every active query refetches.
export function usePauseWhenHidden(manager: WsManager): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") {
        timer = setTimeout(() => manager.pause(), WS_HIDDEN_PAUSE_MS);
      } else if (manager.resume()) {
        void queryClient.invalidateQueries();
      }
    };
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, [manager, queryClient]);
}
