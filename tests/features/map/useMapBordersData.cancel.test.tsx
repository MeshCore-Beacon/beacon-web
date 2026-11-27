import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useMapBordersData } from "../../../src/features/map/useMapBordersData";
import type { IataBorder } from "../../../src/api/client";

const border: IataBorder = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const requests: { aborted: boolean; respond: (body: IataBorder | null) => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const request = { aborted: false, respond: (body: IataBorder | null) => resolve(new Response(JSON.stringify(body))) };
    init?.signal?.addEventListener("abort", () => {
      request.aborted = true;
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    requests.push(request);
  })));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, requests, wrapper };
}

afterEach(() => vi.unstubAllGlobals());

describe("border query lifecycle", () => {
  it("aborts outstanding borders when switched off, and starts cancelled reads afresh on re-enable", async () => {
    const { client, requests, wrapper } = setup();
    const { result, rerender } = renderHook(({ on }) => useMapBordersData(["A", "B"], on), { wrapper, initialProps: { on: true } });
    await waitFor(() => expect(requests).toHaveLength(2));
    rerender({ on: false });
    await waitFor(() => expect(requests.every((request) => request.aborted)).toBe(true));
    expect(result.current.features).toEqual([]);
    expect(client.getQueryCache().find({ queryKey: ["iata-border", "A"] })?.getObserversCount()).toBe(0);
    rerender({ on: true });
    await waitFor(() => expect(requests).toHaveLength(4));
    requests[2].respond(border);
    requests[3].respond(null);
    await waitFor(() => expect(result.current.features.map((f) => f.properties.iata)).toEqual(["A"]));
  });

  it("cancels only removed regions and retains an overlapping region request", async () => {
    const { requests, wrapper } = setup();
    const { result, rerender } = renderHook(({ codes }) => useMapBordersData(codes, true), { wrapper, initialProps: { codes: ["A", "B"] } });
    await waitFor(() => expect(requests).toHaveLength(2));
    rerender({ codes: ["B", "C"] });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests.map((request) => request.aborted)).toEqual([true, false, false]);
    requests[1].respond(border);
    requests[2].respond(border);
    await waitFor(() => expect(result.current.features.map((f) => f.properties.iata)).toEqual(["B", "C"]));
  });

  it("preserves another subscriber and reuses completed cached geometry after off/on", async () => {
    const { requests, wrapper } = setup();
    const first = renderHook(({ on }) => useMapBordersData(["A"], on), { wrapper, initialProps: { on: true } });
    const second = renderHook(() => useMapBordersData(["A"], true), { wrapper });
    await waitFor(() => expect(requests).toHaveLength(1));
    first.rerender({ on: false });
    expect(requests[0].aborted).toBe(false);
    expect(first.result.current.features).toEqual([]);
    requests[0].respond(border);
    await waitFor(() => expect(second.result.current.features).toHaveLength(1));
    second.unmount();
    first.rerender({ on: true });
    await waitFor(() => expect(first.result.current.features).toHaveLength(1));
    expect(requests).toHaveLength(1);
  });
});
