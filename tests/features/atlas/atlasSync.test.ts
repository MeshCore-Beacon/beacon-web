import { describe, expect, it } from "vitest";
import { ATLAS_LIMIT, NO_NODE_ID, type NodePin, type SavedAtlas } from "../../../src/features/atlas/atlas";
import { fromServer, mergeAtlas, placeholderObserverId, toPut, type ServerAtlas } from "../../../src/features/atlas/atlasSync";

const key = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
const node = (n: number, extra: Partial<NodePin> = {}): NodePin => ({ kind: "node", id: uuid(n), publicKey: key(n), name: `N${n}`, ...extra });
const obs = (n: number) => ({ kind: "observer" as const, observerId: uuid(100 + n), name: `O${n}` });
const local = (pins: SavedAtlas["pins"], range: "24h" | "3d" = "24h"): SavedAtlas => ({ version: 2, range, pins });
const doc = (pins: ServerAtlas["pins"], revision = 3, range: "24h" | "3d" = "24h"): ServerAtlas => ({ revision, range, limit: 12, pins });

describe("fromServer", () => {
  it("converts node and observer pins and remembers the observer keys", () => {
    const { atlas, keys } = fromServer(doc([
      { kind: "node", publicKey: key(1), id: uuid(1), name: "Hill", observerId: uuid(101), view: "heard" },
      { kind: "observer", observerPublicKey: key(2), observerId: uuid(102), name: "Ridge", tiles: ["uptime", "battery", "types", "noise"] },
    ], 5, "3d"), null, {});
    expect(atlas).toEqual(local([
      { kind: "node", id: uuid(1), publicKey: key(1), name: "Hill", observerId: uuid(101), view: "heard" },
      { kind: "observer", observerId: uuid(102), name: "Ridge", tiles: ["uptime", "battery", "types", "noise"] },
    ], "3d"));
    expect(keys).toEqual({ [uuid(101)]: key(1), [uuid(102)]: key(2) });
  });

  it("drops the default tile layout like any other load", () => {
    const { atlas } = fromServer(doc([{ kind: "observer", observerPublicKey: key(2), observerId: uuid(102), name: "R", tiles: ["airtime", "battery", "types", "noise"] }]), null, {});
    expect(atlas.pins[0]).not.toHaveProperty("tiles");
  });

  it("keeps the previous local id for a node the server no longer knows", () => {
    const { atlas } = fromServer(doc([{ kind: "node", publicKey: key(1), id: null, name: "Gone", observerId: null }]), local([node(1)]), {});
    expect((atlas.pins[0] as NodePin).id).toBe(uuid(1));
  });

  it("uses an id no node has when there was no previous one", () => {
    const { atlas } = fromServer(doc([{ kind: "node", publicKey: key(1), id: null, name: "Gone", observerId: null }]), null, {});
    expect(atlas.pins).toEqual([{ kind: "node", id: NO_NODE_ID, publicKey: key(1), name: "Gone" }]);
  });

  it("keeps the previous local observer id, or a placeholder derived from the key", () => {
    const pins: ServerAtlas["pins"] = [
      { kind: "observer", observerPublicKey: key(2), observerId: null, name: "A" },
      { kind: "observer", observerPublicKey: key(3), observerId: null, name: "B" },
    ];
    const { atlas, keys } = fromServer(doc(pins), local([obs(2)]), { [uuid(102)]: key(2) });
    expect(atlas.pins.map((p) => (p.kind === "observer" ? p.observerId : ""))).toEqual([uuid(102), placeholderObserverId(key(3))]);
    expect(keys[placeholderObserverId(key(3))]).toBe(key(3));
  });

  it("caps at the limit and drops duplicates", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ kind: "node" as const, publicKey: key(i + 1), id: uuid(i + 1), name: "x", observerId: null }));
    expect(fromServer(doc(many), null, {}).atlas.pins).toHaveLength(ATLAS_LIMIT);
  });
});

