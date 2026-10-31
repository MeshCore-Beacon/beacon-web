import { describe, expect, it } from "vitest";
import { expression } from "@maplibre/maplibre-gl-style-spec";
import type { ExpressionSpecification } from "maplibre-gl";
import { nodesToFeatureCollection } from "../../../src/features/map/node-geojson";
import { buildRepeaterScopeStyle, scopeColor, scopePointImage, scopeClusterImage, visibleScopeRows, MAX_COLORED_SCOPES, SCOPE_CLUSTER_ICON, scopeImageId } from "../../../src/features/map/repeater-scopes";
import { patchNodeSummary } from "../../../src/features/nodes/node-updates";
import type { NodeSummary } from "../../../src/features/nodes/types";
import type { WsNodeUpdate } from "../../../src/types/ws";

const node = (id: string, scope?: string, lng = -80, type = "repeater"): NodeSummary => ({
  id, publicKey: id, name: id, nodeType: type === "repeater" ? 2 : 1,
  nodeTypeName: type, lat: 43, lng, iatas: [], knownNeighborCount: 0,
  ...(scope === undefined ? {} : { defaultScope: scope }),
});

function evaluate(value: ExpressionSpecification, properties: Record<string, unknown>) {
  const result = expression.createExpression(value, "layers[0].layout.icon-image");
  if (result.result !== "success") throw new Error(JSON.stringify(result.value));
  return result.value.evaluate({ zoom: 5 }, { type: "Point", properties });
}

function cluster(nodes: NodeSummary[], style = buildRepeaterScopeStyle(nodesToFeatureCollection(nodes), true)) {
  const props: Record<string, number> = {};
  for (const [key, [, mapped]] of Object.entries(style.clusterProperties)) {
    props[key] = nodes.reduce((n, item) => n + Number(evaluate(mapped, { ...item })), 0);
  }
  return { style, props };
}

describe("MQTT-derived repeater scope colours", () => {
  it("preserves exact scope names and role metadata without inferring missing scopes", () => {
    const fc = nodesToFeatureCollection([node("a", "#on"), node("b", "#ON"), node("c")]);
    const style = buildRepeaterScopeStyle(fc, true);
    expect(style.entries.map(e => e.name)).toEqual(["#ON", "#on"]);
    expect(scopeColor("#ON", true)).not.toBe(scopeColor("#on", true));
    expect(fc.features[2]!.properties).not.toHaveProperty("defaultScope");
    expect(evaluate(style.pointColor, fc.features[2]!.properties)).toBe(style.neutral);
    expect(scopeColor("#on", true)).toBe(buildRepeaterScopeStyle(nodesToFeatureCollection([node("new", "#new"), node("a", "#on")]), true).entries.find(e => e.name === "#on")!.color);
  });

  it("colours only repeaters, preserving observer glyphs and other node types", () => {
    const fc = nodesToFeatureCollection([{ ...node("a", "#on"), isObserver: true }, node("b", "#on", 0, "companion")]);
    const style = buildRepeaterScopeStyle(fc, true);
    expect(evaluate(scopePointImage(style, ["literal", "node-repeater-observer"]), fc.features[0]!.properties)).toBe(scopeImageId(scopeColor("#on", true), "node-repeater-observer"));
    expect(evaluate(scopePointImage(style, ["literal", "node-companion"]), fc.features[1]!.properties)).toBe("node-companion");
    expect(scopePointImage(null, ["literal", "normal"])).toEqual(["literal", "normal"]);
  });

  it("uses a unique dominant scope and leaves ties or mostly unknown clusters neutral", () => {
    const all = [node("a", "#on"), node("b", "#on"), node("c", "#qc")];
    const { style, props } = cluster(all);
    expect(evaluate(style.clusterColor, props)).toBe(scopeColor("#on", true));
    expect(evaluate(scopeClusterImage(style, ["literal", "normal"]), props)).toBe(scopeImageId(scopeColor("#on", true), SCOPE_CLUSTER_ICON));
    const tied = cluster([all[0]!, all[2]!], style);
    expect(evaluate(style.clusterColor, tied.props)).toBe(style.neutral);
    const unknown = cluster([all[0]!, node("u1"), node("u2")], style);
    expect(evaluate(style.clusterColor, unknown.props)).toBe(style.neutral);
    const companions = cluster([node("device", "#on", 0, "companion")], style);
    expect(evaluate(scopeClusterImage(style, ["literal", "normal"]), companions.props)).toBe("normal");
  });

  it("handles an empty catalogue and bounds cluster properties and image variants", () => {
    const unknown = cluster([node("u")]);
    expect(evaluate(unknown.style.clusterColor, unknown.props)).toBe(unknown.style.neutral);
    const many = buildRepeaterScopeStyle(nodesToFeatureCollection(Array.from({ length: 100 }, (_, i) => node(String(i), `#scope${i}`))), true);
    expect(many.entries).toHaveLength(MAX_COLORED_SCOPES);
    expect(Object.keys(many.clusterProperties)).toHaveLength(MAX_COLORED_SCOPES + 2);
    expect(many.imageIds.length).toBeLessThanOrEqual((MAX_COLORED_SCOPES + 1) * 3);
    expect(many.overflow).toBe(true);
  });

  it("counts located repeaters in the viewport once across the antimeridian", () => {
    const fc = nodesToFeatureCollection([node("east", "#on", 175), node("west", "#on", -175), node("out", "#qc", 0), node("unknown", undefined, 178), node("device", "#qc", 179, "companion")]);
    const style = buildRepeaterScopeStyle(fc, true);
    const bounds = { getWest: () => 170, getEast: () => -170, getSouth: () => 40, getNorth: () => 50 };
    const rows = visibleScopeRows(fc, style, bounds);
    expect(rows.map(r => [r.name, r.kind, r.count])).toEqual([["#on", "named", 2], [null, "unknown", 1]]);
    expect(visibleScopeRows(fc, style, { ...bounds, getWest: () => -220, getEast: () => 220 }).reduce((sum, r) => sum + r.count, 0)).toBe(4);
  });

  it("updates an existing node from MQTT scope changes without repainting identical adverts", () => {
    const old = [node("a", "#on")];
    const update = { nodeId: "a", name: "a", defaultScope: "#ykf" } as WsNodeUpdate["data"];
    const next = patchNodeSummary(old, update)!;
    expect(next[0]!.defaultScope).toBe("#ykf");
    expect(nodesToFeatureCollection(next).features[0]!.properties.defaultScope).toBe("#ykf");
    expect(patchNodeSummary(next, update)).toBe(next);
    expect(patchNodeSummary(next, { nodeId: "a", name: "a" } as WsNodeUpdate["data"])).toBe(next);
  });
});
