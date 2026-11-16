import { describe, expect, it } from "vitest";
import { nodeContacts } from "../../../src/features/nodes/node-contacts";
import type { NodeSummary } from "../../../src/features/nodes/types";

const node = (over: Partial<NodeSummary> = {}): NodeSummary => ({ id: "id", publicKey: "ab".repeat(32), name: "Hill ☀", nodeType: 2, nodeTypeName: "REPEATER", lat: 43, lng: -80, iatas: [], knownNeighborCount: 0, ...over });

describe("contact-file export", () => {
  it("exports a public contact without invented paths, times or private metadata", () => {
    const input = { ...node({ lastSeen: 1794810000000 }), privateKey: "secret", password: "secret", out_path_list: ["ab"] };
    expect(nodeContacts([input])).toEqual({ file: { contacts: [{ type: 2, name: "Hill ☀", custom_name: null, public_key: "ab".repeat(32), flags: 0, latitude: "43", longitude: "-80", last_advert: 0, last_modified: 0, out_path_list: null }] }, skipped: 0 });
  });

  it.each([1, 2, 3, 4])("preserves supported role %s", type => {
    expect(nodeContacts([node({ nodeType: type })]).file.contacts[0].type).toBe(type);
  });

  it.each([
    { name: null }, { name: "  " }, { publicKey: "ab" }, { publicKey: "ab".repeat(33) }, { publicKey: "zz".repeat(32) },
    { nodeType: 0 }, { nodeType: 5 }, { nodeType: 2.5 }, { lat: null }, { lng: null }, { lat: NaN }, { lng: Infinity },
    { lat: 91 }, { lng: -181 }, { lat: 0, lng: 0 },
  ])("skips unusable identity/location metadata %j", over => {
    expect(nodeContacts([node(over)])).toEqual({ file: { contacts: [] }, skipped: 1 });
  });

  it("keeps a real zero coordinate and deduplicates full keys case-insensitively", () => {
    const result = nodeContacts([node({ lat: 0, publicKey: "AB".repeat(32) }), node(), node({ publicKey: "cd".repeat(32), lng: 0 })]);
    expect(result.file.contacts).toHaveLength(2);
    expect(result.file.contacts[0].latitude).toBe("0");
    expect(result.file.contacts[1].longitude).toBe("0");
    expect(result.skipped).toBe(1);
  });

  it("does not let an invalid duplicate suppress a usable row", () => {
    const result = nodeContacts([node({ lat: null }), node()]);
    expect(result.file.contacts).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });
});
