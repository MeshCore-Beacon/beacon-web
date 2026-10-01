import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessagePanel } from "../../../src/features/channels/MessagePanel";
import { ChannelList } from "../../../src/features/channels/ChannelList";
import type { ChannelMessage, ChannelSummary } from "../../../src/features/channels/types";
import type { WsManager } from "../../../src/api/ws-manager";
import { getChannelMessagesPage, getChannels } from "../../../src/api/client";
import i18n from "../../../src/i18n";

vi.mock("../../../src/api/client", () => ({
  getChannelMessagesPage: vi.fn(),
  getChannels: vi.fn(),
  getScopes: vi.fn(async () => ["#can", "#yow"]),
}));
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: ["YOW"], regionKey: "YOW" }) }));
let onMessage: (data: ChannelMessage) => void;
vi.mock("../../../src/hooks/useWsHandlers", () => ({
  useWsChannelMessageHandler: (_m: unknown, fn: typeof onMessage) => {
    onMessage = fn;
  },
}));
const channel: ChannelSummary = {
  id: 1,
  name: "#test",
  channelHash: "11",
  keyKnown: true,
  isHashtag: true,
  lastSeen: 1,
};
const base = { channelHash: "11", senderName: "Fixture", content: "test message", sentAt: 1 };
const messages = [
  { ...base, id: 4, packetHash: "matched", scope: "#yow", scopeStatus: "matched" as const },
  { ...base, id: 3, packetHash: "unscoped", scope: null, scopeStatus: "unscoped" as const },
  { ...base, id: 2, packetHash: "unknown", scope: null, scopeStatus: "unknown" as const },
  { ...base, id: 1, packetHash: "legacy" },
];
const page = (items: ChannelMessage[], nextCursor: number | null = null) => ({
  items,
  nextCursor,
  hasMore: nextCursor !== null,
});
function show(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{node}</QueryClientProvider>) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getChannelMessagesPage).mockResolvedValue(page(messages));
  vi.mocked(getChannels).mockResolvedValue({ items: [channel], hasMore: false, nextCursor: null });
  Element.prototype.scrollIntoView = vi.fn();
});

