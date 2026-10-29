import { forceLayout, type ForceLayoutInput } from "./graph-layout";

export interface LayoutJob {
  result: Promise<Float64Array>;
  cancel: () => void;
}

// One worker per layout, so cancelling a stale one also stops its work. If workers are unavailable
// the layout runs here instead: a frozen page beats a graph that never shows.
export function startLayout(input: ForceLayoutInput): LayoutJob {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./graph-layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return { result: Promise.resolve().then(() => forceLayout(input)), cancel: () => {} };
  }
  const result = new Promise<Float64Array>((resolve) => {
    worker.onmessage = (e: MessageEvent<Float64Array>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(forceLayout(input));
    };
  });
  worker.postMessage(input);
  return { result, cancel: () => worker.terminate() };
}
