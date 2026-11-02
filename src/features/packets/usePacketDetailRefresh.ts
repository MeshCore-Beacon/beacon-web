import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const DETAIL_REFRESH_MS = 5_000;

// A busy packet's detail runs to megabytes, so the open row refetches it at most once per window,
// trailing: an observation heard mid-window is always picked up when the window ends.
export function usePacketDetailRefresh(hash: string | null): (packetHash: string) => void {
  const queryClient = useQueryClient();
  const observe = useRef<(packetHash: string) => void>(() => {});

  useEffect(() => {
    if (!hash) return;
    const filters = { queryKey: ["packet-detail", hash], exact: true };
    const options = { cancelRefetch: false };
    let lastStart = Date.now(); // opening the row fetches it
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;

    const refetch = async () => {
      // a fetch still running began before these observations, so join it and go again after
      if (queryClient.isFetching(filters) > 0) await queryClient.refetchQueries(filters, options);
      if (!live) return;
      pending = false;
      lastStart = Date.now();
      void queryClient.invalidateQueries(filters, options);
    };

    observe.current = (packetHash) => {
      if (packetHash !== hash || pending) return;
      pending = true;
      const wait = lastStart + DETAIL_REFRESH_MS - Date.now();
      if (wait > 0) timer = setTimeout(() => void refetch(), wait);
      else void refetch();
    };

    return () => {
      live = false;
      clearTimeout(timer);
      observe.current = () => {};
    };
  }, [hash, queryClient]);

  return useCallback((packetHash: string) => observe.current(packetHash), []);
}
