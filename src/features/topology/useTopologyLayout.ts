import { useEffect, useState } from "react";
import { buildTopology, type Topology } from "./topology";
import { startTopologyLayout, type TopologyLayoutInput } from "./layout-worker";

const EMPTY = buildTopology([]);

// TopologySession is keyed by region. Keep its last complete graph during a
// same-region refresh, and never apply a cancelled layout to newer inputs.
export function useTopologyLayout(input: TopologyLayoutInput, active: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ input: TopologyLayoutInput; attempt: number; graph: Topology; error?: boolean }>();
  useEffect(() => {
    if (!active || !input.nodes.length) return;
    const job = startTopologyLayout(input);
    let live = true;
    void job.result.then(graph => {
      if (live) setDone({ input, attempt, graph });
    }).catch(() => {
      if (live) setDone(previous => ({ input, attempt, graph: previous?.graph ?? EMPTY, error: true }));
    });
    return () => { live = false; job.cancel(); };
  }, [input, active, attempt]);
  const current = done?.input === input && done?.attempt === attempt;
  return {
    graph: input.nodes.length ? done?.graph ?? EMPTY : EMPTY,
    pending: active && input.nodes.length > 0 && !current,
    error: current && done?.error,
    retry: () => setAttempt(value => value + 1),
  };
}
