import { describe, expect, it } from "vitest";
import { NO_NODE_ID, type NodePin, type SavedAtlas } from "../../../src/features/atlas/atlas";
import { fromServer, mergeAtlas, placeholderObserverId, toPut, type ServerAtlas } from "../../../src/features/atlas/atlasSync";

const key = (n: number) => n.toString(16).padStart(2, "0").repeat(32);
const uuid = (n: number) => `${n.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
const node = (n: number, extra: Partial<NodePin> = {}): NodePin => ({ kind: "node", id: uuid(n), publicKey: key(n), name: `N${n}`, ...extra });
const obs = (n: number) => ({ kind: "observer" as const, observerId: uuid(100 + n), name: `O${n}` });
const local = (pins: SavedAtlas["pins"], range: SavedAtlas["range"] = "24h"): SavedAtlas => ({ version: 2, range, pins });
const doc = (pins: ServerAtlas["pins"], revision = 3, range: ServerAtlas["range"] = "24h"): ServerAtlas => ({ revision, range, limit: 12, pins });

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

  it("keeps every pin the server sends and drops duplicates", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ kind: "node" as const, publicKey: key(i + 1), id: uuid(i + 1), name: "x", observerId: null }));
    expect(fromServer(doc([...many, many[0]!]), null, {}).atlas.pins).toHaveLength(14);
  });
});

describe("fromServer and a local 7d", () => {
  const pins: ServerAtlas["pins"] = [{ kind: "node", publicKey: key(1), id: uuid(1), name: "N1", observerId: null }];
  it("keeps the local 7d when the server without 7d answers the 3d it was sent", () => {
    expect(fromServer(doc(pins, 3, "3d"), local([node(1)], "7d"), {}, false, true).atlas.range).toBe("7d");
  });
  it("takes the server's range in every other case", () => {
    expect(fromServer(doc(pins, 3, "3d"), local([node(1)], "7d"), {}).atlas.range).toBe("3d");
    expect(fromServer(doc(pins, 3, "24h"), local([node(1)], "7d"), {}, false, true).atlas.range).toBe("24h");
    expect(fromServer(doc(pins, 3, "3d"), local([node(1)], "24h"), {}, false, true).atlas.range).toBe("3d");
    expect(fromServer(doc(pins, 3, "7d"), null, {}).atlas.range).toBe("7d");
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

  it("sends 7d only to a server that has it, and 3d otherwise", () => {
    expect(toPut(local([node(1)], "7d"), {}, 1, false, true).range).toBe("7d");
    expect(toPut(local([node(1)], "7d"), {}, 1, false, false).range).toBe("3d");
    expect(toPut(local([node(1)], "7d"), {}, 1).range).toBe("3d");
  });

  it("sends an observer the server does not know by id by its key", () => {
    const id = placeholderObserverId(key(3));
    const body = toPut(local([{ kind: "observer", observerId: id, name: "B" }]), { [id]: key(3) }, 1);
    expect(body.pins).toEqual([{ kind: "observer", observerPublicKey: key(3), name: "B" }]);
  });
});

describe("mergeAtlas", () => {
  it("uploads the local Atlas when the server is empty", () => {
    const r = mergeAtlas(local([]), local([node(1), obs(2)], "3d"), {}, 12);
    expect(r).toEqual({ atlas: local([node(1), obs(2)], "3d"), dropped: 0, upload: true });
  });

  it("uses the server Atlas when only it has pins", () => {
    const server = local([node(1)], "3d");
    expect(mergeAtlas(server, local([]), {}, 12)).toEqual({ atlas: server, dropped: 0, upload: false });
  });

  it("is empty when both are", () => {
    expect(mergeAtlas(local([]), local([]), {}, 12)).toEqual({ atlas: local([]), dropped: 0, upload: false });
  });

  it("puts server pins first, then local pins it does not hold, and keeps the server range", () => {
    const r = mergeAtlas(local([node(1), node(2)], "3d"), local([node(3), node(1), obs(4)]), {}, 12);
    expect(r.atlas.pins.map((p) => (p.kind === "node" ? p.publicKey : p.observerId))).toEqual([key(1), key(2), key(3), uuid(104)]);
    expect(r.atlas.range).toBe("3d");
    expect(r).toMatchObject({ dropped: 0, upload: true });
  });

  it("does not upload when the server already holds everything local", () => {
    const r = mergeAtlas(local([node(1), node(2)]), local([node(2)]), {}, 12);
    expect(r).toMatchObject({ dropped: 0, upload: false });
    expect(r.atlas.pins).toHaveLength(2);
  });

  it("counts the local pins that did not fit", () => {
    const server = local(Array.from({ length: 10 }, (_, i) => node(i + 1)));
    const r = mergeAtlas(server, local([node(20), node(21), node(22), node(5)]), {}, 12);
    expect(r.atlas.pins).toHaveLength(12);
    expect(r).toMatchObject({ dropped: 1, upload: true });
    expect(mergeAtlas(server, local([node(20), node(21), node(22)]), {}, 20)).toMatchObject({ dropped: 0 });
  });

  it("counts nothing dropped and no upload when the server list is full", () => {
    const server = local(Array.from({ length: 12 }, (_, i) => node(i + 1)));
    expect(mergeAtlas(server, local([node(20)]), {}, 12)).toMatchObject({ dropped: 1, upload: false });
  });

  it("treats a local observer as held when the server has that radio as a node", () => {
    const server = local([node(1, { observerId: uuid(101) })]);
    expect(mergeAtlas(server, local([obs(1)]), {}, 12).atlas.pins).toHaveLength(1);
  });

  it("treats a local observer as held when the server has the same radio under a known key", () => {
    const placeholder = placeholderObserverId(key(2));
    const server = local([{ kind: "observer", observerId: placeholder, name: "A" }]);
    const keys = { [placeholder]: key(2), [uuid(102)]: key(2) };
    expect(mergeAtlas(server, local([obs(2)]), keys, 12).atlas.pins).toHaveLength(1);
  });

  it("treats a local node as held when the server has its radio as an observer pin", () => {
    const server = local([obs(1)]);
    expect(mergeAtlas(server, local([node(1)]), { [uuid(101)]: key(1) }).atlas.pins).toHaveLength(1);
  });
});

describe("poller view", () => {
  const pinned = local([node(1, { view: "poller" })]);
  const answer = doc([{ kind: "node", publicKey: key(1), id: uuid(1), name: "N1", observerId: null }]);

  it("is sent only to a server with atlasPoller", () => {
    expect(toPut(pinned, {}, 2, false, false, true).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1", view: "poller" }]);
    expect(toPut(pinned, {}, 2, true, true, false).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1" }]);
    expect(toPut(pinned, {}, 2).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1" }]);
  });

  it("stays in this browser's copy when an older server answers without it", () => {
    expect(fromServer(answer, pinned, {}, false, false, true).atlas.pins[0]).toMatchObject({ view: "poller" });
    expect(fromServer(answer, pinned, {}, true, false, false).atlas.pins[0]).not.toHaveProperty("view");
    const heard = { ...answer, pins: [{ ...answer.pins[0]!, view: "heard" as const }] };
    expect(fromServer(heard, pinned, {}, false, false, true).atlas.pins[0]).toMatchObject({ view: "heard" });
  });

  it("is read from a server that stores it", () => {
    const stored = { ...answer, pins: [{ ...answer.pins[0]!, view: "poller" as const }] };
    expect(fromServer(stored, null, {}).atlas.pins[0]).toMatchObject({ view: "poller" });
  });

  it("does not bring a kept Telemetry view along", () => {
    expect(fromServer(answer, local([node(1, { view: "telemetry" })]), {}, false, false, true).atlas.pins[0]).not.toHaveProperty("view");
  });
});

describe("telemetry fields", () => {
  const tiles = ["packets", "signal", "errors", "battery"] as const;
  const withBoth = local([node(1, { view: "telemetry", telemetryTiles: [...tiles] })]);

  it("sends the view and tiles when the server supports them", () => {
    expect(toPut(withBoth, {}, 2, true).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1", telemetryTiles: [...tiles], view: "telemetry" }]);
  });

  it("strips both against an older server, and keeps the other views", () => {
    expect(toPut(withBoth, {}, 2).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1" }]);
    expect(toPut(local([node(1, { view: "heard", telemetryTiles: [...tiles] })]), {}, 2).pins).toEqual([{ kind: "node", publicKey: key(1), name: "N1", view: "heard" }]);
  });

  it("reads both from the server and validates them", () => {
    const { atlas } = fromServer(doc([
      { kind: "node", publicKey: key(1), id: uuid(1), name: "N1", observerId: null, view: "telemetry", telemetryTiles: [...tiles] },
      { kind: "node", publicKey: key(2), id: uuid(2), name: "N2", observerId: null, telemetryTiles: ["a", "b", "c", "d"] as never },
    ]), null, {});
    expect(atlas.pins[0]).toMatchObject({ view: "telemetry", telemetryTiles: [...tiles] });
    expect(atlas.pins[1]).not.toHaveProperty("telemetryTiles");
  });

  it("keeps this browser's two fields when an older server answers without them, and lets a newer one overrule", () => {
    const answer = doc([{ kind: "node", publicKey: key(1), id: uuid(1), name: "N1", observerId: null }]);
    expect(fromServer(answer, withBoth, {}, true).atlas.pins[0]).toMatchObject({ view: "telemetry", telemetryTiles: [...tiles] });
    expect(fromServer(answer, withBoth, {}, false).atlas.pins[0]).not.toHaveProperty("view");
    const heard = { ...answer, pins: [{ ...answer.pins[0]!, view: "heard" as const }] };
    expect(fromServer(heard, withBoth, {}, true).atlas.pins[0]).toMatchObject({ view: "heard" });
  });
});
