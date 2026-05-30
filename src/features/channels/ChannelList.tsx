import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useWsChannelMessageHandler } from "../../hooks/useWsHandlers";
import { SkeletonRows } from "../../components/SkeletonRows";
import { ChannelSidebar } from "./ChannelSidebar";
import { MessagePanel } from "./MessagePanel";
import type { ChannelMessage, ChannelSummary } from "./types";
import type { WsManager } from "../../api/ws-manager";

interface ChannelListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

export function ChannelList({ wsManager, onAnalyze }: ChannelListProps) {
  const region = useRegion();
  const iata = region === "*" ? undefined : region;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

  const prevRegion = useRef(region);
  useEffect(() => {
    if (prevRegion.current !== region) {
      prevRegion.current = region;
      setSelectedId(null);
      setHeardCounts({});
    }
  }, [region]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setHeardCounts({});
  }, []);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels", region],
    queryFn: () => getChannels({ iata }),
    staleTime: 60_000,
  });

  // "Public" always first, then named channels, then unnamed by most recent
  const sortedChannels = useMemo(
    () =>
      [...(channels ?? [])].sort((a, b) => {
        const aPub = a.name === "Public" ? 1 : 0;
        const bPub = b.name === "Public" ? 1 : 0;
        if (aPub !== bPub) return bPub - aPub;
        if (a.name && !b.name) return -1;
        if (!a.name && b.name) return 1;
        return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      }),
    [channels],
  );

  const selectedChannel = sortedChannels.find((ch) => ch.id === selectedId) ?? null;

  const handleChannelMessage = useCallback(
    (data: ChannelMessage) => {
      // bump lastSeen in the channel list, or refetch if it's a channel we haven't seen
      queryClient.setQueryData<ChannelSummary[]>(["channels", region], (old) => {
        if (!old) return old;
        const idx = old.findIndex((ch) => ch.channelHash === data.channelHash);
        if (idx === -1) {
          queryClient.invalidateQueries({ queryKey: ["channels", region] });
          return old;
        }
        const updated = [...old];
        updated[idx] = { ...updated[idx]!, lastSeen: data.sentAt };
        return updated;
      });

      // use cache directly to avoid stale closure over selectedChannel
      const cached = queryClient.getQueryData<ChannelSummary[]>(["channels", region]);
      const selected = cached?.find((ch) => ch.id === selectedId);
      if (selected && data.channelHash === selected.channelHash) {
        // track how many observers heard this packet (same content, multiple paths)
        setHeardCounts((prev) => ({
          ...prev,
          [data.packetHash]: (prev[data.packetHash] ?? 0) + 1,
        }));
        queryClient.setQueryData<ChannelMessage[]>(
          ["channel-messages", selectedId, region],
          (old) => {
            if (old?.some((msg) => msg.packetHash === data.packetHash)) return old;
            return old ? [...old, data] : [data];
          },
        );
      }
    },
    [queryClient, selectedId, region],
  );

  useWsChannelMessageHandler(wsManager, handleChannelMessage);

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0">
        <div className="w-64 border-r border-border shrink-0">
          <SkeletonRows rows={8} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      <ChannelSidebar
        channels={sortedChannels}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
      <MessagePanel channel={selectedChannel} heardCounts={heardCounts} iata={iata} region={region} onAnalyze={onAnalyze} />
    </div>
  );
}
