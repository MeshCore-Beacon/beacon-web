import { describe, it, expect } from "vitest";
import { LiveChatter, CHAT_MS } from "../../../src/features/topology/chatter";
import { buildTopology } from "../../../src/features/topology/topology";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsPacketObservation } from "../../../src/types/ws";

const nodes = ["a", "b"].map(id => ({ id, publicKey:id.repeat(64), observerId:`obs-${id}`, isObserver:true, nodeTypeName:"repeater", nodeType:2, iatas:[{iata:"YKF",lastHeard:1}], knownNeighborCount:0, name:id, lat:null,lng:null } satisfies NodeSummary));
const graph = buildTopology(nodes);
const message = {id:1,packetHash:"hash",isPublic:true,channelHash:"11",senderName:"Alice",content:"hello",sentAt:1};
const event = (id: string, heardAt: number) => ({packetHash:"hash",packet:{payloadType:5,routeType:1},observation:{observerId:`obs-${id}`,heardAt}} as WsPacketObservation["data"]);

describe("Public topology chatter", () => {
  it("joins either arrival order, anchors to the earliest mapped reception, deduplicates and expires", () => {
    const chatter = new LiveChatter();
    chatter.observe(event("b",200),graph,1_000);
    chatter.message(message,1_100);
    chatter.observe(event("a",100),graph,1_200);
    expect(chatter.visible(1_300)).toEqual([]);
    expect(chatter.visible(1_700)).toMatchObject([{sender:"Alice",content:"hello",nodeId:"a"}]);
    chatter.message(message,1_800);
    expect(chatter.visible(1_900)).toHaveLength(1);
    expect(chatter.visible(1_000+CHAT_MS)).toEqual([]);
  });
  it("does not trust colliding channel hashes, unknown keys, sender identities or ambiguous relays", () => {
    const chatter = new LiveChatter();
    chatter.message({...message,isPublic:false},100);
    chatter.observe(event("a",1),graph,100);
    expect(chatter.visible(800)).toEqual([]);
    chatter.clear();chatter.message(message,100);
    const unknown=event("missing",1);unknown.observation.resolvedPath=[{confidence:"ambiguous",nodes:[{id:"a",publicKey:"a"}]}];
    chatter.observe(unknown,graph,100);
    expect(chatter.visible(800)).toEqual([]);
    unknown.observation.resolvedPath[0]!.confidence="high";
    chatter.observe(unknown,graph,100);
    expect(chatter.visible(800)[0]?.nodeId).toBe("a");
  });
});
