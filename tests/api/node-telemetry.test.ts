import { afterEach, expect, it, vi } from "vitest";
import { getCollectedNodeTelemetry, getTelemetryAvailability } from "../../src/api/client";

const key = "ab".repeat(32);
const sample = {nodeKey: key, collectorKey: "cd".repeat(32), radioKey: "ef".repeat(32), receivedAt: 1792500000000, values: {batteryMv: 4100}, sensors: [{channel: 2, kind: "temperature", value: 0, unit: "C"}]};
function reply(value: unknown) { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok: true, json: async () => value})); }
afterEach(() => vi.unstubAllGlobals());

it("reads retained history without changing explicit sensor zeros", async () => {
  reply({items: [sample], limit: 500});
  expect((await getCollectedNodeTelemetry(key)).items[0]?.sensors?.[0]?.value).toBe(0);
});
it("rejects malformed history instead of crashing cards or inventing values", async () => {
  for (const value of [null, {items: "not-an-array"}, {items: [null]}, {items: [{...sample, receivedAt: null}]}, {items: [{...sample, values: {batteryMv: null}}]}, {items: [{...sample, sensors: [null]}]}]) {
    reply(value);
    await expect(getCollectedNodeTelemetry(key)).rejects.toThrow();
  }
});
it("keeps read cancellation and the complete availability contract", async () => {
  reply({items: [{nodeKey: key, lastReceivedAt: sample.receivedAt}], retentionDays: 30, truncated: false});
  const controller = new AbortController();
  expect((await getTelemetryAvailability(controller.signal)).nodes.has(key)).toBe(true);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/node-telemetry/availability"), {signal: controller.signal});
});
it("an unavailable index stays an error while unsupported optional history is empty", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"not found"}', {status:404, headers:{"Content-Type":"application/json"}})));
  await expect(getTelemetryAvailability()).rejects.toThrow();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"not found"}', {status:404, headers:{"Content-Type":"application/json"}})));
  expect((await getCollectedNodeTelemetry(key)).items).toEqual([]);
});
