import { useMemo, useRef, useLayoutEffect, useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getChannelMessagesPage } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Timestamp } from "../../components/Timestamp";
import { LoadingPill } from "../../components/LoadingPill";
import { ScopeTag } from "../../components/ScopeTag";
import { SelectDropdown } from "../../components/SelectDropdown";
import { useScopes } from "../../hooks/useScopes";
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

// Packet hash also identifies messages delivered by older servers without a live ID.
function MessageRow({ msg, heardCount, onAnalyze }: { msg: ChannelMessage; heardCount?: number; onAnalyze?: (hash: string) => void }) {
  const { t } = useTranslation();
  // REST carries the server-side total; the live WS counter augments it during the session
  const reach = Math.max(msg.observationCount ?? 0, heardCount ?? 0);
  return (
    <div
      className={`group px-3 py-2${onAnalyze ? " cursor-pointer hover:bg-bg-surface transition-colors" : ""}`}
      onClick={onAnalyze ? () => onAnalyze(msg.packetHash) : undefined}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`text-xs font-semibold font-mono break-all ${senderColor(msg.senderName)}`}>
          {msg.senderName}
        </span>
        <Timestamp value={msg.sentAt} className="text-[11px] text-text-dim" />
        {reach > 0 && <span title={t("channelMessages.heardTimes", { count: reach })}>
          <Badge variant="text"><span aria-hidden>×{reach}</span><span className="sr-only">{t("channelMessages.heardTimes", { count: reach })}</span></Badge>
        </span>}
        {/* Unscoped is the default, so only a named or unresolved scope earns a chip. */}
        {msg.scope ? <ScopeTag boxed className="max-w-full break-all">{msg.scope}</ScopeTag>
          : msg.scopeStatus === "unknown" && <span className="rounded-sm bg-text-normal/5 px-1.5 py-px font-mono text-[11px] text-text-dim">{t("channelMessages.unknownScope")}</span>}
        {onAnalyze && <button type="button" aria-label={t("channelMessages.inspect", { sender: msg.senderName })}
          className="ml-auto shrink-0 cursor-pointer font-mono text-[11px] text-text-dim transition-colors hover:text-primary group-hover:text-primary"
          onClick={(event) => { event.stopPropagation(); onAnalyze(msg.packetHash); }}>{t("channelMessages.viewPacket")} ›</button>}
      </div>
      <div className="text-text-normal text-xs mt-0.5 whitespace-pre-wrap break-words">{msg.content}</div>
    </div>
  );
}

interface MessagePanelProps {
  channel: ChannelSummary | null;
  heardCounts: Record<string, number>;
  iatas?: string[];
  regionKey: string;
  onAnalyze?: (packetHash: string) => void;
  // mobile-only: renders a back button, since here the panel replaces the channel list
  onBack?: () => void;
  scope?: string;
  onScopeChange?: (scope: string) => void;
}

