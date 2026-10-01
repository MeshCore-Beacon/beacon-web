import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { ChannelList } from "../../../src/features/channels/ChannelList";
import { noteRateLimited, noteRequestOk } from "../../../src/api/rate-limit";
import { LIVE_BUFFER_CAP } from "../../../src/lib/constants";
import type { ChannelMessage, ChannelSummary } from "../../../src/features/channels/types";
import type { CursorPage } from "../../../src/types/api";
import type { WsManager } from "../../../src/api/ws-manager";

let region = { iatas: ["YYZ"], regionKey: "YYZ" };
let onMessage: (data: ChannelMessage) => void;
vi.mock("../../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../../src/hooks/useWsHandlers", () => ({
  useWsChannelMessageHandler: (_manager: unknown, handler: typeof onMessage) => { onMessage = handler; },
}));
vi.mock("../../../src/features/channels/MessagePanel", () => ({
  MessagePanel: ({ channel }: { channel: ChannelSummary | null }) => <div data-testid="selected-channel">{channel?.id ?? "none"}</div>,
}));

const channel = (id: number, name = `Channel ${id}`, keyKnown = true): ChannelSummary => ({
  id, name, channelHash: id.toString(16).padStart(2, "0"), lastSeen: 10000 - id, isHashtag: false, keyKnown,
});
const other = (id: number, name = `Other ${id}`) => channel(id, name, false);
const page = (items: ChannelSummary[], nextCursor: number | null = null): CursorPage<ChannelSummary> => ({ items, nextCursor, hasMore: nextCursor !== null });
const response = (data: CursorPage<ChannelSummary>) => new Response(JSON.stringify(data), { status: 200 });
const fetchMock = vi.fn<typeof fetch>();

// Each list (keyKnown=true / false) answers from its own queue; an unqueued request gets an empty page.
type Reply = CursorPage<ChannelSummary> | Error | Promise<Response>;
let queues: Record<string, Reply[]>;
const keyed = (...replies: Reply[]) => queues.true!.push(...replies);
const others = (...replies: Reply[]) => queues.false!.push(...replies);
const calls = (kind: "true" | "false") => fetchMock.mock.calls.map(([url]) => new URL(String(url))).filter((url) => url.searchParams.get("keyKnown") === kind);
const lastCall = (kind: "true" | "false") => calls(kind).at(-1)!;

function show(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const app = () => <QueryClientProvider client={client}><ChannelList wsManager={{} as WsManager} onAnalyze={() => {}} /></QueryClientProvider>;
  return { ...render(app()), client, app };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
function pending() {
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  region = { iatas: ["YYZ"], regionKey: "YYZ" };
  queues = { true: [], false: [] };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const reply = queues[new URL(String(input)).searchParams.get("keyKnown") ?? ""]?.shift() ?? page([]);
    if (reply instanceof Error) throw reply;
    if (reply instanceof Promise) return reply;
    return response(reply);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  noteRequestOk();
});

