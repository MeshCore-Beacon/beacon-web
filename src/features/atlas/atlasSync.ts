import { NO_NODE_ID, effectiveRange, parseAtlas, pinKey, type AtlasPin, type NodePin, type AtlasRange, type AtlasView, type ObserverTile, type SavedAtlas, type TelemetryTile } from "./atlas";

// The account document, as /me/atlas answers it. Times and ids follow the API contract.
export interface ServerNodePin { kind: "node"; publicKey: string; id: string | null; name: string; observerId: string | null; tiles?: ObserverTile[]; telemetryTiles?: TelemetryTile[]; view?: AtlasView }
export interface ServerObserverPin { kind: "observer"; observerPublicKey: string; observerId: string | null; name: string; tiles?: ObserverTile[] }
export interface ServerAtlas { revision: number; range: AtlasRange; limit: number; pins: (ServerNodePin | ServerObserverPin)[] }

export type PutPin =
  | { kind: "node"; publicKey: string; name: string; tiles?: ObserverTile[]; telemetryTiles?: TelemetryTile[]; view?: AtlasView }
  | { kind: "observer"; observerId: string; name: string; tiles?: ObserverTile[] }
  | { kind: "observer"; observerPublicKey: string; name: string; tiles?: ObserverTile[] };
export interface PutAtlas { baseRevision: number; range: AtlasRange; pins: PutPin[] }

// observerId -> public key, for the observers the server has told us about. Kept in memory only, so the
// stored shape stays what older builds and the app's import read.
export type ObserverKeys = Record<string, string>;

const PLACEHOLDER_PREFIX = "00000000-0000-4000-8000-";
// An observer the server no longer knows by id still needs a distinct local id.
export const placeholderObserverId = (publicKey: string) => PLACEHOLDER_PREFIX + publicKey.slice(0, 12).toLowerCase();
const isPlaceholder = (id: string) => id.startsWith(PLACEHOLDER_PREFIX);

export const emptyAtlas = (): SavedAtlas => ({ version: 2, range: "24h", pins: [] });

// The server document as a local Atlas. `previous` lends the ids the server could not resolve. A server
// without Telemetry tab support never stores `view: "telemetry"` or `telemetryTiles`, so with
// `keepTelemetry` the previous local pin's two stay in this browser's copy. Likewise `keep7d`: a server
// without 7d was sent 3d for a local 7d, so its 3d does not replace it.
export function fromServer(doc: ServerAtlas, previous: SavedAtlas | null, known: ObserverKeys, keepTelemetry = false, keep7d = false): { atlas: SavedAtlas; keys: ObserverKeys } {
  const nodeIds = new Map<string, string>();
  const before = new Map<string, NodePin>();
  const observerIds = new Map<string, string>();
  for (const pin of previous?.pins ?? []) {
    if (pin.kind === "node") {
      nodeIds.set(pin.publicKey, pin.id);
      before.set(pin.publicKey, pin);
    }
    else if (known[pin.observerId]) observerIds.set(known[pin.observerId]!, pin.observerId);
  }
  const keys: ObserverKeys = {};
  const pins = doc.pins.map((pin) => {
    const tiles = pin.tiles && { tiles: pin.tiles };
    if (pin.kind === "node") {
      const publicKey = pin.publicKey.toLowerCase();
      if (pin.observerId) keys[pin.observerId] = publicKey;
      const local = keepTelemetry ? before.get(publicKey) : undefined;
      const telemetryTiles = pin.telemetryTiles ?? local?.telemetryTiles;
      const view = pin.view ?? (local?.view === "telemetry" ? local.view : undefined);
      return { kind: "node", id: pin.id ?? nodeIds.get(publicKey) ?? NO_NODE_ID, publicKey, name: pin.name, observerId: pin.observerId ?? undefined, ...tiles, ...(telemetryTiles && { telemetryTiles }), view };
    }
    const key = pin.observerPublicKey.toLowerCase();
    const observerId = pin.observerId ?? observerIds.get(key) ?? placeholderObserverId(key);
    keys[observerId] = key;
    return { kind: "observer", observerId, name: pin.name, ...tiles };
  });
  // Through the local parser so the cap, dedupe and tile defaults match everything else that loads.
  const range = keep7d && previous?.range === "7d" && doc.range === "3d" ? "7d" : doc.range;
  return { atlas: parseAtlas(JSON.stringify({ version: 2, range, pins })), keys };
}

// `telemetry` is the server's `features.atlasTelemetry`. Without it the Telemetry tab's two fields stay
// out of the body, which an older server would reject; a pin on that tab is sent as having no view.
// `atlas7d` is `features.atlas7d`: without it a 7d range goes out as 3d.
export function toPut(saved: SavedAtlas, keys: ObserverKeys, baseRevision: number, telemetry = false, atlas7d = false): PutAtlas {
  const pins = saved.pins.map((pin): PutPin => {
    const tiles = pin.tiles && { tiles: pin.tiles };
    if (pin.kind === "node") {
      const view = telemetry || pin.view !== "telemetry" ? pin.view : undefined;
      return { kind: "node", publicKey: pin.publicKey, name: pin.name, ...tiles, ...(telemetry && pin.telemetryTiles && { telemetryTiles: pin.telemetryTiles }), ...(view && { view }) };
    }
    const key = keys[pin.observerId];
    if (isPlaceholder(pin.observerId) && key) return { kind: "observer", observerPublicKey: key, name: pin.name, ...tiles };
    return { kind: "observer", observerId: pin.observerId, name: pin.name, ...tiles };
  });
  return { baseRevision, range: effectiveRange(saved.range, atlas7d), pins };
}

// Does the server list already hold this local pin, under either of its identities?
function held(pin: AtlasPin, server: AtlasPin[], keys: ObserverKeys): boolean {
  const key = pin.kind === "observer" ? keys[pin.observerId] : undefined;
  return server.some((other) => {
    if (pinKey(other) === pinKey(pin) && other.kind === pin.kind) return true;
    if (pin.kind === "observer") {
      if (other.observerId === pin.observerId) return true;
      return key !== undefined && (other.kind === "node" ? other.publicKey === key : keys[other.observerId] === key);
    }
    return other.kind === "observer" && keys[other.observerId] === pin.publicKey;
  });
}

export interface MergeResult { atlas: SavedAtlas; dropped: number; upload: boolean }

// First sign-in: server pins first, then local pins it does not hold, up to the limit. `upload` says
// whether the result differs from the server copy.
export function mergeAtlas(server: SavedAtlas, local: SavedAtlas, keys: ObserverKeys, limit: number): MergeResult {
  if (local.pins.length === 0) return { atlas: server, dropped: 0, upload: false };
  if (server.pins.length === 0) return { atlas: { ...local, pins: local.pins.slice(0, limit) }, dropped: Math.max(0, local.pins.length - limit), upload: true };
  const extra = local.pins.filter((pin) => !held(pin, server.pins, keys));
  const room = Math.max(0, limit - server.pins.length);
  return {
    atlas: { ...server, pins: [...server.pins, ...extra.slice(0, room)] },
    dropped: Math.max(0, extra.length - room),
    upload: extra.length > 0 && room > 0,
  };
}

export const syncedMarker = (userId: string) => `beacon-atlas-synced:${userId}`;

// The user id the local copy was last synced to, so another account never inherits it.
export const OWNER_KEY = "beacon-atlas-owner";
