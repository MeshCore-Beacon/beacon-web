import { channelDisplayName } from "./types";
import type { ChannelSummary } from "./types";

export type ChannelKeyFilter = "" | "known" | "unknown";
export type ChannelHashtagFilter = "" | "true" | "false";

export interface ChannelFilters {
  search: string;
  searchField: string; // "name" | "hash"
  keyFilter: ChannelKeyFilter;
  hashtagFilter: ChannelHashtagFilter;
}

// client-side channel-list filtering (the list is fully loaded; the backend has no text search)
export function filterChannels(channels: ChannelSummary[], filters: ChannelFilters): ChannelSummary[] {
  const q = filters.search.trim().toLowerCase();
  return channels.filter((ch) => {
    if (q) {
      const haystack = filters.searchField === "hash" ? ch.channelHash : channelDisplayName(ch);
      if (!haystack.toLowerCase().includes(q)) return false;
    }
    if (filters.keyFilter === "known" && !ch.keyKnown) return false;
    if (filters.keyFilter === "unknown" && ch.keyKnown) return false;
    if (filters.hashtagFilter === "true" && !ch.isHashtag) return false;
    if (filters.hashtagFilter === "false" && ch.isHashtag) return false;
    return true;
  });
}
