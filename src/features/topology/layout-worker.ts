import { buildTopology, type Topology } from "./topology";
import type { NodeSummary } from "../nodes/types";

export interface TopologyLayoutInput {
  nodes: NodeSummary[];
  iatas: string[] | undefined;
  routes: [string, string][];
}

// Match the upstream neighbour-graph worker lifecycle: a cancelled job is
// terminated, not left competing with the next region's layout.
export function startTopologyLayout(input: TopologyLayoutInput) {
  let worker: Worker | undefined, cancelled = false;
  const fallback = () => buildTopology(input.nodes, input.iatas, input.routes);
  const result = new Promise<Topology>((resolve, reject) => {
    const runFallback = () => {
      if (cancelled) return;
      try { resolve(fallback()); } catch (error) { reject(error); }
    };
    try {
      worker = new Worker(new URL("./topology-layout.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<Topology>) => {
        worker?.terminate();
        if (!cancelled) resolve(event.data);
      };
      worker.onerror = () => { worker?.terminate(); runFallback(); };
      worker.postMessage(input);
    } catch {
      worker?.terminate();
      // Deferral lets cleanup cancel a fallback before it starts.
      queueMicrotask(runFallback);
    }
  });
  return { result, cancel: () => { cancelled = true; worker?.terminate(); } };
}
