import { afterEach, describe, expect, it, vi } from "vitest";
import { startTopologyLayout, type TopologyLayoutInput } from "../../../src/features/topology/layout-worker";
import { buildTopology } from "../../../src/features/topology/topology";

afterEach(() => vi.unstubAllGlobals());
const input: TopologyLayoutInput = { nodes: [], iatas: undefined, routes: [] };

describe("Topology layout jobs", () => {
  it("returns the worker graph and releases the worker", async () => {
    const graph = buildTopology([]), terminate = vi.fn();
    const worker = { onmessage: undefined as undefined | ((event: MessageEvent) => void), onerror: undefined, terminate, postMessage: vi.fn() };
    vi.stubGlobal("Worker", class { constructor() { return worker; } });
    const job = startTopologyLayout(input);
    expect(worker.postMessage).toHaveBeenCalledWith(input);
    worker.onmessage!({ data: graph } as MessageEvent);
    await expect(job.result).resolves.toBe(graph);
    expect(terminate).toHaveBeenCalledOnce();
  });
  it("terminates stale work and ignores its late reply", async () => {
    const worker = { onmessage: undefined as undefined | ((event: MessageEvent) => void), onerror: undefined, terminate: vi.fn(), postMessage: vi.fn() };
    vi.stubGlobal("Worker", class { constructor() { return worker; } });
    const job = startTopologyLayout(input), apply = vi.fn();
    void job.result.then(apply);
    job.cancel();
    worker.onmessage!({ data: buildTopology([]) } as MessageEvent);
    await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("retains a usable graph when workers cannot be created", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("blocked worker"); } });
    await expect(startTopologyLayout(input).result).resolves.toEqual(buildTopology([]));
  });
  it("falls back if the worker module cannot load", async () => {
    const worker = { onmessage: undefined, onerror: undefined as undefined | (() => void), terminate: vi.fn(), postMessage: vi.fn() };
    vi.stubGlobal("Worker", class { constructor() { return worker; } });
    const job = startTopologyLayout(input);
    worker.onerror!();
    await expect(job.result).resolves.toEqual(buildTopology([]));
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
