import type { PacketSummary, ResolvedHop } from "../../types/api";
import type { PathConfidence } from "../../types/enums";
import { PayloadType } from "../../types/enums";

// How many hops line 2 is allowed to spend on chips before it truncates. An unresolved run costs
// its own length, so "?×4" uses four of the five.
export const MAX_PATH_HOPS_SHOWN = 5;

export type PathChip =
  | { kind: "node"; label: string; confidence: PathConfidence }
  | { kind: "hex"; label: string }
  | { kind: "unresolved-run"; count: number };

export interface PathSummary {
  hopLabel: string;
  chips: PathChip[];
  overflow: number; // hops not represented by a visible chip
  isNa: boolean;
}

const NA: PathSummary = { hopLabel: "n/a", chips: [], overflow: 0, isNa: true };

function hopChip(hop: ResolvedHop): PathChip | null {
  if (hop.confidence === "none") return null;
  const node = hop.nodes[0];
  const label = node?.name ?? node?.publicKey.slice(0, 8) ?? "?";
  return { kind: "node", label, confidence: hop.confidence };
}

function chipsFromResolved(path: ResolvedHop[]): PathChip[] {
  const out: PathChip[] = [];
  for (const hop of path) {
    const chip = hopChip(hop);
    if (chip) { out.push(chip); continue; }
    const last = out[out.length - 1];
    if (last?.kind === "unresolved-run") last.count += 1;
    else out.push({ kind: "unresolved-run", count: 1 });
  }
  return out;
}

function chipsFromHex(pathBytes: string, hashSize: number): PathChip[] {
  const width = hashSize * 2;
  const out: PathChip[] = [];
  for (let i = 0; i < pathBytes.length; i += width) {
    out.push({ kind: "hex", label: pathBytes.slice(i, i + width) });
  }
  return out;
}

export function buildPathSummary(packet: PacketSummary): PathSummary {
  const observer = packet.latestObserver;
  const length = observer?.pathLength;
  // No hashSize means no way to split pathBytes — never guess a chunk width.
  if (!observer || !length) return NA;

  const { hopCount, hashSize } = length;
  const base = { hopLabel: `${hopCount} hops`, chips: [] as PathChip[], overflow: 0, isNa: false };

  if (hopCount === 0) return { ...base, hopLabel: "0 hops · direct" };

  // TRACE repurposes the path field to carry per-hop SNR samples, so its bytes are not hashes.
  // Only the detail endpoint swaps in real trace hashes; the list and WS never do.
  if (packet.payloadType === PayloadType.TRACE) return base;

  const bytes = observer.pathBytes;
  const resolved = observer.resolvedPath;
  const all = resolved?.length
    ? chipsFromResolved(resolved)
    : bytes && bytes.length === hopCount * hashSize * 2
      ? chipsFromHex(bytes, hashSize)
      : [];
  if (all.length === 0) return base;

  const chips: PathChip[] = [];
  let spent = 0;
  for (const chip of all) {
    const cost = chip.kind === "unresolved-run" ? chip.count : 1;
    if (chips.length > 0 && spent + cost > MAX_PATH_HOPS_SHOWN) break;
    chips.push(chip);
    spent += cost;
  }

  return { ...base, chips, overflow: Math.max(0, hopCount - spent) };
}
