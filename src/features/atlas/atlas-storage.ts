export const ATLAS_KEY = "beacon-my-atlas-v2";
export const ATLAS_LEGACY_KEY = "beacon-my-atlas-v1";
export const ATLAS_LIMIT = 12;
export type AtlasRange = "24h" | "3d";
export interface AtlasPin { id: string; publicKey: string; name: string; kind?: "node" | "observer" }
export interface SavedAtlas { version: 2; range: AtlasRange; cards: AtlasPin[] }
const UUID = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const KEY = /^[\da-f]{64}$/i;

export const atlasPinKey = (pin: AtlasPin) => `${pin.kind ?? "node"}:${pin.publicKey || pin.id}`;

// Read v1 without overwriting it: an older deployed frontend can still recover its node pins.
export function parseAtlas(raw: string | null): SavedAtlas {
  const empty: SavedAtlas = { version: 2, range: "24h", cards: [] };
  try {
    if (!raw || raw.length > 32_000) return empty;
    const value = JSON.parse(raw);
    const input = value?.version === 1 ? value.nodes : value?.version === 2 ? value.cards : null;
    if (!Array.isArray(input)) return empty;
    const cards: AtlasPin[] = [];
    for (const item of input) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const kind = value.version === 1 ? "node" : item?.kind;
      if (kind !== "node" && kind !== "observer") continue;
      if (typeof item.id !== "string" || !(UUID.test(item.id) || (kind === "node" && item.id === ""))) continue;
      if (kind === "observer" && item.id === "00000000-0000-0000-0000-000000000000") continue;
      if (typeof item.publicKey !== "string" || !(KEY.test(item.publicKey) || (kind === "observer" && item.publicKey === ""))) continue;
      const pin: AtlasPin = { kind, id: item.id.toLowerCase(), publicKey: item.publicKey.toLowerCase(), name: typeof item.name === "string" ? item.name.slice(0, 160) : "" };
      if (cards.some(card => atlasPinKey(card) === atlasPinKey(pin))) continue;
      cards.push(pin);
      if (cards.length === ATLAS_LIMIT) break;
    }
    return { version: 2, range: value.range === "3d" ? "3d" : "24h", cards };
  } catch { return empty; }
}
