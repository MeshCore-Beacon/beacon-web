import { describe, expect, it } from "vitest";
import { atlasFile, parseAtlas, readAtlasFile, type SavedAtlas } from "../../../src/features/atlas/atlas";
import { fromServer, toPut, type ServerAtlas } from "../../../src/features/atlas/atlasSync";

const nodeId = "11111111-1111-4111-8111-111111111111";
const observerId = "22222222-2222-4222-8222-222222222222";
const nodeKey = "ab".repeat(32);
const observerKey = "cd".repeat(32);
const emoji = "\u{1f600}";
const saved = (name: string): SavedAtlas => ({ version: 2, range: "3d", pins: [
  { kind: "node", id: nodeId, publicKey: nodeKey, name },
  { kind: "observer", observerId, name },
] });
const server = (name: string): ServerAtlas => ({ revision: 7, limit: 20, range: "3d", pins: [
  { kind: "node", id: nodeId, publicKey: nodeKey, observerId: null, name },
  { kind: "observer", observerId, observerPublicKey: observerKey, name },
] });

describe("Atlas name code-point limit", () => {
  it.each([
    ["160 supplementary characters", emoji.repeat(160), emoji.repeat(160)],
    ["mixed boundary", "A".repeat(159) + emoji, "A".repeat(159) + emoji],
    ["161 supplementary characters", emoji.repeat(161), emoji.repeat(160)],
    ["complete pair at truncation", "A".repeat(159) + emoji + emoji, "A".repeat(159) + emoji],
    ["ASCII overflow", "A".repeat(161), "A".repeat(160)],
    ["BMP overflow", "\u6f22".repeat(161), "\u6f22".repeat(160)],
    ["combining sequences without normalization", "e\u0301".repeat(80) + "!", "e\u0301".repeat(80)],
    ["newline and tab", ("\n\t" + emoji).repeat(53) + emoji, ("\n\t" + emoji).repeat(53) + emoji],
  ])("preserves both pin kinds through restore, file and account conversion: %s", (_label, name, expectedName) => {
    const expected = saved(expectedName);
    expect(parseAtlas(JSON.stringify(saved(name)))).toEqual(expected);
    expect(readAtlasFile(atlasFile(saved(name), 1))).toEqual({ atlas: expected, skipped: 0 });
    const adopted = fromServer(server(name), null, {});
    expect(adopted.atlas).toEqual(expected);
    const put = toPut(adopted.atlas, adopted.keys, 7);
    expect(put).toEqual({ baseRevision: 7, range: "3d", pins: [
      { kind: "node", publicKey: nodeKey, name: expectedName },
      { kind: "observer", observerId, name: expectedName },
    ] });
    expect(readAtlasFile(atlasFile(expected, 1), 1)).toEqual({ atlas: { ...expected, pins: expected.pins.slice(0, 1) }, skipped: 1 });
  });
});
