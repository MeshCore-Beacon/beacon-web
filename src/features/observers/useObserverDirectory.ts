import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getObserversPage } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useWsObserverStatusHandler } from "../../hooks/useWsHandlers";
import { patchObserverSummary } from "./observer-updates";
import type { ObserverSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";
import type { WsObserverStatus } from "../../types/ws";

const PAGE = 200; // the API's list cap
const MAX_PAGES = 10;

// The whole region fits in a page or two, so sorting and the other filters stay client-side and instant.
async function allObservers(iatas: string[] | undefined, broker: string): Promise<ObserverSummary[]> {
  const items: ObserverSummary[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await getObserversPage(iatas, { cursor, limit: PAGE, broker: broker || undefined });
    items.push(...page.items);
    if (!page.hasMore || page.nextCursor == null) break;
    cursor = page.nextCursor;
  }
  return items;
}

// The region's observers, kept live by WS status events between the minute refetches.
export function useObserverDirectory(wsManager: WsManager, broker: string) {
  const { iatas, regionKey } = useRegion();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["observer-directory", regionKey, broker], [regionKey, broker]);
  const list = useQuery({ queryKey, queryFn: () => allObservers(iatas, broker), staleTime: 30_000, refetchInterval: 60_000 });
  const onStatus = useCallback(
    (data: WsObserverStatus["data"]) => queryClient.setQueryData<ObserverSummary[]>(queryKey, (old) => patchObserverSummary(old, data)),
    [queryClient, queryKey],
  );
  useWsObserverStatusHandler(wsManager, onStatus);
  return list;
}
