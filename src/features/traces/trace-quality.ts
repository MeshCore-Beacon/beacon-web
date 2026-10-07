import type { TraceQuality } from "../../types/api";

export function isQuestionable(quality?: TraceQuality): boolean {
  return quality?.status === "suspect" || quality?.status === "ambiguous";
}
