import type { CursorPage } from "../../types/api";

export interface ChannelPage extends CursorPage<ChannelSummary> {
  nextPageCursor?: string; // opaque precise cursor; older servers only return nextCursor
}

export interface ChannelSummary {
  id: number;
  name: string | null;
  channelHash: string;
  lastSeen: number; // epoch ms, time of most recent message
  isHashtag: boolean;
  keyKnown: boolean;
}

export interface ChannelDetail extends ChannelSummary {
  hashtag: string | null;
  keyFingerprint: string | null;
  messageCount: number;
}

export function channelDisplayName(ch: ChannelSummary): string {
  if (!ch.name) return ch.channelHash;
  if (ch.isHashtag || ch.name === "Public") return ch.name;
  return `#${ch.name}`;
}

export interface ChannelMessage {
  isPublic?: boolean; // Live event: decryption used the documented default Public key.
  id: number;
  packetHash: string;
  channelHash: string;
  senderName: string;
  content: string;
  sentAt: number; // epoch ms, from the sender's embedded timestamp
  observationCount?: number;
  channelId?: number; // supplied by live events; channel history already has an ID-specific endpoint
  scope?: string | null; // absent on older servers, null when no name was recorded
  scopeStatus?: "matched" | "unscoped" | "unknown" | "unavailable";
}
