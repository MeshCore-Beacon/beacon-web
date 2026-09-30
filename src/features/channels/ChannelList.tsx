import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useInfiniteQuery, useIsFetching, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getChannels } from "../../api/client";
import { isRateLimited, subscribeRateLimit } from "../../api/rate-limit";
import { LIVE_BUFFER_CAP, MAX_INFINITE_PAGES } from "../../lib/constants";
import { useRegion } from "../../hooks/useRegion";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { useWsChannelMessageHandler } from "../../hooks/useWsHandlers";
import { SkeletonRows } from "../../components/SkeletonRows";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChannelFilterBar } from "./ChannelFilterBar";
import { MessagePanel } from "./MessagePanel";
import { filterChannels, type ChannelKeyFilter, type ChannelHashtagFilter } from "./channel-filters";
import type { ChannelMessage, ChannelPage, ChannelSummary } from "./types";
import type { CursorPage } from "../../types/api";
import type { WsManager } from "../../api/ws-manager";

interface ChannelListProps {
  wsManager: WsManager;
  onAnalyze: (hash: string | null) => void;
}

function appendMessages(old: InfiniteData<CursorPage<ChannelMessage>> | undefined, messages: ChannelMessage[]) {
  if (!old) return old;
  const known = new Set(old.pages.flatMap((page) => page.items.map((message) => message.packetHash)));
  const added = messages.filter((message) => !known.has(message.packetHash));
  if (!added.length) return old;
  return { ...old, pages: old.pages.map((page, index) => index === 0 ? { ...page, items: [...page.items, ...added] } : page) };
}

export function ChannelList({ wsManager, onAnalyze }: ChannelListProps) {
  const { iatas, regionKey } = useRegion();
  const isMobile = useIsMobile();
  // Keep the open channel available when a directory page is evicted or refreshed.
  const [selection, setSelection] = useState<ChannelSummary | null>(null);
  const selectedId = selection?.id ?? null;
  const [heardCounts, setHeardCounts] = useState<Record<string, number>>({});
  const [messageScope, setMessageScope] = useState("");
  const [search, setSearch] = useState("");
  const [searchField, setSearchField] = useState("name");
  const [keyFilter, setKeyFilter] = useState<ChannelKeyFilter>("");
  const [hashtagFilter, setHashtagFilter] = useState<ChannelHashtagFilter>("");
  const queryClient = useQueryClient();
  const refreshPending = useRef(false);
  const pendingMessages = useRef(new Map<string, ChannelMessage>());
  const messagesOverflowed = useRef(false);
  const messageKey = useMemo(() => ["channel-messages", selectedId, regionKey, messageScope], [selectedId, regionKey, messageScope]);
  const messageFetching = useIsFetching({ queryKey: messageKey, exact: true });

  const flushPending = useCallback(() => {
    if (queryClient.isFetching({ queryKey: messageKey, exact: true })) return;
    if (messagesOverflowed.current) {
      if (isRateLimited()) return;
      messagesOverflowed.current = false;
      pendingMessages.current.clear();
      void queryClient.invalidateQueries({ queryKey: messageKey, exact: true });
    } else if (pendingMessages.current.size && queryClient.getQueryData(messageKey)) {
      // Merge live arrivals after history settles so its older snapshot cannot erase them.
      const queued = [...pendingMessages.current.values()];
      pendingMessages.current.clear();
      queryClient.setQueryData<InfiniteData<CursorPage<ChannelMessage>>>(messageKey, (old) => appendMessages(old, queued));
    }
  }, [messageKey, queryClient]);

  useEffect(() => {
    flushPending();
  }, [messageFetching, flushPending]);

  // An overflow parked behind a 429 would otherwise sit until the user switches channel.
  useEffect(() => subscribeRateLimit(flushPending), [flushPending]);

  const prevRegion = useRef(regionKey);
  useEffect(() => {
    if (prevRegion.current !== regionKey) {
      prevRegion.current = regionKey;
      refreshPending.current = false;
      pendingMessages.current.clear();
      messagesOverflowed.current = false;
      setSelection(null);
      setHeardCounts({});
      setMessageScope("");
      setSearch("");
      setKeyFilter("");
      setHashtagFilter("");
    }
  }, [regionKey]);

  const { data, isLoading, isFetching, isError, fetchNextPage, hasNextPage, refetch } = useInfiniteQuery({
    queryKey: ["channels", regionKey],
    queryFn: ({ pageParam }) => getChannels({ iatas, cursor: pageParam }),
    initialPageParam: undefined as number | string | undefined,
    getNextPageParam: (last) => last.hasMore ? last.nextPageCursor ?? last.nextCursor ?? undefined : undefined,
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
    pendingMessages.current.clear();
    messagesOverflowed.current = false;
    setSelection(channels.find((ch) => ch.id === id) ?? null);
    setHeardCounts({});
  }, [channels]);

  const handleScopeChange = useCallback((scope: string) => {
    pendingMessages.current.clear();
    messagesOverflowed.current = false;
    setMessageScope(scope);
  }, []);

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
      const cached = queryClient.getQueryData<InfiniteData<ChannelPage>>(key);
      const cachedChannels = cached?.pages.flatMap((p) => p.items) ?? [];
      const matchesChannel = (ch: ChannelSummary) => data.channelId !== undefined ? ch.id === data.channelId : ch.channelHash === data.channelHash;
      const known = cachedChannels.find(matchesChannel);
      if (known) {
        // Display timestamps may change; the server's page cursors must not.
        queryClient.setQueryData<InfiniteData<ChannelPage>>(key, (old) => old && ({
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
      if (selected && matchesChannel(selected) && (!messageScope || data.scope === messageScope)) {
        if (queryClient.isFetching({ queryKey: messageKey, exact: true }) || !queryClient.getQueryData(messageKey)) {
          if (pendingMessages.current.size >= LIVE_BUFFER_CAP && !pendingMessages.current.has(data.packetHash)) {
            messagesOverflowed.current = true;
          } else pendingMessages.current.set(data.packetHash, data);
        }
        // A fresh arrival is the only signal left once idle-and-overflowed, so try recovery here too.
        flushPending();
        // The WS event has no retained observation total; repeats do not add observers.
        setHeardCounts((prev) => ({
          ...prev,
          [data.packetHash]: Math.max(prev[data.packetHash] ?? 0, data.observationCount ?? 1),
        }));
        // Append to the retained newest page; browsing older history must not evict it.
        queryClient.setQueryData<InfiniteData<CursorPage<ChannelMessage>>>(
          messageKey,
          (old) => appendMessages(old, [data]),
        );
      }
    },
    [queryClient, selectedId, selection, regionKey, messageScope, messageKey, flushPending],
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
            scope={messageScope}
            onScopeChange={handleScopeChange}
            onAnalyze={onAnalyze}
            onBack={isMobile ? () => setSelection(null) : undefined}
          />
        )}
      </div>
    </div>
  );
}
