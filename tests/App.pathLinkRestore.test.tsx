import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PathLinkRestore } from "../src/App";
import type { PacketDetail } from "../src/types/api";

const getPacketDetail = vi.fn();
vi.mock("../src/api/client", () => ({
  getPacketDetail: (hash: string) => getPacketDetail(hash),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => getPacketDetail.mockReset());

const detail = { packetHash: "AA11", observations: [] } as unknown as PacketDetail;

describe("PathLinkRestore", () => {
  it("never restores a different packet while the shared packet is still loading", async () => {
    getPacketDetail.mockResolvedValue(detail);
    const onRestore = vi.fn();
    render(<PathLinkRestore initialPath="obs-alpha" hash="AA11" analyzerDetail={{ ...detail, packetHash: "BB22" }} onRestore={onRestore} />, { wrapper });
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(detail, "obs-alpha"));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
  // Regression: PacketPathMapModal's Copy Link strips ?analyze, so a copied path link carries ?hash
  // without it — the popup can't rely on the analyzer drawer's fetch and needs its own.
  it("restores the path popup from ?hash&?path alone, with no ?analyze", async () => {
    getPacketDetail.mockResolvedValue(detail);
    const onRestore = vi.fn();
    render(
      <PathLinkRestore initialPath="obs-alpha" hash="AA11" analyzerDetail={undefined} onRestore={onRestore} />,
      { wrapper },
    );
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(detail, "obs-alpha"));
    expect(getPacketDetail).toHaveBeenCalledWith("AA11");
  });

  it("does not fetch when there is no ?path", () => {
    render(
      <PathLinkRestore initialPath={null} hash="AA11" analyzerDetail={undefined} onRestore={vi.fn()} />,
      { wrapper },
    );
    expect(getPacketDetail).not.toHaveBeenCalled();
  });

  it("uses the analyzer's already-fetched detail instead of waiting on its own fetch", () => {
    const onRestore = vi.fn();
    render(
      <PathLinkRestore initialPath="obs-alpha" hash="AA11" analyzerDetail={detail} onRestore={onRestore} />,
      { wrapper },
    );
    expect(onRestore).toHaveBeenCalledWith(detail, "obs-alpha");
  });
});
