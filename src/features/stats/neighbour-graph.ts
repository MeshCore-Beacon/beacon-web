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
  label?: { show: boolean; fontSize?: number };
}

export interface GraphLink {
  source: number; // index into GraphNode[]
  target: number;
  obs?: number; // weighted-edge fields, set on the ego view's edges (drive colour + freshness fade)
  ageDays?: number;
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
const HUB_LABELS = 30; // only the biggest hubs get a persistent label, else 1000 nodes are a text wall
const MIN_LABEL = 9;
const MAX_LABEL = 16;

// Busier hubs get a louder label; sqrt so a few giant hubs don't dwarf the rest of the labelled set.
export function labelSize(degree: number, maxDegree: number): number {
  if (maxDegree <= 0) return MIN_LABEL;
  const t = Math.sqrt(degree) / Math.sqrt(maxDegree);
  return Math.round(MIN_LABEL + (MAX_LABEL - MIN_LABEL) * t);
}

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
      label:
        i < HUB_LABELS && n.knownNeighborCount > 0
          ? { show: true, fontSize: labelSize(n.knownNeighborCount, maxDegree) }
          : undefined,
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

const CENTER_SIZE = 30;
const NEIGHBOUR_SIZE = 14;

function egoNode(id: string, name: string | null, nodeTypeName: string, size: number, degree: number): GraphNode {
  const cat = (NODE_TYPE_NAMES as readonly string[]).indexOf(nodeTypeName);
  return {
    id,
    name: name ?? id.slice(0, 6),
    category: cat === -1 ? OTHER_CATEGORY : cat,
    nodeTypeName,
    degree,
    symbolSize: size,
    label: { show: true },
  };
}

// The focused view: one centre node with its neighbours fanned out around it. Neighbours come from
// GET /nodes/{id}/neighbors (one row per neighbour+iata), folded per neighbour — obs summed, age from
// the freshest lastSeen. Edges carry those weights so the option can colour/fade them like the map.
export function buildEgoGraph(
  center: { id: string; name: string | null; nodeTypeName: string },
  neighbors: NodeNeighbor[],
  now: number,
): NeighbourGraph {
  const folded = new Map<string, { name: string | null; nodeTypeName: string; obs: number; lastSeen: number }>();
  for (const nb of neighbors) {
    if (nb.id === center.id) continue;
    const prev = folded.get(nb.id);
    if (prev) {
      prev.obs += nb.observationCount;
      prev.lastSeen = Math.max(prev.lastSeen, nb.lastSeen);
    } else {
      folded.set(nb.id, { name: nb.name ?? null, nodeTypeName: nb.nodeTypeName, obs: nb.observationCount, lastSeen: nb.lastSeen });
    }
  }

  const nodes: GraphNode[] = [egoNode(center.id, center.name, center.nodeTypeName, CENTER_SIZE, folded.size)];
  const links: GraphLink[] = [];
  for (const [id, n] of folded) {
    // push the link first so target points at the node's about-to-be index
    links.push({ source: 0, target: nodes.length, obs: n.obs, ageDays: Math.max(0, (now - n.lastSeen) / 86_400_000) });
    nodes.push(egoNode(id, n.name, n.nodeTypeName, NEIGHBOUR_SIZE, 0));
  }
  return { nodes, links, total: nodes.length, capped: false };
}

// One legend/category per device type (in NODE_TYPES order) plus an "Other" bucket for unknowns; the
// GraphNode.category index lines up with this list.
function graphCategories(c: ChartColors) {
  return [
    ...NODE_TYPES.map((t) => ({ name: t.label, itemStyle: { color: nodeTypeColor(t.name, c) } })),
    { name: "Other", itemStyle: { color: c.primaryDim } },
  ];
}

// The themed ECharts force-graph option, for both the full mesh and the ego (single-node focus) view.
// No hover-adjacency emphasis: it toggles on/off as a dragged node lags the cursor, which flickers the
// graph. Focus is instead the ego view (opts.ego), a clean re-render the caller swaps in.
export function neighbourGraphOption(
  graph: NeighbourGraph,
  c: ChartColors,
  opts: { ego?: boolean } = {},
): EChartsOption {
  const ego = !!opts.ego;
  const big = graph.nodes.length > 500; // settle without animating once the full mesh gets dense
  // weighted edges (ego view) get an obs→colour, freshness→opacity line; plain mesh edges stay uniform
  const links = graph.links.map((l) =>
    l.obs != null
      ? { ...l, lineStyle: { color: obsColor(l.obs, c), opacity: ageOpacity(l.ageDays ?? 0), width: 1.8 } }
      : l,
  );
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
          if (obs == null) return ""; // uniform mesh edge — nothing to show
          const days = Math.round((param.data.ageDays as number) ?? 0);
          return `${obs} obs · ${days === 0 ? "seen today" : `seen ${days}d ago`}`;
        }
        const d = param.data as unknown as GraphNode;
        const type = d.nodeTypeName || "unknown";
        return d.degree > 0 ? `${d.name}\n${type} · ${d.degree} neighbour${d.degree === 1 ? "" : "s"}` : `${d.name}\n${type}`;
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
        force: ego
          ? { repulsion: 320, edgeLength: 120, gravity: 0.05, friction: 0.15, layoutAnimation: true }
          : { repulsion: big ? 60 : 120, edgeLength: big ? [20, 60] : [40, 90], gravity: 0.08, friction: 0.2, layoutAnimation: !big },
        emphasis: { focus: "none", scale: false },
        label: { show: false, position: "right", color: c.textNormal, fontFamily: MONO, fontSize: 9 },
        labelLayout: { hideOverlap: true },
        lineStyle: { color: withAlpha(c.textMuted, 0.22), width: 0.6 },
        itemStyle: { borderColor: c.bgBase, borderWidth: 0.5 },
        data: graph.nodes,
        links,
      },
    ],
  };
}
