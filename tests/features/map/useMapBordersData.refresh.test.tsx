import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMapBordersData } from "../../../src/features/map/useMapBordersData";
import type { IataBorder } from "../../../src/api/client";

const state = vi.hoisted(() => ({ data: null as IataBorder | null, updated: 0 }));
vi.mock("@tanstack/react-query", () => ({ useQueries: () => [{ data: state.data, dataUpdatedAt: state.updated }] }));

const border = (lng: number): IataBorder => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[lng, 0], [lng + 1, 0], [lng + 1, 1], [lng, 0]]] } });

describe("border refresh", () => {
  it("replaces an already-loaded polygon when its query refreshes", () => {
    state.data = border(0); state.updated = 1;
    const { result, rerender } = renderHook(() => useMapBordersData(["YKF"], true));
    const previous = result.current;
    state.data = border(5); state.updated = 2;
    rerender();
    expect(result.current).not.toBe(previous);
    expect(result.current.features[0]?.geometry).toEqual(border(5).geometry);
  });
  it("adds a configured border after an earlier empty response", () => {
    state.data = null; state.updated = 3;
    const { result, rerender } = renderHook(() => useMapBordersData(["YOW"], true));
    expect(result.current.features).toHaveLength(0);
    state.data = border(10); state.updated = 4;
    rerender();
    expect(result.current.features).toHaveLength(1);
  });
  it("keeps the same reference when a refetch returns the same data object", () => {
    const same = border(0);
    state.data = same; state.updated = 1;
    const { result, rerender } = renderHook(() => useMapBordersData(["YKF"], true));
    const previous = result.current;
    state.updated = 2;
    rerender();
    expect(result.current).toBe(previous);
  });
  it("keeps the same reference when a null-border query refetches", () => {
    state.data = null; state.updated = 1;
    const { result, rerender } = renderHook(() => useMapBordersData(["YOW"], true));
    const previous = result.current;
    state.updated = 2;
    rerender();
    expect(result.current).toBe(previous);
  });
  it("returns no borders once toggled off, even with cached data", () => {
    state.data = border(0); state.updated = 1;
    const { result, rerender } = renderHook(({ on }) => useMapBordersData(["YKF"], on), { initialProps: { on: true } });
    expect(result.current.features).toHaveLength(1);
    rerender({ on: false });
    expect(result.current.features).toHaveLength(0);
  });
});
