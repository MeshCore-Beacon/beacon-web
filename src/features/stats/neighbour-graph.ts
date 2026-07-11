import type { NodeSummary, NodeNeighbor } from "../nodes/types";
import { NODE_TYPE_NAMES, NODE_TYPES } from "../../lib/node-types";
import { blend, nodeTypeColor, tooltipStyle, withAlpha, type ChartColors } from "./chartTheme";
import { OBS_STOPS, AGE } from "../map/neighbor-thresholds";
import type { EChartsOption } from "./echarts-setup";

const MONO = "JetBrains Mono, monospace";

// Pure, render-free transform from the region's nodes into an ECharts force-graph shape. Kept
// maplibre- and echarts-free so it stays unit-testable (mirrors features/map/node-geojson.ts).

export interface GraphNode {
  id: string;
  name: string;
  category: number; // index into the node-type categories, or OTHER_CATEGORY for unknown types
  nodeTypeName: string;
  degree: number;
  symbolSize: number;
  label?: { show: boolean };
}

export interface GraphLink {
  source: number; // index into GraphNode[]
  target: number;
}

export interface NeighbourGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  total: number; // nodes before the cap, so callers can show "showing N of total"
  capped: boolean;
}

const OTHER_CATEGORY = NODE_TYPE_NAMES.length;
const MIN_SIZE = 6;
const MAX_SIZE = 34;
const HUB_LABELS = 20; // only the biggest hubs get a persistent label, else 1000 nodes are a text wall

