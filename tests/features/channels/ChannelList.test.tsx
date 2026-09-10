import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChannelList } from "../../../src/features/channels/ChannelList";
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

const channel = (id: number, name = `Channel ${id}`): ChannelSummary => ({
  id, name, channelHash: id.toString(16).padStart(2, "0"), lastSeen: 10000 - id, isHashtag: false, keyKnown: true,
});
const page = (items: ChannelSummary[], nextCursor: number | null = null): CursorPage<ChannelSummary> => ({ items, nextCursor, hasMore: nextCursor !== null });
const response = (data: CursorPage<ChannelSummary>) => new Response(JSON.stringify(data), { status: 200 });
const first = () => page(Array.from({ length: 50 }, (_, i) => channel(i + 1)), 5000);
const fetchMock = vi.fn<typeof fetch>();

function show(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const app = () => <QueryClientProvider client={client}><ChannelList wsManager={{} as WsManager} onAnalyze={() => {}} /></QueryClientProvider>;
  return { ...render(app()), client, app };
}
function lastURL() { return new URL(String(fetchMock.mock.calls.at(-1)![0])); }

beforeEach(() => {
  region = { iatas: ["YYZ"], regionKey: "YYZ" };
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("channel directory paging", () => {
  it("prefers the precise server cursor and preserves it through live updates", async () => {
    const precise = "v1:1700000000000123:50";
    const firstPage = { ...first(), nextPageCursor: precise };
    fetchMock.mockResolvedValueOnce(response(firstPage))
      .mockResolvedValueOnce(response(page([channel(51, "Precise result")])));
    show();
    await screen.findByText("#Channel 1");
    act(() => onMessage({ id: 1, packetHash: "fixture", channelHash: "01", senderName: "fixture", content: "fixture", sentAt: 20000 }));
    fireEvent.click(screen.getByRole("button", { name: "Load more channels" }));
    await screen.findByText("#Precise result");
    expect(lastURL().searchParams.get("pageCursor")).toBe(precise);
    expect(lastURL().searchParams.has("cursor")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("can retry an initial failure even without a page cursor", async () => {
    fetchMock.mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(response(page([])));
    const { client } = show();
    await waitFor(() => expect(client.getQueryState(["channels", "YYZ"])?.status).toBe("error"));
    fireEvent.click(await screen.findByRole("button", { name: "Retry loading channels" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastURL().searchParams.has("cursor")).toBe(false);
    expect(screen.queryByRole("button", { name: "Load more channels" })).not.toBeInTheDocument();
  });

  it("finds older matches one page at a time and keeps the selected channel when filtered out", async () => {
    fetchMock.mockResolvedValueOnce(response(first()))
      .mockResolvedValueOnce(response(page([channel(51, "Older match")])));
    show();
    await screen.findByText("#Channel 50");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "older match" } });
    await screen.findByText("No matching channels loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Load more channels" }));
    fireEvent.click(await screen.findByRole("button", { name: /#Older match/ }));
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("51");
    expect(lastURL().searchParams.get("cursor")).toBe("5000");
    expect(lastURL().searchParams.get("iata")).toBe("YYZ");
    expect(lastURL().searchParams.get("limit")).toBe("50");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Load more channels" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "absent" } });
    await screen.findByText("No matching channels loaded.");
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("51");
  });

  it("gates a pending page, offers retry after failure and trusts a full final page", async () => {
    let rejectPage!: (error: Error) => void;
    fetchMock.mockResolvedValueOnce(response(first()))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPage = reject; }))
      .mockResolvedValueOnce(response(page(Array.from({ length: 50 }, (_, i) => channel(i + 51)))));
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Load more channels" }));
    const pending = await screen.findByRole("button", { name: "Loading channels..." });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => rejectPage(new Error("temporary failure")));
    fireEvent.click(await screen.findByRole("button", { name: "Retry loading channels" }));
    await screen.findByText("#Channel 100");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastURL().searchParams.get("cursor")).toBe("5000");
    expect(screen.queryByRole("button", { name: "Load more channels" })).not.toBeInTheDocument();
  });

  it("deduplicates IDs, preserves hash collisions and resets only the first page for an unseen live channel", async () => {
    const older = channel(51, "Older selected");
    fetchMock.mockResolvedValueOnce(response(first()))
      .mockResolvedValueOnce(response(page([channel(1), { ...channel(52), channelHash: "01" }, older], 4000)))
      .mockResolvedValueOnce(response(first()));
    const { client } = show();
    fireEvent.click(await screen.findByRole("button", { name: "Load more channels" }));
    fireEvent.click(await screen.findByRole("button", { name: /#Older selected/ }));
    expect(screen.getAllByText("#Channel 1")).toHaveLength(1);
    expect(screen.getByText("#Channel 52")).toBeInTheDocument();
    const event = { id: 1, packetHash: "fixture", channelHash: older.channelHash, senderName: "fixture", content: "fixture", sentAt: 20000 };
    act(() => onMessage(event));
    const cached = client.getQueryData<{ pages: CursorPage<ChannelSummary>[]; pageParams: unknown[] }>(["channels", "YYZ"])!;
    expect(cached.pages[1]!.items.find(ch => ch.id === 51)?.lastSeen).toBe(20000);
    expect(cached.pages[1]!.nextCursor).toBe(4000);
    expect(cached.pageParams).toEqual([undefined, 5000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    act(() => onMessage({ ...event, channelHash: "ff" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(client.getQueryData<{ pages: unknown[] }>(["channels", "YYZ"])?.pages).toHaveLength(1));
    expect(lastURL().searchParams.has("cursor")).toBe(false);
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("51");
  });

  it("coalesces unknown live channels during paging into one first-page refresh", async () => {
    let resolvePage!: (response: Response) => void;
    fetchMock.mockResolvedValueOnce(response(first()))
      .mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }))
      .mockResolvedValueOnce(response(page([channel(99, "New live channel")])));
    show();
    fireEvent.click(await screen.findByText("#Channel 1"));
    fireEvent.click(screen.getByRole("button", { name: "Load more channels" }));
    await screen.findByRole("button", { name: "Loading channels..." });
    const event = { id: 1, packetHash: "fixture", channelHash: "ff", senderName: "fixture", content: "fixture", sentAt: 20000 };
    act(() => { onMessage(event); onMessage({ ...event, channelHash: "fe" }); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => resolvePage(response(page([channel(51)], 4000))));
    await screen.findByText("#New live channel");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastURL().searchParams.has("cursor")).toBe(false);
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("1");
  });

  it("keeps the open channel when the page cap evicts it, then clears selection and filters on region change", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["channels", "YYZ"], {
      pages: Array.from({ length: 20 }, (_, i) => page([channel(i + 1)], 9000 - i)),
      pageParams: Array.from({ length: 20 }, (_, i) => i === 0 ? undefined : 9001 - i),
    });
    fetchMock.mockResolvedValueOnce(response(page([channel(21)], 8000)))
      .mockResolvedValueOnce(response(page([channel(101, "Other region")])));
    const view = show(client);
    fireEvent.click(await screen.findByText("#Channel 1"));
    fireEvent.click(screen.getByRole("button", { name: "Load more channels" }));
    await screen.findByText("#Channel 21");
    expect(client.getQueryData<{ pages: unknown[] }>(["channels", "YYZ"])?.pages).toHaveLength(20);
    expect(screen.queryByText("#Channel 1")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("1");
    fireEvent.change(screen.getByPlaceholderText("Search by name..."), { target: { value: "absent" } });
    await screen.findByText("No matching channels loaded.");
    region = { iatas: ["YOW"], regionKey: "YOW" };
    view.rerender(view.app());
    await screen.findByText("#Other region");
    expect(screen.getByTestId("selected-channel")).toHaveTextContent("none");
    expect(screen.getByPlaceholderText("Search by name...")).toHaveValue("");
    expect(lastURL().searchParams.get("iata")).toBe("YOW");
    expect(lastURL().searchParams.has("cursor")).toBe(false);
  });
});