export function MessagePanel({ channel, heardCounts, iatas, regionKey, onAnalyze, onBack, scope = "", onScopeChange }: MessagePanelProps) {
  const { t } = useTranslation();
  const scopeNames = useScopes(scope);
  const { data, isLoading, isError, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["channel-messages", channel?.id, regionKey, scope],
    queryFn: ({ pageParam }) => getChannelMessagesPage(channel!.id, { iatas, cursor: pageParam, limit: 50, scope }),
    getNextPageParam: (last) => last.hasMore ? last.nextCursor ?? undefined : undefined,
    initialPageParam: undefined as number | undefined,
    enabled: channel !== null,
    staleTime: 30_000,
  });

  // flatten order is irrelevant — the ascending sort below restores chat order from newest-first pages
  const messages = useMemo(() => {
    const unique = new Map<string, ChannelMessage>();
    for (const page of data?.pages ?? []) {
      for (const message of page.items) if (!unique.has(message.packetHash)) unique.set(message.packetHash, message);
    }
    return [...unique.values()];
  }, [data]);

  const sorted = useMemo(
    () => [...(messages ?? [])].sort((a, b) => a.sentAt - b.sentAt),
    [messages],
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewKey = `${channel?.id ?? ""}:${scope}`;
  const scrollAnchor = useRef<{ view?: string; count: number }>({ count: 0 });
  // pre-prepend scroll metrics, captured while a load-older fetch is in flight
  const prepend = useRef<{ pending: boolean; prevHeight: number; prevTop: number }>({
    pending: false,
    prevHeight: 0,
    prevTop: 0,
  });

  // reset scroll tracking on channel switch — adjust state during render, not in an effect
  const [prevView, setPrevView] = useState(viewKey);
  if (prevView !== viewKey) {
    setPrevView(viewKey);
    setUserScrolled(false);
  }

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    const anchor = scrollAnchor.current;

    if (anchor.view !== viewKey) {
      // first batch for this channel — jump to the bottom once it lands
      if (isLoading) return;
      anchor.view = viewKey;
      anchor.count = sorted.length;
      prepend.current = { pending: false, prevHeight: 0, prevTop: 0 };
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }

    if (prepend.current.pending) {
      // older page prepended — re-add its height to hold the read position (overflow-anchor is off)
      prepend.current.pending = false;
      if (el) el.scrollTop = prepend.current.prevTop + (el.scrollHeight - prepend.current.prevHeight);
      anchor.count = sorted.length;
      return;
    }

    if (sorted.length > anchor.count && !userScrolled) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" }); // live message arrived; follow it down
    }
    anchor.count = sorted.length;
  }, [sorted.length, viewKey, isLoading, userScrolled]);

  const loadOlder = useCallback(() => {
    if (!hasNextPage || isFetching) return;
    const el = scrollContainerRef.current;
    prepend.current = { pending: true, prevHeight: el?.scrollHeight ?? 0, prevTop: el?.scrollTop ?? 0 };
    void fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setUserScrolled(!atBottom);
    // near the top: pull the next older page, capturing metrics so the prepend can hold position
    if (el.scrollTop < 40) loadOlder();
  }, [loadOlder]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm font-mono">
        {t("channelMessages.select")}
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-w-0 bg-bg-base">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-baseline gap-2 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("channelMessages.back")}
              className="self-center flex items-center justify-center w-9 h-9 -ml-1.5 rounded text-text-muted hover:text-text-bright hover:bg-text-normal/5 cursor-pointer transition-colors shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <span className="text-text-bright text-sm font-mono truncate">
            {channelDisplayName(channel)}
          </span>
          <span className="text-text-dim text-[11px] font-mono truncate">{t("channelMessages.hash", { hash: channel.channelHash })}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onScopeChange && <SelectDropdown label={t("channelMessages.scope")} value={scope} onChange={onScopeChange}
            allLabel={t("channelMessages.allScopes")} options={scopeNames.map((name) => ({ value: name, label: name }))} align="right" />}
          {channel.keyKnown ? (
            <Badge variant="advert">{t("channelMessages.keyKnown")}</Badge>
          ) : (
            <Badge variant="offline">{t("channelMessages.noKey")}</Badge>
          )}
          {channel.isHashtag && <Badge variant="group">{t("channelMessages.hashtag")}</Badge>}
        </div>
      </div>

      {!channel.keyKnown && (
        <div className="px-3 py-1.5 bg-warn/5 border-b border-warn/20 text-warn text-xs font-mono">
          {t("channelMessages.keyMissing")}
        </div>
      )}

      {isError && <div role="alert" className="px-3 py-2 text-xs text-danger">{t("channelMessages.error")} <button type="button" disabled={isFetching} className="underline cursor-pointer" onClick={() => void refetch()}>{t("channelMessages.retry")}</button></div>}

      <div
        className="flex-1 overflow-y-auto [overflow-anchor:none]"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
            {t("channelMessages.loading")}
          </div>
        ) : messages && messages.length > 0 ? (
          <div className="py-2 flex flex-col divide-y divide-border/40">
            {hasNextPage && <button type="button" disabled={isFetching} className="px-3 py-2 text-xs text-primary cursor-pointer disabled:opacity-40" onClick={loadOlder}>{t("channelMessages.loadOlder")}</button>}
            {sorted.map((msg) => (
              <MessageRow key={msg.packetHash || msg.id} msg={msg} heardCount={heardCounts[msg.packetHash]} onAnalyze={onAnalyze} />
            ))}
            <div ref={bottomRef} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
            {t(!channel.keyKnown ? "channelMessages.emptyNoKey" : scope ? "channelMessages.emptyScope" : "channelMessages.empty", { scope })}
          </div>
        )}
      </div>

      {/* floats over the panel (not the scroll area) so older-page fetches don't shift it */}
      <LoadingPill loading={isFetchingNextPage} count={sorted.length} noun="messages" label={t("channelMessages.loadingOlder", { count: sorted.length })} position="bottom-3 left-1/2 -translate-x-1/2" />
    </div>
  );
}
