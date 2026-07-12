import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRegion } from "../../hooks/useRegion";
import { useMapNodesData } from "../map/useMapNodesData";
import { getNodeNeighbors } from "../../api/client";
import { useChartColors } from "./chartTheme";
import { buildNeighbourGraph, buildEgoGraph, neighbourGraphOption } from "./neighbour-graph";
import { NeighbourGraph } from "./NeighbourGraph";
import { EmptyState } from "../../components/EmptyState";

// Most-connected nodes rendered; past this the canvas force layout bogs down. Reuses the map's node
// query (same cache), so the whole region still loads — this only caps what the full mesh draws.
const CAP = 1000;

export function NeighbourGraphTab() {
  const { iatas, regionKey } = useRegion();
  // "All regions" is 5k+ nodes — too heavy for the canvas force layout, so gate the fetch off and
  // prompt for a region instead of freezing the browser.
  const isAll = regionKey === "*";
  const { nodes, loadedCount, isPaging, isError } = useMapNodesData(iatas, regionKey, { enabled: !isAll });
  const colors = useChartColors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // a different region is a different mesh — drop any stale selection (adjust-during-render, no effect)
  const [region, setRegion] = useState(regionKey);
  if (region !== regionKey) {
    setRegion(regionKey);
    setSelectedId(null);
  }

  const graph = useMemo(() => buildNeighbourGraph(nodes, CAP), [nodes]);
  const selectedNode = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null),
    [selectedId, nodes],
  );

  // Selected node's neighbours (shared cache with the map + node panel); dataUpdatedAt stands in for
  // "now" so the freshness fade is pure at render time.
  const { data: neighbours, dataUpdatedAt } = useQuery({
    queryKey: ["node-neighbors", selectedId],
    queryFn: () => getNodeNeighbors(selectedId!),
    enabled: !!selectedId,
    staleTime: 30_000,
  });
  const ego = useMemo(() => {
    if (!selectedId || !neighbours) return null;
    // fall back to a bare centre if the node was heard from another region (not in the loaded set)
    const center = selectedNode ?? { id: selectedId, name: null, nodeTypeName: "" };
    return buildEgoGraph(center, neighbours, dataUpdatedAt);
  }, [selectedId, selectedNode, neighbours, dataUpdatedAt]);

  const option = useMemo(() => neighbourGraphOption(ego ?? graph, colors, { ego: !!ego }), [ego, graph, colors]);

  if (isAll)
    return (
      <EmptyState
        title="Pick a region"
        subtitle="All regions is 5,000+ nodes — choose a region from the REGION picker above, or narrow to an IATA, to view its mesh."
      />
    );
  if (isError) return <EmptyState title="Neighbour Graph" subtitle="Failed to load nodes" />;
  // build only once the pager settles, or the force layout would restart on every streamed page
  if (isPaging) return <EmptyState title="Loading mesh…" subtitle={`${loadedCount} nodes`} />;
  if (graph.nodes.length === 0) return <EmptyState title="Neighbour Graph" subtitle="No nodes in this region" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {ego ? (
        <div className="shrink-0 border-b border-border bg-bg-surface px-4 py-2 text-center text-xs font-mono text-text-muted">
          Neighbourhood of <span className="text-text-normal">{selectedNode?.name ?? selectedId}</span> · {ego.nodes.length - 1} neighbours — click empty space for the full mesh
        </div>
      ) : (
        graph.capped && (
          <div className="shrink-0 border-b border-border bg-bg-surface px-4 py-2 text-center text-xs font-mono text-text-muted">
            Showing the {CAP} most-connected of {graph.total} nodes — narrow to an IATA to see the rest.
          </div>
        )
      )}
      <div className="min-h-0 flex-1">
        <NeighbourGraph option={option} onSelect={setSelectedId} />
      </div>
    </div>
  );
}
