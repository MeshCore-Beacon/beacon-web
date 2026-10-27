import { useEffect, useState } from "react";
import { startLayout } from "./layout-worker";
import { meshLayoutInput, type NeighbourGraph } from "./neighbour-graph";

// Positions for `graph` from the layout worker, or null while it runs. A new graph (another region)
// or unmounting stops the running job, and a result only ever applies to the graph it was made for.
export function useGraphLayout(graph: NeighbourGraph, enabled: boolean): Float64Array | null {
  const [done, setDone] = useState<{ graph: NeighbourGraph; xy: Float64Array } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const job = startLayout(meshLayoutInput(graph));
    let live = true;
    void job.result.then((xy) => {
      if (live) setDone({ graph, xy });
    });
    return () => {
      live = false;
      job.cancel();
    };
  }, [graph, enabled]);
  return done?.graph === graph ? done.xy : null;
}
