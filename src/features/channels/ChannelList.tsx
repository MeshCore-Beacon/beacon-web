import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useWsChannelMessageHandler } from "../../hooks/useWsHandlers";
import { SkeletonRows } from "../../components/SkeletonRows";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChannelFilterBar } from "./ChannelFilterBar";
import { MessagePanel } from "./MessagePanel";
import { filterChannels, type ChannelKeyFilter, type ChannelHashtagFilter } from "./channel-filters";
import type { ChannelMessage, ChannelSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";

interface ChannelListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

export function ChannelList({ wsManager, onAnalyze }: ChannelListProps) {
  const { iatas, regionKey } = useRegion();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [keyFilter, setKeyFilter] = useState<ChannelKeyFilter>("");
  const [hashtagFilter, setHashtagFilter] = useState<ChannelHashtagFilter>("");
  const queryClient = useQueryClient();

  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      setSelectedId(null);
      setHeardCounts({});
      setSearch("");
      setKeyFilter("");
      setHashtagFilter("");
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

  // "Public" pinned first, then named channels, then unnamed by most recent
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

  const filteredChannels = useMemo(
    () => filterChannels(sortedChannels, { search, searchField, keyFilter, hashtagFilter }),
    [sortedChannels, search, searchField, keyFilter, hashtagFilter],
  );

  // resolve against the full list so a selected channel keeps showing even when filtered out
  const selectedChannel = sortedChannels.find((ch) => ch.id === selectedId) ?? null;

  const handleChannelMessage = useCallback(
    (data: ChannelMessage) => {
      // bump lastSeen, or refetch the list if this is a channel we haven't seen yet
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
        // same message, multiple observer paths — count the reach
        setHeardCounts((prev) => ({
          ...prev,
          [data.packetHash]: (prev[data.packetHash] ?? 0) + 1,
        }));
        // append to the newest InfiniteData page; MessagePanel re-sorts by sentAt, so the page is arbitrary
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

  // mobile: opening a thread takes over the whole view, hiding the list and filter bar
  const showList = !isMobile || selectedChannel === null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {showList && (
        <ChannelFilterBar
          search={search}
          onSearchChange={setSearch}
          searchField={searchField}
          onSearchFieldChange={setSearchField}
          keyFilter={keyFilter}
          onKeyChange={setKeyFilter}
          hashtagFilter={hashtagFilter}
          onHashtagChange={setHashtagFilter}
        />
      )}
      <div className="flex flex-1 min-h-0">
        {showList && (
          <div className="flex flex-col min-h-0 w-full md:w-56 md:min-w-56 border-r border-border bg-bg-surface">
            {isLoading ? (
              <SkeletonRows rows={8} />
            ) : (
              <ChannelSidebar
                channels={filteredChannels}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            )}
          </div>
        )}
        {(!isMobile || selectedChannel !== null) && (
          <MessagePanel
            channel={selectedChannel}
            heardCounts={heardCounts}
            iatas={iatas}
            regionKey={regionKey}
            onAnalyze={onAnalyze}
            onBack={isMobile ? () => setSelectedId(null) : undefined}
          />
        )}
      </div>
    </div>
  );
}
