import type { Observation } from "../types/api";
import { VARIANT_CLASSES } from "./badge-utils";

export function HopBadge({ hop }: { hop: Observation["resolvedPath"][number] }) {
  if (hop.confidence === "high" && hop.node) {
    return (
      <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.advert}`}>
        {hop.node.name ?? hop.node.publicKey.slice(0, 8)}
      </span>
    );
  }
  if (hop.confidence === "low" && hop.node) {
    return (
      <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.trace}`}>
        {hop.node.name ?? hop.node.publicKey.slice(0, 8)}
      </span>
    );
  }
  return (
    <span className={`px-1.5 py-0.5 rounded-sm border font-medium ${VARIANT_CLASSES.default}`}>
      ??
    </span>
  );
}
