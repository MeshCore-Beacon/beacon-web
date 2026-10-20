import type { Feature, FeatureCollection, Point } from "geojson";
import type { NodeFeatureProps } from "./node-geojson";
import { PACKET_FLOW_FLASH_MS, type NeighborLinesMode } from "./types";

// Pure helpers for Live Map's lit nodes and idle dots. No maplibre import, so they stay
// unit-testable; useMapPacketFlow owns the layers and the animation loop.

// The map's glyph font has no emoji, so they'd render as boxes. The ranges match the Flutter app's
// rule so both apps label nodes the same way: pictographs, flags, skin tones, tags, variation
// selectors, joiners and the keycap mark.
const PICTOGRAPHS = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u{E0020}-\u{E007F}]|\uFE0E|\uFE0F|\u200D|\u20E3/gu;

export function stripPictographs(name: string): string {
  return name.replace(PICTOGRAPHS, "").replace(/\s+/g, " ").trim();
}

// Full the moment the packet reaches the node, then a linear fade, independent of the trail.
export function nodeGlow(crossedAt: number, now: number): number {
  return Math.min(1, Math.max(0, 1 - (now - crossedAt) / PACKET_FLOW_FLASH_MS));
}

// "All" keeps the map to repeaters and companions; a single-type filter shows just that type.
export function idleDotTypes(typeFilter: string): string[] {
  return typeFilter === "" ? ["repeater", "companion"] : [typeFilter];
}

export interface LiveNodeInfo {
  nodeTypeName: string;
  name: string | null;
}

// Built from the unfiltered node list: packet hops carry no node type, and a crossed node should
// light up whatever the type filter hides.
export function buildLiveNodeIndex(fc: FeatureCollection<Point, NodeFeatureProps>): Map<string, LiveNodeInfo> {
  const index = new Map<string, LiveNodeInfo>();
  for (const f of fc.features) {
    index.set(f.properties.id, { nodeTypeName: f.properties.nodeTypeName, name: f.properties.name });
  }
  return index;
}

export interface LitEntry {
  id: string;
  nodeTypeName: string;
  label: string;
  lng: number;
  lat: number;
  crossedAt: number;
  seq: number; // lit order; the newest draws on top
}

export interface LitFeatureProps {
  id: string;
  nodeTypeName: string;
  label: string;
  seq: number;
  glow: number;
}

export function lightNode(lit: Map<string, LitEntry>, entry: LitEntry): void {
  lit.set(entry.id, entry);
}

// Snapshot the lit nodes for the lit source, dropping any that have faded out.
export function litFeatureCollection(lit: Map<string, LitEntry>, now: number): FeatureCollection<Point, LitFeatureProps> {
  const features: Feature<Point, LitFeatureProps>[] = [];
  for (const [id, e] of lit) {
    const glow = nodeGlow(e.crossedAt, now);
    if (glow <= 0) {
      lit.delete(id);
      continue;
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      properties: { id: e.id, nodeTypeName: e.nodeTypeName, label: e.label, seq: e.seq, glow },
    });
  }
  return { type: "FeatureCollection", features };
}

// In Live the selected node keeps its marker, but a type filter may have dropped it from the map
// data (a lit companion clicked under the Repeater filter), so add it back from the full list.
export function withSelectedNode(
  filtered: FeatureCollection<Point, NodeFeatureProps>,
  all: FeatureCollection<Point, NodeFeatureProps>,
  selectedId: string | null,
): FeatureCollection<Point, NodeFeatureProps> {
  if (!selectedId || filtered.features.some((f) => f.properties.id === selectedId)) return filtered;
  const selected = all.features.find((f) => f.properties.id === selectedId);
  return selected ? { ...filtered, features: [...filtered.features, selected] } : filtered;
}

// Every repeater's neighbour lines would bury the packets, so Live shows only the selected node's.
export function liveNeighborLines(mode: NeighborLinesMode, live: boolean): NeighborLinesMode {
  return live && mode === "on" ? "selected" : mode;
}
