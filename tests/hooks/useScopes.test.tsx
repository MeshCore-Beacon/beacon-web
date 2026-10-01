import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useScopes } from "../../src/hooks/useScopes";
import { getScopes } from "../../src/api/client";

const region = { iatas: ["YOW"] as string[] | undefined, regionKey: "YOW", isResolved: true };
vi.mock("../../src/hooks/useRegion", () => ({ useRegion: () => region }));
vi.mock("../../src/api/client", () => ({ getScopes: vi.fn(async (iatas?: string[]) => (iatas ? ["#yow"] : ["#can", "#yow", "#yyz"])) }));
afterEach(() => { vi.clearAllMocks(); region.iatas = ["YOW"]; region.regionKey = "YOW"; region.isResolved = true; });

const setup = (keep?: string | string[]) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const hook = renderHook(() => useScopes(keep), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  return { ...hook, client };
};

it("lists only the selected region's scopes, and every scope for All", async () => {
  const { result, rerender, client } = setup();
  await waitFor(() => expect(result.current).toEqual(["#yow"]));
  expect(getScopes).toHaveBeenCalledWith(["YOW"]);
  region.iatas = undefined; region.regionKey = "*"; rerender();
  await waitFor(() => expect(result.current).toEqual(["#can", "#yow", "#yyz"]));
  expect(getScopes).toHaveBeenLastCalledWith(undefined);
  expect(client.getQueryCache().findAll({ queryKey: ["scopes"] })).toHaveLength(2);
});

it("keeps a selected scope from another region so a shared link still filters", async () => {
  const { result } = setup(["#yyz"]);
  await waitFor(() => expect(result.current).toEqual(["#yow", "#yyz"]));
});

it("does not fall back to every scope while the selected region is unresolved", () => {
  region.isResolved = false;
  const { result } = setup("#yow");
  expect(getScopes).not.toHaveBeenCalled();
  expect(result.current).toEqual(["#yow"]);
});
