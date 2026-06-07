import { useMemo, useRef, useLayoutEffect, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { getChannelMessagesPage } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { channelDisplayName } from "./types";
import type { ChannelSummary, ChannelMessage } from "./types";

// hash the sender name so their color stays consistent
const SENDER_COLORS = [
  "text-primary",
  "text-secondary",
  "text-green",
  "text-warn",
  "text-danger",
];

function senderColor(name: string): string {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length] ?? "text-primary";
}

function MessageRow({ msg, heardCount, onAnalyze }: { msg: ChannelMessage; heardCount?: number; onAnalyze?: (hash: string) => void }) {
  // REST carries the server-side total; the live WS counter augments it during the session
  const reach = Math.max(msg.observationCount ?? 0, heardCount ?? 0);
  return (
    <div
      className={`px-3 py-2${onAnalyze ? " cursor-pointer hover:bg-bg-surface transition-colors" : ""}`}
      onClick={onAnalyze ? () => onAnalyze(msg.packetHash) : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span className={`text-xs font-semibold font-mono ${senderColor(msg.senderName)}`}>
          {msg.senderName}
        </span>
        <Timestamp value={msg.sentAt} className="text-[11px] text-text-dim" />
        {reach > 0 && <Badge variant="text">×{reach}</Badge>}
      </div>
      <div className="text-text-normal text-xs mt-0.5">{msg.content}</div>
    </div>
  );
}

interface MessagePanelProps {
  channel: ChannelSummary | null;
  heardCounts: Record<string, number>;
  iatas?: string[];
  regionKey: string;
  onAnalyze?: (packetHash: string) => void;
}

export function MessagePanel({ channel, heardCounts, iatas, regionKey, onAnalyze }: MessagePanelProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["channel-messages", channel?.id, regionKey],
    queryFn: ({ pageParam }) => getChannelMessagesPage(channel!.id, { iatas, cursor: pageParam, limit: 50 }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialPageParam: undefined as number | undefined,
    enabled: channel !== null,
    staleTime: 30_000,
  });

  // pages come back newest-first per batch; the ascending sort below restores chat order, so the
  // flatten order doesn't matter
  const messages = useMemo(() => data?.pages.flatMap((p) => p.items), [data]);

  const sorted = useMemo(
    () => [...(messages ?? [])].sort((a, b) => a.sentAt - b.sentAt),
    [messages],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // remember which channel we've anchored, and how many messages we'd scrolled past
  const scrollAnchor = useRef<{ channelId?: number; count: number }>({ count: 0 });
  // a load-older fetch is in flight; remember the pre-prepend scroll metrics so we can hold position
  const prepend = useRef<{ pending: boolean; prevHeight: number; prevTop: number }>({
    pending: false,
    prevHeight: 0,
    prevTop: 0,
  });

  // reset scroll-tracking state when switching channels (adjust state during render, not in an effect)
  const [prevChannelId, setPrevChannelId] = useState(channel?.id);
  if (prevChannelId !== channel?.id) {
    setPrevChannelId(channel?.id);
    setUserScrolled(false);
  }

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const anchor = scrollAnchor.current;

    if (anchor.channelId !== channel?.id) {
      // first batch for this channel — wait for the fetch, then jump to the bottom (no animation)
      if (isLoading) return;
      anchor.channelId = channel?.id;
      anchor.count = sorted.length;
      prepend.current = { pending: false, prevHeight: 0, prevTop: 0 };
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }

    if (prepend.current.pending) {
      // an older page just prepended — restore the prior view by re-adding the height it introduced,
      // so the message the user was reading stays put instead of jumping (overflow-anchor is off, so
      // this math is the only thing moving the scroll)
      prepend.current.pending = false;
      if (el) el.scrollTop = prepend.current.prevTop + (el.scrollHeight - prepend.current.prevHeight);
      anchor.count = sorted.length;
      return;
    }

    if (sorted.length > anchor.count && !userScrolled) {
      // a live message landed mid-session — glide down to it
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    anchor.count = sorted.length;
  }, [sorted.length, channel?.id, isLoading, userScrolled]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
    // near the top: pull the next, older page and remember the metrics so we can hold position
    if (el.scrollTop < 40 && hasNextPage && !isFetchingNextPage) {
      prepend.current = { pending: true, prevHeight: el.scrollHeight, prevTop: el.scrollTop };
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm font-mono">
        Select a channel
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg-base">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-baseline gap-2">
          <span className="text-text-bright text-sm font-mono">
            {channelDisplayName(channel)}
          </span>
          <span className="text-text-dim text-[11px] font-mono">hash: {channel.channelHash}</span>
        </div>
        <div className="flex gap-1">
          {channel.keyKnown ? (
            <Badge variant="advert">key known</Badge>
          ) : (
            <Badge variant="offline">no key</Badge>
          )}
          {channel.isHashtag && <Badge variant="group">hashtag</Badge>}
        </div>
      </div>

      {!channel.keyKnown && (
        <div className="px-3 py-1.5 bg-warn/5 border-b border-warn/20 text-warn text-xs font-mono">
          Key not known, messages may not be decrypted
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto [overflow-anchor:none]"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
            Loading...
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="py-2 flex flex-col divide-y divide-border/40">
            {isFetchingNextPage && (
              <div className="py-1.5 text-center text-text-muted text-[11px] font-mono">Loading older…</div>
            )}
            {sorted.map((msg) => (
              <MessageRow key={msg.id} msg={msg} heardCount={heardCounts[msg.packetHash]} onAnalyze={onAnalyze} />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
            No messages
          </div>
        )}
      </div>
    </div>
  );
}
