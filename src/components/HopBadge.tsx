import type { Observation } from "../types/api";
import { VARIANT_CLASSES } from "./badge-utils";

// renders a path hop with confidence-based styling

export function HopBadge({ hop }: { hop: Observation["resolvedPath"][number] }) {
  if (hop.confidence === "high" && hop.node) {
    return (
      <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.advert}`}>
        {hop.node.name}
      </span>
    );
  }
  if (hop.confidence === "ambiguous" && hop.candidates) {
    return (
      <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.trace}`}>
        {hop.idBytes?.toUpperCase()} ({hop.candidates.length} candidates)
      </span>
    );
  }
  return (
    <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.default}`}>
      {hop.idBytes?.toUpperCase() ?? "??"}
    </span>
  );
}
