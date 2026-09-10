import type { PacketSummary } from "../../types/api";
import { PayloadType } from "../../types/enums";

export interface PathSearch {
  hashSize: number;
  bytes: string;
}

// Parse once per search change; complete hop hashes make the width unambiguous.
export function parsePathSearch(query: string): PathSearch | null {
  const text = query.trim().toLowerCase();
  if (!text) return { hashSize: 0, bytes: "" };
  if (text.length > 1024) return null;
  const hops = text.split(/[\s,→]+/);
  const width = hops[0]!.length;
  if (!hops.every(hop => hop.length === width && /^(?:[0-9a-f]{2}){1,4}$/.test(hop))) return null;
  return { hashSize: width / 2, bytes: hops.join("") };
}

export function matchesPathSearch(packet: PacketSummary, search: PathSearch | null): boolean {
  if (!search) return false;
  if (!search.bytes) return true;
  const observer = packet.latestObserver;
  const length = observer?.pathLength;
  const bytes = observer?.pathBytes;
  // TRACE summaries carry SNR samples here, not the relay hashes from trace detail.
  if (packet.payloadType === PayloadType.TRACE || !length || !bytes ||
      length.hashSize !== search.hashSize || !Number.isInteger(length.hopCount) || length.hopCount <= 0 ||
      bytes.length !== length.hopCount * length.hashSize * 2 || search.bytes.length > bytes.length ||
      !/^[0-9a-f]+$/i.test(bytes)) return false;
  const path = bytes.toLowerCase();
  for (let offset = 0; offset <= path.length - search.bytes.length; offset += search.hashSize * 2) {
    if (path.startsWith(search.bytes, offset)) return true;
  }
  return false;
}