describe("channel scope evidence", () => {
  it("chips matched and unresolved scopes, leaves the unscoped default and legacy rows unlabelled, and offers packet inspection", async () => {
    const inspect = vi.fn();
    show(<MessagePanel channel={channel} heardCounts={{}} regionKey="YOW" onAnalyze={inspect} />);
    expect(await screen.findByText("#yow")).toBeInTheDocument();
    expect(screen.getByText("Unknown scope")).toBeInTheDocument();
    expect(screen.queryByText("No transport scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Scope unavailable")).not.toBeInTheDocument();
    const view = screen.getAllByRole("button", { name: "Inspect packet from Fixture" })[0]!;
    expect(view).toHaveTextContent("View packet");
    expect(view).not.toHaveClass("underline");
    fireEvent.click(view);
    expect(inspect).toHaveBeenCalledTimes(1);
  });
  it("sizes the scope chip like the heard-count badge", async () => {
    show(<MessagePanel channel={channel} heardCounts={{}} regionKey="YOW" />);
    const chip = await screen.findByText("#yow");
    expect(chip).toHaveClass("border", "px-2", "py-0.5", "font-semibold");
  });
  it("switches French labels without refetching or changing protocol names", async () => {
    show(<MessagePanel channel={channel} heardCounts={{}} regionKey="YOW" />);
    await screen.findByText("#yow");
    await act(() => i18n.changeLanguage("fr"));
    expect(screen.getByText("Portée inconnue")).toBeInTheDocument();
    expect(screen.getByText("#yow")).toBeInTheDocument();
    expect(getChannelMessagesPage).toHaveBeenCalledTimes(1);
  });
  it("isolates scope history and live messages, preserving page cursors and channel identity", async () => {
    vi.mocked(getChannelMessagesPage).mockImplementation(async (_id, p) =>
      page(p?.scope === "#yow" ? [messages[0]!] : messages, p?.scope === "#yow" ? 4 : null),
    );
    const { client } = show(<ChannelList wsManager={{} as WsManager} onAnalyze={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /#test/ }));
    await screen.findByText("Unknown scope");
    fireEvent.click(screen.getByRole("button", { name: /Scope.*All scopes/ }));
    fireEvent.click(screen.getByRole("option", { name: "#yow", exact: true }));
    await waitFor(() =>
      expect(getChannelMessagesPage).toHaveBeenLastCalledWith(1, expect.objectContaining({ scope: "#yow" })),
    );
    await waitFor(() => expect(screen.queryByText("Unknown scope")).not.toBeInTheDocument());
    await waitFor(() => expect(client.getQueryData(["channel-messages", 1, "YOW", "#yow"])).toBeDefined());
    const event = {
      ...base,
      id: 5,
      channelId: 1,
      packetHash: "live-yow",
      content: "in scope",
      scope: "#yow",
      scopeStatus: "matched" as const,
    };
    act(() => {
      onMessage({ ...event, packetHash: "other", scope: "#can", content: "wrong scope" });
      onMessage({ ...event, channelId: 2, packetHash: "collision", content: "wrong channel" });
      onMessage(event);
      onMessage(event);
    });
    expect(await screen.findByText("in scope")).toBeInTheDocument();
    expect(screen.queryByText("wrong scope")).not.toBeInTheDocument();
    expect(screen.queryByText("wrong channel")).not.toBeInTheDocument();
    expect(screen.getAllByText("in scope")).toHaveLength(1);
    const cache = client.getQueryData<{ pages: ReturnType<typeof page>[]; pageParams: unknown[] }>([
      "channel-messages",
      1,
      "YOW",
      "#yow",
    ])!;
    expect(cache.pages[0]!.nextCursor).toBe(4);
    expect(cache.pageParams).toEqual([undefined]);
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));
    await waitFor(() =>
      expect(getChannelMessagesPage).toHaveBeenLastCalledWith(1, expect.objectContaining({ scope: "#yow", cursor: 4 })),
    );
  });
  it("explains an empty filtered history", async () => {
    vi.mocked(getChannelMessagesPage).mockResolvedValue(page([]));
    show(<MessagePanel channel={channel} heardCounts={{}} regionKey="YOW" scope="#yow" onScopeChange={() => {}} />);
    expect(await screen.findByText("No messages match #yow.")).toBeInTheDocument();
  });
  it("keeps messages received during history loading without an extra request", async () => {
    let resolveHistory!: (value: ReturnType<typeof page>) => void;
    const live = { ...messages[0]!, id: 5, channelId: 1, packetHash: "during-read", content: "arrived during history" };
    vi.mocked(getChannelMessagesPage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveHistory = resolve;
          }),
      )
      .mockResolvedValue(page([live]));
    show(<ChannelList wsManager={{} as WsManager} onAnalyze={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /#test/ }));
    await waitFor(() => expect(getChannelMessagesPage).toHaveBeenCalledTimes(1));
    act(() => {
      onMessage(live);
      onMessage(live);
    });
    await act(async () => resolveHistory(page([])));
    expect(await screen.findByText("arrived during history")).toBeInTheDocument();
    expect(getChannelMessagesPage).toHaveBeenCalledTimes(1);
  });
  it("explains missing decryption keys without inventing a message scope", async () => {
    vi.mocked(getChannelMessagesPage).mockResolvedValue(page([]));
    show(<MessagePanel channel={{ ...channel, keyKnown: false }} heardCounts={{}} regionKey="YOW" />);
    expect(
      await screen.findByText("Messages can't be decrypted without the channel key."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No transport scope")).not.toBeInTheDocument();
  });

  it("preserves the newest/live page after more than twenty older pages", async () => {
    vi.mocked(getChannelMessagesPage).mockImplementation(async (_id, params) => {
      const index = params?.cursor ?? 0;
      return page(
        [
          {
            ...base,
            id: 1000 - index,
            packetHash: `history-${index}`,
            content: `History ${index}`,
            sentAt: 1000 - index,
          },
        ],
        index + 1,
      );
    });
    show(<MessagePanel channel={channel} heardCounts={{}} regionKey="YOW" />);
    await screen.findByText("History 0");
    for (let index = 1; index <= 21; index++) {
      fireEvent.click(screen.getByRole("button", { name: /Load older/ }));
      await screen.findByText(`History ${index}`);
    }
    expect(screen.getByText("History 0")).toBeInTheDocument();
  });
});
