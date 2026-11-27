import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getObserver } from "../../api/client";
import { resolveObserverNode } from "../atlas/atlas";

// The node record an observer's radio advertises as, or null. Shares the ["observer", id] cache with the dashboard.
function observerNodeQuery(client: QueryClient, id: string) {
  return {
    queryKey: ["observer-node", id],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const observer = await client.fetchQuery({ queryKey: ["observer", id], queryFn: () => getObserver(id), staleTime: 30_000, retry: false });
      return (await resolveObserverNode(observer, signal)) ?? null;
    },
    staleTime: 300_000,
    // a click waits on this, so a failure falls back to the dashboard at once rather than after retries
    retry: false,
  };
}

export const fetchObserverNode = (client: QueryClient, id: string) => client.fetchQuery(observerNodeQuery(client, id));

export function useObserverNode(id: string | null) {
  const client = useQueryClient();
  return useQuery({ ...observerNodeQuery(client, id ?? ""), enabled: !!id, refetchOnWindowFocus: false });
}
