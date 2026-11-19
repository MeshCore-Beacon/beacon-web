import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLayout } from "../../../src/features/stats/layout-worker";
import { forceLayout, type ForceLayoutInput } from "../../../src/features/stats/graph-layout";

vi.mock("../../../src/features/stats/graph-layout", () => ({ forceLayout: vi.fn(() => new Float64Array([1, 2])) }));

const input: ForceLayoutInput = { count: 1, source: new Int32Array(), target: new Int32Array(), repulsion: 60, edgeLength: 40, gravity: 0.08, friction: 0.2, rect: { x: 0, y: 0, width: 1200, height: 600 }, seed: 1 };
const workers: FakeWorker[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent<Float64Array>) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { workers.push(this); }
}
function unavailable() { vi.stubGlobal("Worker", class { constructor() { throw new Error("Workers disabled"); } }); }

beforeEach(() => { workers.length = 0; vi.mocked(forceLayout).mockClear(); vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => vi.unstubAllGlobals());

describe("layout cancellation", () => {
  it("does not compute or deliver fallback positions when cancelled before its microtask", async () => {
    unavailable();
    const job = startLayout(input);
    const receive = vi.fn();
    void job.result.then(receive);
    job.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(forceLayout).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("still computes and delivers an active fallback when workers cannot be created", async () => {
    unavailable();
    await expect(startLayout(input).result).resolves.toEqual(new Float64Array([1, 2]));
    expect(forceLayout).toHaveBeenCalledOnce();
  });

  it("preserves a rejected fallback computation", async () => {
    unavailable();
    vi.mocked(forceLayout).mockImplementationOnce(() => { throw new Error("layout failed"); });
    await expect(startLayout(input).result).rejects.toThrow("layout failed");
  });

  it("ignores a queued worker error or result after cancellation", async () => {
    const job = startLayout(input);
    const receive = vi.fn();
    void job.result.then(receive);
    const worker = workers[0];
    const error = worker.onerror!, message = worker.onmessage!;
    job.cancel();
    error();
    message({ data: new Float64Array([9, 10]) } as MessageEvent<Float64Array>);
    await Promise.resolve();
    expect(worker.terminate).toHaveBeenCalled();
    expect(forceLayout).not.toHaveBeenCalled();
    expect(receive).not.toHaveBeenCalled();
  });

  it("delivers worker positions without a fallback", async () => {
    const job = startLayout(input);
    workers[0].onmessage!({ data: new Float64Array([3, 4]) } as MessageEvent<Float64Array>);
    await expect(job.result).resolves.toEqual(new Float64Array([3, 4]));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(forceLayout).not.toHaveBeenCalled();
  });

  it("still falls back after an active worker error", async () => {
    const job = startLayout(input);
    workers[0].onerror!();
    await expect(job.result).resolves.toEqual(new Float64Array([1, 2]));
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(forceLayout).toHaveBeenCalledOnce();
  });
});
