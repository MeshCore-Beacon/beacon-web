import { describe, it, expect } from "vitest";
import { intervalToMs, airtimePctSeries, latestAirtimePct, fillActivity, busyPct, payloadBarItems } from "../../../src/features/stats/transforms";
import type { ActivityPoint, TelemetryPoint } from "../../../src/features/stats/types";

const H = 3_600_000;

const point = (t: number, p: Partial<TelemetryPoint>): TelemetryPoint => ({
  t,
  batteryMv: null,
  airtimeTxPct: null,
  airtimeRxPct: null,
  noiseFloorDb: null,
  uptimeSeconds: null,
  queueLength: null,
  receiveErrors: null,
  ...p,
});

const activity = (t: number, p: Partial<ActivityPoint> = {}): ActivityPoint => ({
  t,
  observations: 0,
  airtimeMs: 0,
  snrAvg: null,
  snrMin: null,
  rssiAvg: null,
  ...p,
});

describe("intervalToMs", () => {
  it("parses the minute and hour intervals the server accepts", () => {
    expect(intervalToMs("5m")).toBe(300_000);
    expect(intervalToMs("15m")).toBe(900_000);
    expect(intervalToMs("1h")).toBe(H);
    expect(intervalToMs("6h")).toBe(6 * H);
    expect(intervalToMs("24h")).toBe(24 * H);
  });

  it("is null for anything else", () => {
    expect(intervalToMs("")).toBeNull();
    expect(intervalToMs("1d")).toBeNull();
    expect(intervalToMs("h")).toBeNull();
  });
});

describe("airtimePctSeries", () => {
  // raw points carry cumulative on-air seconds; the series is the increase as a percent of the
  // wall-clock gap between the two reports
  const raw = [
    point(0, { airtimeRxPct: 10, airtimeTxPct: 4 }),
    point(H, { airtimeRxPct: 46, airtimeTxPct: 4 }), // +36 s over 1 h
    point(3 * H, { airtimeRxPct: 40, airtimeTxPct: 76 }), // rx reset, tx +72 s over 2 h
  ];

  it("divides each cumulative delta by the real gap to the previous report", () => {
    expect(airtimePctSeries(raw, "airtimeRxPct", null)).toEqual([[H, 1], [3 * H, 0]]);
    expect(airtimePctSeries(raw, "airtimeTxPct", null)).toEqual([[H, 0], [3 * H, 1]]);
  });

  it("leaves a gap when either side of a delta is missing", () => {
    const withHole = [point(0, { airtimeRxPct: 10 }), point(H, { airtimeRxPct: null }), point(2 * H, { airtimeRxPct: 82 })];
    expect(airtimePctSeries(withHole, "airtimeRxPct", null)).toEqual([[H, null], [2 * H, null]]);
  });

  it("divides bucketed deltas by the bucket width", () => {
    const bucketed = [point(0, { airtimeRxPct: 216 }), point(6 * H, { airtimeRxPct: 1080 })];
    expect(airtimePctSeries(bucketed, "airtimeRxPct", 6 * H)).toEqual([[0, 1], [6 * H, 5]]);
  });

  it("rounds to three decimals so tooltips stay readable", () => {
    const pts = [point(0, { airtimeRxPct: 0 }), point(H, { airtimeRxPct: 1 })]; // 1 s / 3600 s
    expect(airtimePctSeries(pts, "airtimeRxPct", null)).toEqual([[H, 0.028]]);
  });
});

describe("latestAirtimePct", () => {
  it("reports the last delta for raw points", () => {
    const raw = [point(0, { airtimeRxPct: 10, airtimeTxPct: 4 }), point(H, { airtimeRxPct: 46, airtimeTxPct: 76 })];
    expect(latestAirtimePct(raw, null)).toEqual({ rx: 1, tx: 2 });
  });

  it("reports the last bucket for bucketed points", () => {
    const bucketed = [point(0, { airtimeRxPct: 1, airtimeTxPct: 1 }), point(6 * H, { airtimeRxPct: 216, airtimeTxPct: 0 })];
    expect(latestAirtimePct(bucketed, 6 * H)).toEqual({ rx: 1, tx: 0 });
  });

  it("is null when there is nothing to difference", () => {
    expect(latestAirtimePct([], null)).toEqual({ rx: null, tx: null });
    expect(latestAirtimePct([point(0, { airtimeRxPct: 10 })], null)).toEqual({ rx: null, tx: null });
  });
});

describe("fillActivity", () => {
  const I = 900_000;

  it("emits every bucket in the window, zero where the server sent nothing", () => {
    const heard = activity(I, { observations: 3, airtimeMs: 1200, snrAvg: 5.5, snrMin: -2, rssiAvg: -90 });
    const out = fillActivity([heard], I, { start: 0, end: 4 * I });
    expect(out.map((p) => p.t)).toEqual([0, I, 2 * I, 3 * I, 4 * I]);
    expect(out[1]).toEqual(heard);
    expect(out[0]).toEqual(activity(0));
    expect(out[4]).toEqual(activity(4 * I));
  });

  it("starts at the first complete bucket and ends at the one in progress", () => {
    // the server rounds the window start up to the next bucket, so a floored first bucket would be a fake zero
    const out = fillActivity([], I, { start: I + 1, end: 3 * I - 1 });
    expect(out.map((p) => p.t)).toEqual([2 * I]);
  });

  it("keeps a server bucket newer than the window end rather than dropping it", () => {
    // a client clock behind the server must not hide the newest real bucket
    const out = fillActivity([activity(3 * I, { observations: 2 })], I, { start: 0, end: 2 * I + 1 });
    expect(out.map((p) => p.t)).toEqual([0, I, 2 * I, 3 * I]);
    expect(out[3]!.observations).toBe(2);
  });

  it("drops server points outside the window", () => {
    const out = fillActivity([activity(9 * I, { observations: 1 })], I, { start: 0, end: 2 * I });
    expect(out.every((p) => p.observations === 0)).toBe(true);
  });
});

describe("busyPct", () => {
  it("is the share of the bucket spent on air, to three decimals", () => {
    expect(busyPct(9_000, 900_000)).toBe(1);
    expect(busyPct(1_234, 900_000)).toBe(0.137);
  });

  it("is null when the bucket could not be costed", () => {
    expect(busyPct(null, 900_000)).toBeNull();
  });
});

describe("payloadBarItems", () => {
  it("lowercases the type names and orders by count for the bar chart", () => {
    const items = payloadBarItems([
      { payloadType: 5, payloadTypeName: "GRP_TXT", count: 3 },
      { payloadType: 4, payloadTypeName: "ADVERT", count: 9 },
    ]);
    expect(items).toEqual([{ name: "advert", value: 9 }, { name: "grp_txt", value: 3 }]);
  });
});
