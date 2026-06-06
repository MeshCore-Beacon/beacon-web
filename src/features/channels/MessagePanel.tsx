import { useMemo, useRef, useLayoutEffect, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChannelMessages } from "../../api/client";
import { Badge } from "../../components/Badge";
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

function formatMessageTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
        <span className="text-[11px] text-text-dim">{formatMessageTime(msg.sentAt)}</span>
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
  const { data: messages, isLoading } = useQuery({
    queryKey: ["channel-messages", channel?.id, regionKey],
    queryFn: () => getChannelMessages(channel!.id, { iatas, limit: 50 }),
    enabled: channel !== null,
    staleTime: 30_000,
  });

  const sorted = useMemo(
    () => [...(messages ?? [])].sort((a, b) => a.sentAt - b.sentAt),
    [messages],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // remember which channel we've anchored, and how many messages we'd scrolled past
  const scrollAnchor = useRef<{ channelId?: number; count: number }>({ count: 0 });

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
      if (el) el.scrollTop = el.scrollHeight;
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
  }, []);

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

      <div className="flex-1 overflow-y-auto" ref={scrollContainerRef} onScroll={handleScroll}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
            Loading...
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="py-2 flex flex-col divide-y divide-border/40">
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
