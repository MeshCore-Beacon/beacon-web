import type { Feature, FeatureCollection, Point } from "geojson";
import type { NodeSummary } from "../nodes/types";
import { microToDeg } from "../../lib/formatters";

// Build the maplibre GeoJSON source from the nodes API response. Properties stay primitive because
// clustering serializes them, and there's no maplibre import, so this stays unit-testable.

export interface NodeFeatureProps {
  id: string;
  name: string | null;
  nodeTypeName: string;
  isObserver: boolean; // role flag; selects the observer-pip marker variant (default false)
}

export function nodesToFeatureCollection(
  nodes: NodeSummary[],
): FeatureCollection<Point, NodeFeatureProps> {
  const features: Feature<Point, NodeFeatureProps>[] = [];
  for (const n of nodes) {
    // != null keeps 0 (a valid coordinate) while dropping null/undefined
    if (n.lat == null || n.lng == null) continue;
    features.push({
      type: "Feature",
      // GeoJSON/maplibre order is [lng, lat]; scale the API's microdegrees to decimal (microToDeg)
      geometry: { type: "Point", coordinates: [microToDeg(n.lng), microToDeg(n.lat)] },
      properties: {
        id: n.id,
        name: n.name,
        nodeTypeName: n.nodeTypeName,
        isObserver: !!n.isObserver,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

// Filter to a single device type ("" = All). Filtering the data (not a layer filter) lets the
// clustered source re-count only the visible type.
export function filterByNodeType(
  fc: FeatureCollection<Point, NodeFeatureProps>,
  typeName: string,
): FeatureCollection<Point, NodeFeatureProps> {
  if (typeName === "") return fc;
  return { ...fc, features: fc.features.filter((f) => f.properties.nodeTypeName === typeName) };
}