describe("channel directory", () => {
  it("lists every keyed channel up front and leaves the rest behind a button", async () => {
    keyed(page([channel(1, "Public"), channel(2, "First")], 5000), page([channel(3, "Last")]));
    show();
    await screen.findByText("#Last");
    expect(screen.getByText("Public")).toBeInTheDocument();
    expect(calls("true")).toHaveLength(2);
    expect(calls("true")[0]!.searchParams.get("limit")).toBe("200");
    expect(calls("true")[1]!.searchParams.get("cursor")).toBe("5000");
    expect(calls("true")[0]!.searchParams.get("iata")).toBe("YYZ");
    expect(calls("false")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Load other channels" })).toBeInTheDocument();
  });

  it("loads other channels on demand below the keyed ones, then pages them with the precise cursor", async () => {
    const precise = "v1:1700000000000123:50";
    keyed(page([channel(1)]));
    others({ ...page([other(60)], 5000), nextPageCursor: precise }, page([other(61, "Older other")]));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Load other channels" }));
    await screen.findByText("#Other 60");
    const names = screen.getAllByRole("button", { name: /^#/ }).map((b) => b.textContent);
    expect(names.findIndex((n) => n?.includes("Channel 1"))).toBeLessThan(names.findIndex((n) => n?.includes("Other 60")));
    fireEvent.click(screen.getByRole("button", { name: "Load more channels" }));
    await screen.findByText("#Older other");
    expect(lastCall("false").searchParams.get("pageCursor")).toBe(precise);
    expect(lastCall("false").searchParams.get("limit")).toBe("50");
    expect(screen.queryByRole("button", { name: /Load (more|other) channels/ })).not.toBeInTheDocument();
  });

  it("stops paging keyed channels when the server ignores keyKnown", async () => {
    keyed(page([channel(1, "Keyed"), other(2, "Mixed in")], 5000));
    show();
    await screen.findByText("#Keyed");
    await waitFor(() => expect(screen.getByRole("button", { name: "Load other channels" })).toBeInTheDocument());
    expect(calls("true")).toHaveLength(1);
    expect(screen.queryByText("#Mixed in")).not.toBeInTheDocument();
  });

  it("loads other channels automatically for the Unknown key filter", async () => {
    keyed(page([channel(1)]));
    others(page([other(60)]));
    show();
    await screen.findByText("#Channel 1");
    fireEvent.click(screen.getByRole("button", { name: /^Key/ }));
    fireEvent.click(screen.getByRole("option", { name: "Unknown" }));
    await screen.findByText("#Other 60");
    expect(screen.queryByText("#Channel 1")).not.toBeInTheDocument();
  });

  it("can retry an initial failure", async () => {
    keyed(new Error("temporary failure"), page([channel(1)]));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Retry loading channels" }));
    await screen.findByText("#Channel 1");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(calls("true")).toHaveLength(2);
    expect(calls("true")[1]!.searchParams.has("cursor")).toBe(false);
  });

  it("gates a pending page of other channels and offers retry after failure", async () => {
    const slow = pending();
    keyed(page([channel(1)]));
    others(page([other(60)], 5000), slow.promise, page([other(61)]));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Load other channels" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more channels" }));
    const loading = await screen.findByRole("button", { name: "Loading channels..." });
    expect(loading).toBeDisabled();
    fireEvent.click(loading);
    expect(calls("false")).toHaveLength(2);
    await act(async () => slow.reject(new Error("temporary failure")));
    fireEvent.click(await screen.findByRole("button", { name: "Retry loading channels" }));
    await screen.findByText("#Other 61");
    expect(lastCall("false").searchParams.get("cursor")).toBe("5000");
  });

  it("updates a known channel in place and refreshes only the keyed list for an unseen live channel", async () => {
    keyed(page([channel(1)]), page([channel(1), channel(99, "New live channel")]));
    others(page([other(60)], 5000));
    const { client } = show();
    fireEvent.click(await screen.findByRole("button", { name: "Load other channels" }));
    fireEvent.click(await screen.findByRole("button", { name: /#Other 60/ }));
    const event = { id: 1, packetHash: "fixture", channelHash: other(60).channelHash, senderName: "fixture", content: "fixture", sentAt: 20000 };
    act(() => onMessage(event));
    const cached = client.getQueryData<InfiniteData<CursorPage<ChannelSummary>>>(["channels", "YYZ", "other"])!;
    expect(cached.pages[0]!.items[0]!.lastSeen).toBe(20000);
    expect(cached.pages[0]!.nextCursor).toBe(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => onMessage({ ...event, channelHash: "ff" }));
    await screen.findByText("#New live channel");
    expect(calls("true")).toHaveLength(2);
    expect(calls("false")).toHaveLength(1);
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("60");
  });

  it("coalesces unseen live channels during a keyed fetch into one refresh", async () => {
    const slow = pending();
    keyed(page([channel(1)], 5000), slow.promise, page([channel(99, "New live channel")]));
    show();
    await screen.findByText("#Channel 1");
    const event = { id: 1, packetHash: "fixture", channelHash: "ff", senderName: "fixture", content: "fixture", sentAt: 20000 };
    act(() => { onMessage(event); onMessage({ ...event, channelHash: "fe" }); });
    expect(calls("true")).toHaveLength(2);
    await act(async () => slow.resolve(response(page([channel(2)]))));
    await screen.findByText("#New live channel");
    expect(calls("true")).toHaveLength(3);
    expect(lastCall("true").searchParams.has("cursor")).toBe(false);
  });

  it("keeps the open channel when it drops out of the list, then resets everything on region change", async () => {
    keyed(page([channel(1)]));
    others(page([other(60)]));
    const view = show();
    fireEvent.click(await screen.findByRole("button", { name: "Load other channels" }));
    fireEvent.click(await screen.findByRole("button", { name: /#Other 60/ }));
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "absent" } });
    await screen.findByText("No matching channels loaded.");
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("60");
    keyed(page([channel(101, "Other region")]));
    region = { iatas: ["YOW"], regionKey: "YOW" };
    view.rerender(view.app());
    await screen.findByText("#Other region");
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("none");
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("");
    expect(lastCall("true").searchParams.get("iata")).toBe("YOW");
    expect(screen.getByRole("button", { name: "Load other channels" })).toBeInTheDocument();
    expect(calls("false")).toHaveLength(1);
  });
});

describe("channel message overflow recovery", () => {
  it("recovers a rate-limit-stuck overflow once the rate limit clears", async () => {
    keyed(page([channel(1)]));
    const { client } = show();
    await screen.findByText("#Channel 1");
    fireEvent.click(screen.getByText("#Channel 1"));
    const key = ["channel-messages", 1, "YYZ", ""];
    const fetch = deferred<InfiniteData<CursorPage<ChannelMessage>>>();
    void client.fetchQuery({ queryKey: key, queryFn: () => fetch.promise });
    await waitFor(() => expect(client.isFetching({ queryKey: key, exact: true })).toBe(1));
    act(() => {
      for (let i = 0; i <= LIVE_BUFFER_CAP; i++) {
        onMessage({ id: i, packetHash: `h${i}`, channelHash: "01", senderName: "s", content: "c", sentAt: 20000 + i });
      }
    });
    noteRateLimited(60_000);
    await act(async () => fetch.resolve({ pages: [{ items: [], nextCursor: null, hasMore: false }], pageParams: [undefined] }));
    await waitFor(() => expect(client.isFetching({ queryKey: key, exact: true })).toBe(0));
    expect(client.getQueryState(key)?.isInvalidated).toBeFalsy();
    act(() => noteRequestOk());
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("invalidates an idle overflow directly from the WS handler once a further message arrives", async () => {
    keyed(page([channel(1)]));
    const { client } = show();
    await screen.findByText("#Channel 1");
    fireEvent.click(screen.getByText("#Channel 1"));
    const key = ["channel-messages", 1, "YYZ", ""];
    // A registered-but-unfetched query: getQueryData(key) stays undefined, so messages keep hitting the queue/overflow path.
    client.getQueryCache().build(client, { queryKey: key });
    expect(client.isFetching({ queryKey: key, exact: true })).toBe(0);
    act(() => {
      for (let i = 0; i < LIVE_BUFFER_CAP; i++) {
        onMessage({ id: i, packetHash: `h${i}`, channelHash: "01", senderName: "s", content: "c", sentAt: 20000 + i });
      }
    });
    expect(client.getQueryState(key)?.isInvalidated).toBeFalsy();
    act(() => onMessage({ id: LIVE_BUFFER_CAP, packetHash: `h${LIVE_BUFFER_CAP}`, channelHash: "01", senderName: "s", content: "c", sentAt: 30000 }));
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