describe("toPut", () => {
  it("sends node pins by key and observers by id, with the base revision", () => {
    const body = toPut(local([node(1, { view: "heard", observerId: uuid(101), tiles: ["uptime", "battery", "types", "noise"] }), obs(2)], "3d"), {}, 9);
    expect(body).toEqual({
      baseRevision: 9,
      range: "3d",
      pins: [
        { kind: "node", publicKey: key(1), name: "N1", tiles: ["uptime", "battery", "types", "noise"], view: "heard" },
        { kind: "observer", observerId: uuid(102), name: "O2" },
      ],
    });
  });

  it("sends an observer the server does not know by id by its key", () => {
    const id = placeholderObserverId(key(3));
    const body = toPut(local([{ kind: "observer", observerId: id, name: "B" }]), { [id]: key(3) }, 1);
    expect(body.pins).toEqual([{ kind: "observer", observerPublicKey: key(3), name: "B" }]);
  });
});

describe("mergeAtlas", () => {
  it("uploads the local Atlas when the server is empty", () => {
    const r = mergeAtlas(local([]), local([node(1), obs(2)], "3d"), {});
    expect(r).toEqual({ atlas: local([node(1), obs(2)], "3d"), dropped: 0, upload: true });
  });

  it("uses the server Atlas when only it has pins", () => {
    const server = local([node(1)], "3d");
    expect(mergeAtlas(server, local([]), {})).toEqual({ atlas: server, dropped: 0, upload: false });
  });

  it("is empty when both are", () => {
    expect(mergeAtlas(local([]), local([]), {})).toEqual({ atlas: local([]), dropped: 0, upload: false });
  });

  it("puts server pins first, then local pins it does not hold, and keeps the server range", () => {
    const r = mergeAtlas(local([node(1), node(2)], "3d"), local([node(3), node(1), obs(4)]), {});
    expect(r.atlas.pins.map((p) => (p.kind === "node" ? p.publicKey : p.observerId))).toEqual([key(1), key(2), key(3), uuid(104)]);
    expect(r.atlas.range).toBe("3d");
    expect(r).toMatchObject({ dropped: 0, upload: true });
  });

  it("does not upload when the server already holds everything local", () => {
    const r = mergeAtlas(local([node(1), node(2)]), local([node(2)]), {});
    expect(r).toMatchObject({ dropped: 0, upload: false });
    expect(r.atlas.pins).toHaveLength(2);
  });

  it("counts the local pins that did not fit", () => {
    const server = local(Array.from({ length: 10 }, (_, i) => node(i + 1)));
    const r = mergeAtlas(server, local([node(20), node(21), node(22), node(5)]), {});
    expect(r.atlas.pins).toHaveLength(ATLAS_LIMIT);
    expect(r).toMatchObject({ dropped: 1, upload: true });
  });

  it("counts nothing dropped and no upload when the server list is full", () => {
    const server = local(Array.from({ length: 12 }, (_, i) => node(i + 1)));
    expect(mergeAtlas(server, local([node(20)]), {})).toMatchObject({ dropped: 1, upload: false });
  });

  it("treats a local observer as held when the server has that radio as a node", () => {
    const server = local([node(1, { observerId: uuid(101) })]);
    expect(mergeAtlas(server, local([obs(1)]), {}).atlas.pins).toHaveLength(1);
  });

  it("treats a local observer as held when the server has the same radio under a known key", () => {
    const placeholder = placeholderObserverId(key(2));
    const server = local([{ kind: "observer", observerId: placeholder, name: "A" }]);
    const keys = { [placeholder]: key(2), [uuid(102)]: key(2) };
    expect(mergeAtlas(server, local([obs(2)]), keys).atlas.pins).toHaveLength(1);
  });

  it("treats a local node as held when the server has its radio as an observer pin", () => {
    const server = local([obs(1)]);
    expect(mergeAtlas(server, local([node(1)]), { [uuid(101)]: key(1) }).atlas.pins).toHaveLength(1);
  });
});
