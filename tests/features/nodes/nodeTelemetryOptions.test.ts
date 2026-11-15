/* eslint-disable @typescript-eslint/no-explicit-any -- poking into loose ECharts option shapes */
import { describe, expect, it } from "vitest";
import { buildNodeCharts, fillGaps } from "../../../src/features/nodes/nodeTelemetryOptions";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { NodeTelemetry } from "../../../src/features/nodes/types";

const colors: ChartColors = {
  primary: "#3b82f6", primaryDim: "#1e40af", secondary: "#a78bfa", green: "#22c55e", warn: "#f59e0b", danger: "#ef4444",
  textBright: "#fff", textNormal: "#ccc", textMuted: "#999", textDim: "#666", bgBase: "#000", bgSurface: "#111",
  bgRaised: "#222", border: "#333", borderSubtle: "#2a2a2a", series: ["#s0", "#s1", "#s2"],
};
const labels = { battery: "Battery (V)", temperature: "Temperature (°C)", noise: "Noise floor (dBm)" };
const H = 3_600_000;
const tele = (points: NodeTelemetry["points"], interval = "1h"): NodeTelemetry => ({ range: "24h", interval, polled: true, untrustedReadings: 0, points });

describe("fillGaps", () => {
  it("inserts an empty point for each missing bucket", () => {
    const out = fillGaps([{ t: 0, readings: 1 }, { t: 3 * H, readings: 2 }], H);
    expect(out.map((p) => p.t)).toEqual([0, H, 2 * H, 3 * H]);
    expect(out[1]).toEqual({ t: H, readings: 0 });
  });

  it("leaves contiguous points alone and tolerates no interval", () => {
    const pts = [{ t: 0, readings: 1 }, { t: H, readings: 1 }];
    expect(fillGaps(pts, H)).toEqual(pts);
    expect(fillGaps([{ t: 0, readings: 1 }, { t: 5 * H, readings: 1 }], null)).toHaveLength(2);
  });
});

describe("buildNodeCharts", () => {
  const full = tele([
    { t: 0, readings: 2, batteryMv: 4200, temperatureC: 16.5, noiseFloorDb: -97, airtimeTxSecs: 36, airtimeRxSecs: 72 },
    { t: 2 * H, readings: 1, batteryMv: 4100, temperatureC: 17, noiseFloorDb: -96, airtimeTxSecs: 0, airtimeRxSecs: 3.6 },
  ]);

  it("builds all four charts when every field is present", () => {
    const c = buildNodeCharts(full, colors, labels);
    expect(Object.keys(c).filter((k) => (c as any)[k]).sort()).toEqual(["airtime", "battery", "noise", "temperature"]);
  });

  it("skips a chart whose field is in no point", () => {
    const c = buildNodeCharts(tele([{ t: 0, readings: 1, batteryMv: 4200, temperatureC: 16 }]), colors, labels);
    expect(c.battery).toBeDefined();
    expect(c.temperature).toBeDefined();
    expect(c.noise).toBeUndefined();
    expect(c.airtime).toBeUndefined();
  });

  it("converts mV to V and breaks the line at an empty bucket", () => {
    const s = (buildNodeCharts(full, colors, labels).battery as any).series[0];
    expect(s.connectNulls).toBe(false);
    expect(s.data).toEqual([[0, 4.2], [H, null], [2 * H, 4.1]]);
  });

  it("charts airtime seconds as percent of the bucket, with a gap", () => {
    const o = buildNodeCharts(full, colors, labels).airtime as any;
    const tx = o.series.find((x: any) => x.name === "TX");
    const rx = o.series.find((x: any) => x.name === "RX");
    expect(tx.data).toEqual([[0, 1], [H, null], [2 * H, 0]]);
    expect(rx.data).toEqual([[0, 2], [H, null], [2 * H, 0.1]]);
    expect(tx.connectNulls).toBe(false);
  });

  it("sizes airtime percent by the response interval", () => {
    const o = buildNodeCharts(tele([{ t: 0, readings: 1, airtimeTxSecs: 216, airtimeRxSecs: 0 }], "6h"), colors, labels).airtime as any;
    expect(o.series.find((x: any) => x.name === "TX").data).toEqual([[0, 1]]);
  });
});