// Keep the top-`cap` most-connected nodes and their internal edges. Unlike the map's edge builder we
// do NOT require coordinates — the graph is non-geographic, so unlocated nodes belong here too.
export function buildNeighbourGraph(nodes: NodeSummary[], cap: number): NeighbourGraph {
  const total = nodes.length;
  // rank by neighbour count, id tie-break so the kept set + indices are stable across re-renders
  const ranked = [...nodes].sort(
    (a, b) => b.knownNeighborCount - a.knownNeighborCount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const kept = ranked.slice(0, cap);
  const capped = total > kept.length;

  const indexById = new Map<string, number>();
  kept.forEach((n, i) => indexById.set(n.id, i));
  const maxDegree = kept.reduce((m, n) => Math.max(m, n.knownNeighborCount), 0);

  const graphNodes: GraphNode[] = kept.map((n, i) => {
    const cat = (NODE_TYPE_NAMES as readonly string[]).indexOf(n.nodeTypeName);
    return {
      id: n.id,
      name: n.name ?? n.id.slice(0, 6),
      category: cat === -1 ? OTHER_CATEGORY : cat,
      nodeTypeName: n.nodeTypeName,
      degree: n.knownNeighborCount,
      symbolSize: symbolSize(n.knownNeighborCount, maxDegree),
      label: i < HUB_LABELS && n.knownNeighborCount > 0 ? { show: true } : undefined,
    };
  });

  const seen = new Set<string>();
  const links: GraphLink[] = [];
  for (const n of kept) {
    if (!n.neighborIds) continue;
    const from = indexById.get(n.id)!;
    for (const otherId of n.neighborIds) {
      if (otherId === n.id) continue; // no self-loops
      const to = indexById.get(otherId);
      if (to === undefined) continue; // skip edges to capped-out / foreign nodes
      const key = n.id < otherId ? `${n.id}|${otherId}` : `${otherId}|${n.id}`;
      if (seen.has(key)) continue; // undirected — one line per pair
      seen.add(key);
      links.push({ source: from, target: to });
    }
  }

  return { nodes: graphNodes, links, total, capped };
}

// sqrt so a few high-degree hubs don't dwarf everything else; floor keeps degree-0 nodes clickable.
function symbolSize(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return MIN_SIZE;
  const t = Math.sqrt(degree) / Math.sqrt(maxDegree);
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * t;
}

// Observation count → colour, log10 axis red→yellow→green (ports the map's line-colour expression).
export function obsColor(obs: number, c: { danger: string; warn: string; green: string }): string {
  const x = Math.log10(Math.max(1, obs));
  if (x <= OBS_STOPS.warn) return blend(c.danger, c.warn, x / OBS_STOPS.warn);
  const t = Math.min(1, (x - OBS_STOPS.warn) / (OBS_STOPS.green - OBS_STOPS.warn));
  return blend(c.warn, c.green, t);
}

// Link age (days) → opacity, solid when fresh, faint by ~4 weeks (ports the map's opacity expression).
export function ageOpacity(ageDays: number): number {
  const t = Math.max(0, Math.min(1, ageDays / AGE.staleDays));
  return AGE.freshOp + (AGE.staleOp - AGE.freshOp) * t;
}

export interface NeighbourWeight {
  obs: number;
  ageDays: number;
}

// Fold the /nodes/{id}/neighbors rows (one per neighbour+iata) into a per-neighbour weight: obs summed
// across iatas, age from the freshest lastSeen. Same reduction the map uses in buildFocusedNeighborEdges.
export function foldNeighbourWeights(
  neighbors: NodeNeighbor[],
  selfId: string,
  now: number,
): Record<string, NeighbourWeight> {
  const folded = new Map<string, { obs: number; lastSeen: number }>();
  for (const nb of neighbors) {
    if (nb.id === selfId) continue;
    const prev = folded.get(nb.id);
    if (prev) {
      prev.obs += nb.observationCount;
      prev.lastSeen = Math.max(prev.lastSeen, nb.lastSeen);
    } else {
      folded.set(nb.id, { obs: nb.observationCount, lastSeen: nb.lastSeen });
    }
  }
  const out: Record<string, NeighbourWeight> = {};
  for (const [id, w] of folded) {
    out[id] = { obs: w.obs, ageDays: Math.max(0, (now - w.lastSeen) / 86_400_000) };
  }
  return out;
}

// One legend/category per device type (in NODE_TYPES order) plus an "Other" bucket for unknowns; the
// GraphNode.category index lines up with this list.
function graphCategories(c: ChartColors) {
  return [
    ...NODE_TYPES.map((t) => ({ name: t.label, itemStyle: { color: nodeTypeColor(t.name, c) } })),
    { name: "Other", itemStyle: { color: c.primaryDim } },
  ];
}

// The themed ECharts force-graph option. Selection styling is applied imperatively (dispatchAction +
// link-only merge) so it never rebuilds this option — see NeighbourGraph.tsx.
export function neighbourGraphOption(graph: NeighbourGraph, c: ChartColors): EChartsOption {
  const big = graph.nodes.length > 500; // settle without animating once the graph gets dense
  return {
    animation: false,
    backgroundColor: "transparent",
    tooltip: {
      ...tooltipStyle(c),
      trigger: "item",
      formatter: (p: unknown) => {
        const param = p as { dataType?: string; data: Record<string, unknown> };
        if (param.dataType === "edge") {
          const obs = param.data.obs as number | undefined;
          if (obs == null) return ""; // ambient (non-selected) edge — nothing to show
          const days = Math.round((param.data.ageDays as number) ?? 0);
          return `${obs} obs · ${days === 0 ? "seen today" : `seen ${days}d ago`}`;
        }
        const d = param.data as unknown as GraphNode;
        return `${d.name}\n${d.nodeTypeName} · ${d.degree} neighbour${d.degree === 1 ? "" : "s"}`;
      },
    },
    legend: [
      {
        data: graphCategories(c).map((cat) => cat.name),
        bottom: 4,
        left: "center",
        icon: "circle",
        itemWidth: 9,
        itemHeight: 9,
        textStyle: { color: c.textNormal, fontFamily: MONO, fontSize: 10 },
        inactiveColor: c.textDim,
      },
    ],
    series: [
      {
        type: "graph",
        layout: "force",
        roam: true,
        draggable: true,
        scaleLimit: { min: 0.2, max: 8 },
        categories: graphCategories(c),
        force: {
          repulsion: big ? 60 : 120,
          edgeLength: big ? [20, 60] : [40, 90],
          gravity: 0.08,
          friction: 0.2,
          layoutAnimation: !big,
        },
        emphasis: { focus: "adjacency", scale: false, label: { show: true }, lineStyle: { width: 1.6 } },
        label: { show: false, position: "right", color: c.textNormal, fontFamily: MONO, fontSize: 9 },
        labelLayout: { hideOverlap: true },
        lineStyle: { color: withAlpha(c.textMuted, 0.22), width: 0.6 },
        itemStyle: { borderColor: c.bgBase, borderWidth: 0.5 },
        data: graph.nodes,
        links: graph.links,
      },
    ],
  };
}
