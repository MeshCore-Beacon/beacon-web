import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MessagePanel } from "../../../src/features/channels/MessagePanel";
import type { ChannelMessage, ChannelSummary } from "../../../src/features/channels/types";
import i18n from "../../../src/i18n";

// Older live WS messages have no id — preserve that compatible runtime shape.
const restMsg: ChannelMessage = {
  id: 1,
  packetHash: "ph-rest",
  channelHash: "ch1",
  senderName: "alice",
  content: "from rest",
  sentAt: 1000,
};

const liveMsgA = {
  packetHash: "ph-live-a",
  channelHash: "ch1",
  senderName: "bob",
  content: "live one",
  sentAt: 2000,
} as ChannelMessage;

const liveMsgB = {
  packetHash: "ph-live-b",
  channelHash: "ch1",
  senderName: "carol",
  content: "live two",
  sentAt: 3000,
} as ChannelMessage;

const multiLineMsg: ChannelMessage = {
  id: 2,
  packetHash: "ph-multiline",
  channelHash: "ch1",
  senderName: "dave",
  content: "🟠\nDWD aktuell: WARNUNG vor GEWITTER\nDi 17:37 - Di 19:00",
  sentAt: 4000,
};

vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => ({ iatas: undefined, regionKey: "*" }) }));
vi.mock("../../../src/api/client", () => ({
  getScopes: vi.fn(async () => []),
  getChannelMessagesPage: vi.fn(() =>
    Promise.resolve({ items: [restMsg, liveMsgA, liveMsgB, multiLineMsg], nextCursor: null, hasMore: false }),
  ),
}));

const channel: ChannelSummary = {
  id: 1,
  name: "Public",
  channelHash: "ch1",
  lastSeen: 3000,
  isHashtag: false,
  keyKnown: true,
};

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("MessagePanel row keys", () => {
  it("keys rows without React key warnings when live messages lack an id", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
      </QueryClientProvider>,
    );

    await screen.findByText("live two");
    expect(screen.getByText("from rest")).toBeInTheDocument();
    expect(screen.getByText("live one")).toBeInTheDocument();

    const keyWarnings = errorSpy.mock.calls.filter((args) => String(args[0]).includes("key"));
    expect(keyWarnings).toEqual([]);

    errorSpy.mockRestore();
  });
});

describe("MessagePanel multi-line messages", () => {
  it("preserves linebreaks in a message body", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={qc}>
        <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
      </QueryClientProvider>,
    );

    // jsdom doesn't collapse whitespace the way a browser does, so the class is what pins this;
    // the normalizer override stops findByText from collapsing the newlines before matching
    const body = await screen.findByText(multiLineMsg.content, { normalizer: (s) => s });
    expect(body.className).toContain("whitespace-pre-wrap");
    expect(body.className).toContain("break-words");
  });
});

describe("MessagePanel heard badge", () => {
  const mount = () => render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MessagePanel channel={channel} heardCounts={{ "ph-rest": 3, "ph-live-a": 1 }} regionKey="*" />
    </QueryClientProvider>,
  );

  it("labels the repeat count", async () => {
    mount();
    expect(await screen.findByTitle("Heard 3 times")).toHaveTextContent("×3");
    expect(screen.getByTitle("Heard 1 time")).toBeInTheDocument();
  });

  it("labels the repeat count in French", async () => {
    await i18n.changeLanguage("fr");
    mount();
    expect(await screen.findByTitle("Entendu 3 fois")).toBeInTheDocument();
    expect(screen.getByTitle("Entendu 1 fois")).toBeInTheDocument();
  });
});

describe("MessagePanel live follow", () => {
  it("scrolls only its own list when a live message arrives, not the page", async () => {
    const scrollTo = vi.fn();
    window.HTMLElement.prototype.scrollTo = scrollTo as unknown as typeof HTMLElement.prototype.scrollTo;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MessagePanel channel={channel} heardCounts={{}} regionKey="*" />
      </QueryClientProvider>,
    );
    await screen.findByText("live two");

    const live = { ...liveMsgB, packetHash: "ph-live-c", content: "live three", sentAt: 5000 } as ChannelMessage;
    act(() => {
      qc.setQueryData(["channel-messages", channel.id, "*", ""], (old: { pages: { items: ChannelMessage[] }[] }) => ({
        ...old,
        pages: [{ ...old.pages[0], items: [live, ...old.pages[0].items] }, ...old.pages.slice(1)],
      }));
    });
    await screen.findByText("live three");

    // scrollIntoView also scrolls every ancestor up to the document, shoving the whole app shell up
    expect(window.HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled();
  });
});
