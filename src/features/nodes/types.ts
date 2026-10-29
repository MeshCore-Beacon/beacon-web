import type { CursorPage } from "../../types/api";

export interface NodeIATA {
  iata: string;
  lastHeard: number; // unix ms
}

export interface NodeSummary {
  id: string;
  publicKey: string;
  nodeType: number;
  nodeTypeName: string;
  name: string | null;
  lat: number | null;
  lng: number | null;
  radio?: string; // compact "freq,bw,sf" string, e.g. "915,250,11"; absent when unknown
  defaultScope?: string; // most recently matched transport scope name, e.g. "#bc"
  iatas: NodeIATA[];
  knownNeighborCount: number; // distinct first-hop neighbors we've resolved for this node
  neighborIds?: string[]; // first-hop neighbor node ids; only present when the list request opts in (?neighbors)
  // Set when this node also runs as an observer (watches traffic for uplink). isObserver drives the
  // map's observer-pip marker variant; observerId, when present, links to that observer's detail.
  isObserver?: boolean;
  observerId?: string;
  // Server verdict against its configured local border union; absence is unknown/disabled.
  possiblyForeign?: boolean;
  stale?: boolean; // server-configured freshness threshold; absent on older servers
}

// /nodes orders besides the default (lastSeen, newest first); server 2.1.0+
export type NodeSort = "name" | "type" | "neighbors";

// A /nodes page. sort/order name the order its items are in; a server before 2.1.0 leaves them out
// (and ignores the sort it was asked for).
export interface NodePage extends CursorPage<NodeSummary> {
  sort?: NodeSort | "lastSeen";
  order?: "asc" | "desc";
}

export interface Node extends NodeSummary {
  locationSource: string | null;
  lastAdvertAt: number | null; // epoch ms
  supportsMultibytePaths: boolean;
  supportsMultibyteTraces: boolean;
  minFirmwareVersion: string | null;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
  metadata: Record<string, unknown> | null;
  // Clock drift, repeaters/room servers only; absent for other types or before a qualifying advert.
  // Device minus server time in seconds (+ve = device ahead). clockCheckedAt == lastAdvertAt.
  // clockOutOfSync is the server's verdict against its threshold — don't recompute it client-side.
  clockDriftSeconds?: number;
  clockOutOfSync?: boolean;
  clockCheckedAt?: number; // epoch ms
  // MeshMapper's record for this repeater; node detail only, absent when the import is off or unmatched.
  meshmapper?: MeshMapperRepeater;
}

// Imported from MeshMapper. Times are epoch ms; every string is admin-entered free text.
export interface MeshMapperRepeater {
  iata?: string;
  fetchedAt: number;
  site: MeshMapperSite;
  carpeater: boolean;
  admins: string[];
  scopes: MeshMapperScope[];
  scopesCheckedAt?: number; // set with empty scopes = it answered with none; absent = never asked
  defaultScope?: MeshMapperDefaultScope; // separate from Node.defaultScope (Beacon's own match)
}

export interface MeshMapperSite {
  power?: string;
  hardware?: string;
  antenna?: string;
  heightM?: number; // above ground
  heightAslM?: number;
  powerSource?: "mains" | "solar" | "battery" | "poe";
  notes?: string;
}

export interface MeshMapperScope {
  scope: string;
  observedAt?: number;
  observedPackets?: number;
  proof?: "multibyte" | "floor";
  reportedAt?: number;
  uploadedAt?: number;
}

export interface MeshMapperDefaultScope {
  name?: string; // only when state is "named"
  state: "named" | "unknown" | "none";
  updatedAt?: number;
  source?: "advert" | "reported";
}

// First-hop neighbor of a node, from GET /nodes/{id}/neighbors (bare array, no pagination).
export interface NodeNeighbor {
  id: string;
  name?: string;
  publicKey: string; // hex-encoded prefix
  nodeType: number;
  nodeTypeName: string;
  lat?: number;
  lng?: number;
  iata: string;
  observationCount: number;
  firstSeen: number; // epoch ms
  lastSeen: number; // epoch ms
}

export interface NodeObservation {
  id: number;
  packetHash: string;
  payloadType: number;
  payloadTypeName: string;
  iata: string;
  heardAt: number; // epoch ms
  rssi?: number;
  snr?: number;
  hopCount?: number;
}
