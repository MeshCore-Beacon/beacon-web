import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useWsChannelMessageHandler } from "../../hooks/useWsHandlers";
import { SkeletonRows } from "../../components/SkeletonRows";
import { ChannelSidebar } from "./ChannelSidebar";
import { MessagePanel } from "./MessagePanel";
import type { ChannelMessage, ChannelSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";

interface ChannelListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

export function ChannelList({ wsManager, onAnalyze }: ChannelListProps) {
  const { iatas, regionKey } = useRegion();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const queryClient = useQueryClient();

  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedId(null);
      setHeardCounts({});
    }
  }, [regionKey]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    setHeardCounts({});
  }, []);

  const { data: channels, isLoading } = useQuery({
    queryKey: ["channels", regionKey],
    queryFn: () => getChannels({ iatas }),
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
        return b.lastSeen - a.lastSeen;
      }),
    [channels],
  );

  const selectedChannel = sortedChannels.find((ch) => ch.id === selectedId) ?? null;

  const handleChannelMessage = useCallback(
    (data: ChannelMessage) => {
      // bump lastSeen in the channel list, or refetch if it's a channel we haven't seen
      queryClient.setQueryData<ChannelSummary[]>(["channels", regionKey], (old) => {
        if (!old) return old;
        const idx = old.findIndex((ch) => ch.channelHash === data.channelHash);
        if (idx === -1) {
          queryClient.invalidateQueries({ queryKey: ["channels", regionKey] });
          return old;
        }
        const updated = [...old];
        updated[idx] = { ...updated[idx]!, lastSeen: data.sentAt };
        return updated;
      });

      // use cache directly to avoid stale closure over selectedChannel
      const cached = queryClient.getQueryData<ChannelSummary[]>(["channels", regionKey]);
      const selected = cached?.find((ch) => ch.id === selectedId);
      if (selected && data.channelHash === selected.channelHash) {
        // track how many observers heard this packet (same content, multiple paths)
        setHeardCounts((prev) => ({
          ...prev,
          [data.packetHash]: (prev[data.packetHash] ?? 0) + 1,
        }));
        // MessagePanel reads this key as a paginated InfiniteData; append the live message to the
        // newest page (re-sorted by sentAt there, so the exact page doesn't matter)
        queryClient.setQueryData<InfiniteData<CursorPage<ChannelMessage>>>(
          ["channel-messages", selectedId, regionKey],
          (old) => {
            if (!old) return old;
            if (old.pages.some((p) => p.items.some((msg) => msg.packetHash === data.packetHash))) return old;
            const pages = old.pages.map((p, i) => (i === 0 ? { ...p, items: [...p.items, data] } : p));
            return { ...old, pages };
          },
        );
      }
    },
    [queryClient, selectedId, regionKey],
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
      <MessagePanel channel={selectedChannel} heardCounts={heardCounts} iatas={iatas} regionKey={regionKey} onAnalyze={onAnalyze} />
    </div>
  );
}
