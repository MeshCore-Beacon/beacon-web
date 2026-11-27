import { describe, expect, it } from "vitest";
import { ATLAS_FILE_MAX_BYTES, ATLAS_LIMIT_MAX, atlasFile, parseAtlas, readAtlasFile, type NodePin, type SavedAtlas } from "../../../src/features/atlas/atlas";

function collection(name: string): SavedAtlas {
  const pins: NodePin[] = Array.from({ length: ATLAS_LIMIT_MAX }, (_, i) => ({
    kind: "node",
    id: `00000000-0000-0000-0000-${(i + 1).toString().padStart(12, "0")}`,
    publicKey: (i + 1).toString(16).padStart(64, "0"),
    observerId: `00000000-0000-0000-0000-${(i + 1).toString().padStart(12, "0")}`,
    name,
    view: "telemetry",
    tiles: ["queue", "errors", "snr", "rssi"],
    telemetryTiles: ["temperature", "packets", "signal", "errors"],
  }));
  return { version: 2, range: "3d", pins };
}

describe("Atlas document budget", () => {
  it.each(["N".repeat(160), "\u0000\\".repeat(80)])("restores and imports the supported collection with all settings (%#)", (name) => {
    const saved = collection(name);
    const raw = JSON.stringify(saved);
    expect(raw.length).toBeGreaterThan(32_000);
    expect(parseAtlas(raw)).toEqual(saved);
    const exported = atlasFile(saved, 1);
    expect(new TextEncoder().encode(exported).byteLength).toBeLessThan(ATLAS_FILE_MAX_BYTES);
    expect(readAtlasFile(exported, ATLAS_LIMIT_MAX)).toEqual({ atlas: saved, skipped: 0 });
    expect(readAtlasFile(exported, 12)).toEqual({ atlas: { ...saved, pins: saved.pins.slice(0, 12) }, skipped: ATLAS_LIMIT_MAX - 12 });
  });

  it("still rejects oversized valid JSON before normalizing an individual pin", () => {
    const saved = collection("Node");
    const raw = JSON.stringify({ ...saved, pins: [{ ...saved.pins[0], name: "N".repeat(ATLAS_FILE_MAX_BYTES) }] });
    expect(raw.length).toBeGreaterThan(ATLAS_FILE_MAX_BYTES);
    expect(parseAtlas(raw).pins).toEqual([]);
  });
});
