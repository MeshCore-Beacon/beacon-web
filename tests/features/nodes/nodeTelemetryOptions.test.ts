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
    { t: 0, readings: 2, batteryMv: 4200, temperatureC: 16.5, noiseFloorDb: -97, airtimeTxSecs: 36, airtimeRxSecs: 72, counterSpanSecs: 3600 },
    { t: 2 * H, readings: 1, batteryMv: 4100, temperatureC: 17, noiseFloorDb: -96, airtimeTxSecs: 0, airtimeRxSecs: 3.6, counterSpanSecs: 3600 },
  ]);

  it("builds all four charts when every field is present", () => {
    const c = buildNodeCharts(full, colors, labels, "c");
    expect(Object.keys(c).filter((k) => (c as any)[k]).sort()).toEqual(["airtime", "battery", "noise", "temperature"]);
  });

  it("skips a chart whose field is in no point", () => {
    const c = buildNodeCharts(tele([{ t: 0, readings: 1, batteryMv: 4200, temperatureC: 16 }]), colors, labels, "c");
    expect(c.battery).toBeDefined();
    expect(c.temperature).toBeDefined();
    expect(c.noise).toBeUndefined();
    expect(c.airtime).toBeUndefined();
  });

  it("draws temperature in the instance unit", () => {
    const temp = (u: "c" | "f") => (buildNodeCharts(full, colors, labels, u).temperature as any).series[0].data;
    expect(temp("c")).toEqual([[0, 16.5], [H, null], [2 * H, 17]]);
    expect(temp("f")[0][1]).toBeCloseTo(61.7);
    expect(temp("f")[2][1]).toBeCloseTo(62.6);
  });

  it("converts mV to V and breaks the line at an empty bucket", () => {
    const s = (buildNodeCharts(full, colors, labels, "c").battery as any).series[0];
    expect(s.connectNulls).toBe(false);
    expect(s.data).toEqual([[0, 4.2], [H, null], [2 * H, 4.1]]);
  });

  const air = (points: NodeTelemetry["points"], name: "TX" | "RX" = "TX", interval = "1h") =>
    (buildNodeCharts(tele(points, interval), colors, labels, "c").airtime as any).series.find((x: any) => x.name === name);

  it("charts airtime as percent of the counter span, with a gap", () => {
    const tx = air(full.points, "TX");
    const rx = air(full.points, "RX");
    expect(tx.data).toEqual([[0, 1], [H, null], [2 * H, 0]]);
    expect(rx.data).toEqual([[0, 2], [H, null], [2 * H, 0.1]]);
    expect(tx.connectNulls).toBe(false);
  });

  it("divides by the span, not the bucket", () => {
    // six hours of span in a one-hour bucket: 1944 s is 9%
    expect(air([{ t: 0, readings: 1, airtimeTxSecs: 1944, airtimeRxSecs: 0, counterSpanSecs: 21600 }]).data).toEqual([[0, 9]]);
    expect(air([{ t: 0, readings: 1, airtimeTxSecs: 1944, airtimeRxSecs: 0, counterSpanSecs: 21600 }], "TX", "6h").data).toEqual([[0, 9]]);
  });

  it("gives a point without a span, or with a zero span, no value", () => {
    const pts = [
      { t: 0, readings: 1, airtimeTxSecs: 5, airtimeRxSecs: 5 },
      { t: H, readings: 1, airtimeTxSecs: 5, airtimeRxSecs: 5, counterSpanSecs: 0 },
      { t: 2 * H, readings: 1, airtimeTxSecs: 36, airtimeRxSecs: 36, counterSpanSecs: 3600 },
    ];
    expect(air(pts).data).toEqual([[0, null], [H, null], [2 * H, 1]]);
  });

  it("gives a point that computes above 100 no value", () => {
    const pts = [
      { t: 0, readings: 1, airtimeTxSecs: 3601, airtimeRxSecs: 0, counterSpanSecs: 3600 },
      { t: H, readings: 1, airtimeTxSecs: 3600, airtimeRxSecs: 0, counterSpanSecs: 3600 },
    ];
    expect(air(pts).data).toEqual([[0, null], [H, 100]]);
  });

  it("checks the unrounded value against 100", () => {
    // 100.000463 percent rounds to 100 but is over the ceiling
    expect(air([{ t: 0, readings: 1, airtimeTxSecs: 216001, airtimeRxSecs: 0, counterSpanSecs: 216000 }]).data).toEqual([[0, null]]);
  });

  it("draws small markers on every series so an isolated value between gaps shows", () => {
    const c = buildNodeCharts(tele([
      { t: 0, readings: 1, batteryMv: 4200, temperatureC: 16, noiseFloorDb: -97, airtimeTxSecs: 1, airtimeRxSecs: 1, counterSpanSecs: 3600 },
      { t: 3 * H, readings: 1, batteryMv: 4100, temperatureC: 17, noiseFloorDb: -96, airtimeTxSecs: 1, airtimeRxSecs: 1, counterSpanSecs: 3600 },
    ]), colors, labels, "c");
    for (const key of ["battery", "temperature", "noise", "airtime"] as const) {
      for (const s of (c[key] as any).series) {
        expect(s.data[1][1]).toBeNull();
        expect(s.connectNulls).toBe(false);
        expect(s.symbol).not.toBe("none");
        expect(s.symbolSize).toBeGreaterThanOrEqual(3);
        expect(s.symbolSize).toBeLessThanOrEqual(4);
      }
    }
  });

  it("draws point markers so an isolated value shows", () => {
    expect(air(full.points).symbol).not.toBe("none");
    expect(air(full.points, "RX").symbol).not.toBe("none");
  });
});
