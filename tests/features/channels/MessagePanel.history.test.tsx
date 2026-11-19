import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { MessagePanel } from "../../../src/features/channels/MessagePanel";
import { getChannelMessagesPage } from "../../../src/api/client";
import type { ChannelMessage, ChannelSummary } from "../../../src/features/channels/types";

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: undefined, regionKey: "*" }) }));
vi.mock("../../../src/api/client", () => ({ getScopes: vi.fn(async () => []), getChannelMessagesPage: vi.fn() }));

it("keeps the first visible message anchored when a jump to the top starts an older-page request", async () => {
  const channel: ChannelSummary = { id: 1, name: "Public", channelHash: "11", lastSeen: 2000, keyKnown: true, isHashtag: false };
  const latest: ChannelMessage = { id: 2, packetHash: "latest", channelHash: "11", senderName: "sender", content: "Current history", sentAt: 2000 };
  let resolveOlder!: (page: Awaited<ReturnType<typeof getChannelMessagesPage>>) => void;
  vi.mocked(getChannelMessagesPage)
    .mockResolvedValueOnce({ items: [latest], nextCursor: 1000, hasMore: true })
    .mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
  const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
  </QueryClientProvider>);
  await screen.findByText("Current history");
  const scroll = container.querySelector('[class*="overflow-anchor"]') as HTMLDivElement;
  let height = 1000;
  Object.defineProperty(scroll, "scrollHeight", { get: () => height });
  Object.defineProperty(scroll, "clientHeight", { value: 200 });
  scroll.scrollTop = 800;
  scroll.scrollTop = 0;
  fireEvent.scroll(scroll);
  await waitFor(() => expect(getChannelMessagesPage).toHaveBeenCalledTimes(2));
  expect(scroll.scrollTop).toBe(0);
  height = 1400;
  await act(async () => resolveOlder({ items: [{ ...latest, id: 1, packetHash: "older", content: "Older history", sentAt: 500 }], nextCursor: null, hasMore: false }));
  await screen.findByText("Older history");
  expect(scroll.scrollTop).toBe(400);
});

const channel: ChannelSummary = { id: 1, name: "Public", channelHash: "11", lastSeen: 2000, keyKnown: true, isHashtag: false };
const latest: ChannelMessage = { id: 2, packetHash: "latest", channelHash: "11", senderName: "sender", content: "Current history", sentAt: 2000 };

beforeEach(() => vi.mocked(getChannelMessagesPage).mockReset());

async function atTop() {
  const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
  </QueryClientProvider>);
  await screen.findByText("Current history");
  const scroll = container.querySelector('[class*="overflow-anchor"]') as HTMLDivElement;
  const size = { height: 1000 };
  Object.defineProperty(scroll, "scrollHeight", { get: () => size.height });
  Object.defineProperty(scroll, "clientHeight", { value: 200 });
  scroll.scrollTop = 0;
  fireEvent.scroll(scroll);
  await waitFor(() => expect(getChannelMessagesPage).toHaveBeenCalledTimes(2));
  return { scroll, size };
}

it("adds the older page to where the reader has moved to since the request", async () => {
  let resolveOlder!: (page: Awaited<ReturnType<typeof getChannelMessagesPage>>) => void;
  vi.mocked(getChannelMessagesPage)
    .mockResolvedValueOnce({ items: [latest], nextCursor: 1000, hasMore: true })
    .mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
  const { scroll, size } = await atTop();
  scroll.scrollTop = 120;
  size.height = 1400;
  await act(async () => resolveOlder({ items: [{ ...latest, id: 1, packetHash: "older", content: "Older history", sentAt: 500 }], nextCursor: null, hasMore: false }));
  await screen.findByText("Older history");
  expect(scroll.scrollTop).toBe(520);
});

it("leaves the reader in place when the older page fails to load", async () => {
  let rejectOlder!: (err: Error) => void;
  vi.mocked(getChannelMessagesPage)
    .mockResolvedValueOnce({ items: [latest], nextCursor: 1000, hasMore: true })
    .mockImplementationOnce(() => new Promise((_, reject) => { rejectOlder = reject; }));
  const { scroll, size } = await atTop();
  scroll.scrollTop = 120;
  size.height = 1100;
  await act(async () => rejectOlder(new Error("boom")));
  await waitFor(() => expect(getChannelMessagesPage).toHaveBeenCalledTimes(2));
  expect(scroll.scrollTop).toBe(120);
});
