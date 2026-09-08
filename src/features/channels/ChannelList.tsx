import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { isRateLimited } from "../../api/rate-limit";
import { MAX_INFINITE_PAGES } from "../../lib/constants";
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
  // Keep the open channel available when a directory page is evicted or refreshed.
  const [selection, setSelection] = useState<ChannelSummary | null>(null);
  const selectedId = selection?.id ?? null;
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [keyFilter, setKeyFilter] = useState<ChannelKeyFilter>("");
  const [hashtagFilter, setHashtagFilter] = useState<ChannelHashtagFilter>("");
  const queryClient = useQueryClient();
  const refreshPending = useRef(false);

  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      refreshPending.current = false;
      setSelection(null);
      setHeardCounts({});
      setSearch("");
      setKeyFilter("");
      setHashtagFilter("");
    }
  }, [regionKey]);

  const { data, isLoading, isFetching, isError, fetchNextPage, hasNextPage, refetch } = useInfiniteQuery({
    queryKey: ["channels", regionKey],
    queryFn: ({ pageParam }) => getChannels({ iatas, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.hasMore ? last.nextCursor ?? undefined : undefined,
    maxPages: MAX_INFINITE_PAGES,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!isFetching && refreshPending.current) {
      refreshPending.current = false;
      void queryClient.resetQueries({ queryKey: ["channels", regionKey], exact: true });
    }
  }, [isFetching, queryClient, regionKey]);

  const channels = useMemo(() => {
    const byId = new Map<number, ChannelSummary>();
    for (const page of data?.pages ?? []) {
      for (const channel of page.items) {
        if (!byId.has(channel.id)) byId.set(channel.id, channel);
      }
    }
    return [...byId.values()];
  }, [data]);

  const handleSelect = useCallback((id: number) => {
    setSelection(channels.find((ch) => ch.id === id) ?? null);
    setHeardCounts({});
  }, [channels]);

  // "Public" pinned first, then named channels, then unnamed by most recent
  const sortedChannels = useMemo(
    () =>
      [...channels].sort((a, b) => {
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

  const selectedChannel = channels.find((ch) => ch.id === selectedId) ?? selection;

  const handleChannelMessage = useCallback(
    (data: ChannelMessage) => {
      const key = ["channels", regionKey];
      const cached = queryClient.getQueryData<InfiniteData<CursorPage<ChannelSummary>>>(key);
      const cachedChannels = cached?.pages.flatMap((p) => p.items) ?? [];
      const known = cachedChannels.find((ch) => ch.channelHash === data.channelHash);
      if (known) {
        // Display timestamps may change; the server's page cursors must not.
        queryClient.setQueryData<InfiniteData<CursorPage<ChannelSummary>>>(key, (old) => old && ({
          ...old,
          pages: old.pages.map((p) => ({ ...p, items: p.items.map((ch) => ch.id === known.id
            ? { ...ch, lastSeen: Math.max(ch.lastSeen, data.sentAt) } : ch) })),
        }));
      } else if (!isRateLimited()) {
        // An unknown live channel needs a fresh first page, not a replay of every loaded page.
        if (queryClient.isFetching({ queryKey: key, exact: true })) refreshPending.current = true;
        else void queryClient.resetQueries({ queryKey: key, exact: true });
      }

      const selected = cachedChannels.find((ch) => ch.id === selectedId) ?? selection;
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
    [queryClient, selectedId, selection, regionKey],
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
            {!isLoading && filteredChannels.length === 0 && (
              <p className="px-3 py-2 text-xs font-mono text-text-muted">No matching channels loaded.</p>
            )}
            {isError && <p role="alert" className="px-3 py-2 text-xs text-danger">Could not load channels.</p>}
            {(hasNextPage || isError) && (
              <button
                type="button"
                disabled={isFetching}
                onClick={() => hasNextPage ? fetchNextPage() : refetch()}
                className="m-2 shrink-0 rounded border border-border px-3 py-1.5 text-xs font-mono text-text-normal hover:bg-text-normal/3 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isFetching ? "Loading channels..." : isError ? "Retry loading channels" : "Load more channels"}
              </button>
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
            onBack={isMobile ? () => setSelection(null) : undefined}
          />
        )}
      </div>
    </div>
  );
}
