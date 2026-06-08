import { describe, it, expect } from "vitest";
import { filterChannels, type ChannelFilters } from "../../../src/features/channels/channel-filters";
import type { ChannelSummary } from "../../../src/features/channels/types";

const ch = (over: Partial<ChannelSummary>): ChannelSummary => ({
  id: 1,
  name: null,
  channelHash: "ab",
  lastSeen: 0,
  isHashtag: false,
  keyKnown: false,
  ...over,
});

const NONE: ChannelFilters = { search: "", searchField: "name", keyFilter: "", hashtagFilter: "" };

const channels: ChannelSummary[] = [
  ch({ id: 1, name: "Public", keyKnown: true, channelHash: "11" }),
  ch({ id: 2, name: "weather", isHashtag: true, keyKnown: true, channelHash: "22" }),
  ch({ id: 3, name: null, keyKnown: false, channelHash: "deadbeef" }),
];

describe("filterChannels", () => {
  it("returns all channels when no filters are set", () => {
    expect(filterChannels(channels, NONE)).toHaveLength(3);
  });

  it("searches by display name (case-insensitive substring)", () => {
    const out = filterChannels(channels, { ...NONE, search: "WEATH" });
    expect(out.map((c) => c.id)).toEqual([2]);
  });

  it("searches by hash when the search field is hash", () => {
    const out = filterChannels(channels, { ...NONE, search: "dead", searchField: "hash" });
    expect(out.map((c) => c.id)).toEqual([3]);
  });

  it("filters by key known / unknown", () => {
    expect(filterChannels(channels, { ...NONE, keyFilter: "known" }).map((c) => c.id)).toEqual([1, 2]);
    expect(filterChannels(channels, { ...NONE, keyFilter: "unknown" }).map((c) => c.id)).toEqual([3]);
  });

  it("filters by hashtag", () => {
    expect(filterChannels(channels, { ...NONE, hashtagFilter: "true" }).map((c) => c.id)).toEqual([2]);
    expect(filterChannels(channels, { ...NONE, hashtagFilter: "false" }).map((c) => c.id)).toEqual([1, 3]);
  });

  it("combines filters (AND)", () => {
    const out = filterChannels(channels, { ...NONE, keyFilter: "known", hashtagFilter: "false" });
    expect(out.map((c) => c.id)).toEqual([1]);
  });
});
