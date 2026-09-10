/* eslint-disable @typescript-eslint/no-explicit-any -- poking into loose ECharts option shapes */
import { describe, it, expect } from "vitest";
import { typeBarOption, leaderboardOption, donutOption, presetBarsOption, airtimeOption, receiveErrorsOption, busyOption, heardOption, snrHeardOption } from "../../../src/features/stats/chartOptions";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { ActivityPoint, TelemetryPoint } from "../../../src/features/stats/types";

const colors: ChartColors = {
  primary: "#3b82f6",
  primaryDim: "#1e40af",
  secondary: "#a78bfa",
  green: "#22c55e",
  warn: "#f59e0b",
  danger: "#ef4444",
  textBright: "#fff",
  textNormal: "#ccc",
  textMuted: "#999",
  textDim: "#666",
  bgBase: "#000",
  bgSurface: "#111",
  bgRaised: "#222",
  border: "#333",
  borderSubtle: "#2a2a2a",
  series: ["#s0", "#s1", "#s2"],
};

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `type_${i}`, value: (n - i) * 10 }));

describe("typeBarOption", () => {
  it("builds vertical bars: categories on x, one bar per item in order", () => {
    const opt = typeBarOption(items(3), colors) as Record<string, any>;
    expect(opt.xAxis.type).toBe("category");
    expect(opt.xAxis.data).toEqual(["type_0", "type_1", "type_2"]);
    expect(opt.series[0].type).toBe("bar");
    expect(opt.series[0].data.map((d: { value: number }) => d.value)).toEqual([30, 20, 10]);
  });

  it("keeps explicit item colors and cycles the palette for the rest", () => {
    const opt = typeBarOption(
      [{ name: "a", value: 1, color: "#abc" }, { name: "b", value: 2 }],
      colors,
    ) as Record<string, any>;
    expect(opt.series[0].data[0].itemStyle.color).toBe("#abc");
    expect(opt.series[0].data[1].itemStyle.color).toBe("#s1");
  });

  it("slants x labels only when categories are crowded", () => {
    const few = typeBarOption(items(4), colors) as Record<string, any>;
    const many = typeBarOption(items(10), colors) as Record<string, any>;
    expect(few.xAxis.axisLabel.rotate).toBe(0);
    expect(many.xAxis.axisLabel.rotate).toBeGreaterThan(0);
  });
});

describe("donutOption", () => {
  it("pins the total to the ring center via a label on the first slice, not a title block", () => {
    const opt = donutOption([{ name: "repeater", value: 3 }, { name: "sensor", value: 7 }], colors, "10", "NODES") as Record<string, any>;
    // title/graphic blocks never sat quite right — the pie's own center label always does
    expect(opt.title).toBeUndefined();
    expect(opt.graphic).toBeUndefined();
    const label = opt.series[0].data[0].label;
    expect(label.show).toBe(true);
    expect(label.position).toBe("center");
    expect(label.formatter).toContain("10");
    expect(label.formatter).toContain("NODES");
    // only the first slice carries it, or every slice would stamp its own copy
    expect(opt.series[0].data[1].label).toBeUndefined();
  });

  it("centers the pie with the legend below so the card fills evenly", () => {
    const opt = donutOption([{ name: "repeater", value: 3 }], colors, "3", "NODES") as Record<string, any>;
    expect(opt.series[0].center[0]).toBe("50%");
    expect(opt.legend.left).toBe("center");
    expect(opt.legend.bottom).toBeDefined();
  });
});

describe("presetBarsOption", () => {
  const rows = [
    { name: "910.525 · 62.5k · SF7", nodes: 112, observers: 46 },
    { name: "910.425 · 62.5k · SF7", nodes: 5, observers: 1 },
  ];

  it("stacks a node and an observer series per preset, in row order", () => {
    const opt = presetBarsOption(rows, colors) as Record<string, any>;
    expect(opt.yAxis.data).toEqual(["910.525 · 62.5k · SF7", "910.425 · 62.5k · SF7"]);
    expect(opt.series.map((s: { name: string }) => s.name)).toEqual(["Nodes", "Observers"]);
    expect(opt.series[0].stack).toBe(opt.series[1].stack);
    expect(opt.series[0].data).toEqual([112, 5]);
    expect(opt.series[1].data).toEqual([46, 1]);
  });

  it("labels each stack with its total at the bar end", () => {
    const opt = presetBarsOption(rows, colors) as Record<string, any>;
    const label = opt.series[1].label;
    expect(label.show).toBe(true);
    expect(label.formatter({ dataIndex: 0 })).toBe("158");
    expect(label.formatter({ dataIndex: 1 })).toBe("6");
  });
});

describe("leaderboardOption", () => {
  it("left-aligns names at the card edge and truncates long ones to the label gutter", () => {
    const rows = [{ name: "A very long observer name that overflows", value: 5, color: "#abc" }];
    const opt = leaderboardOption(rows, colors, 120) as Record<string, any>;
    expect(opt.yAxis.axisLabel.align).toBe("left");
    expect(opt.yAxis.axisLabel.overflow).toBe("truncate");
    expect(opt.yAxis.axisLabel.width).toBeLessThanOrEqual(120 - 10);
    expect(opt.yAxis.axisLabel.margin).toBe(110);
  });

  it("keeps a plain count label and the tight right gutter when rows carry no IATA", () => {
    const rows = [{ name: "node-a", value: 12, color: "#abc" }];
    const opt = leaderboardOption(rows, colors) as Record<string, any>;
    expect(opt.series[0].label.formatter({ value: 12, data: {} })).toBe("12");
    expect(opt.grid.right).toBe(56);
  });

  it("stamps an IATA chip beside the count when rows carry one, widening the right gutter", () => {
    const rows = [{ name: "node-a", value: 12, color: "#abc", iata: "YOW" }];
    const opt = leaderboardOption(rows, colors) as Record<string, any>;
    // the code rides on the data item so the label can read it back
    expect(opt.series[0].data[0].iata).toBe("YOW");
    const label = opt.series[0].label;
    const out = label.formatter({ value: 12, data: { iata: "YOW" } });
    expect(out).toContain("12");
    expect(out).toContain("YOW");
    expect(label.rich.iata).toBeDefined(); // chip style lives in the rich block
    expect(opt.grid.right).toBeGreaterThan(56); // room for the chip at the bar end
  });
});

const point = (t: number, p: Partial<TelemetryPoint>): TelemetryPoint => ({
  t,
  batteryMv: null,
  airtimeTxSecs: null,
  airtimeRxSecs: null,
  noiseFloorDb: null,
  uptimeSeconds: null,
  queueLength: null,
  receiveErrors: null,
  ...p,
});

const H = 3_600_000;

describe("airtimeOption", () => {
  const points = [
    point(0, { airtimeRxSecs: 10, airtimeTxSecs: 4 }),
    point(H, { airtimeRxSecs: 46, airtimeTxSecs: 4 }), // +36 s over 1 h → 1%
    point(3 * H, { airtimeRxSecs: 40, airtimeTxSecs: 76 }), // RX dips → clamp at 0; TX +72 s over 2 h → 1%
  ];

  it("charts raw counters as percent of the wall-clock gap between reports", () => {
    const opt = airtimeOption(points, colors, null) as Record<string, any>;
    expect(opt.series[0].name).toBe("RX");
    expect(opt.series[0].data).toEqual([[H, 1], [3 * H, 0]]);
    expect(opt.series[1].data).toEqual([[H, 0], [3 * H, 1]]);
  });

  it("charts bucketed deltas as percent of the bucket width", () => {
    const bucketed = [point(0, { airtimeRxSecs: 216, airtimeTxSecs: 0 }), point(6 * H, { airtimeRxSecs: 0, airtimeTxSecs: 1080 })];
    const opt = airtimeOption(bucketed, colors, 6 * H) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[0, 1], [6 * H, 0]]);
    expect(opt.series[1].data).toEqual([[0, 0], [6 * H, 5]]);
  });

  it("labels the axis in percent", () => {
    const opt = airtimeOption(points, colors, null) as Record<string, any>;
    expect(opt.yAxis.axisLabel.formatter).toContain("%");
  });
});

const heard = (t: number, p: Partial<ActivityPoint> = {}): ActivityPoint => ({
  t,
  observations: 0,
  airtimeMs: 0,
  snrAvg: null,
  snrMin: null,
  rssiAvg: null,
  ...p,
});

const window = { start: 0, end: 4 * H };

describe("busyOption", () => {
  const points = [heard(0, { airtimeMs: 36_000 }), heard(H, { airtimeMs: null }), heard(2 * H, { airtimeMs: 0 })];

  it("charts on-air time as percent of each bucket, keeping uncosted buckets as gaps", () => {
    const opt = busyOption(points, colors, H, window) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[0, 1], [H, null], [2 * H, 0]]);
    expect(opt.yAxis.axisLabel.formatter).toContain("%");
  });

  it("pins the time axis to the selected window so silence stays visible", () => {
    const opt = busyOption(points, colors, H, window) as Record<string, any>;
    expect(opt.xAxis.min).toBe(0);
    expect(opt.xAxis.max).toBe(4 * H);
  });

  it("prorates the bucket still in progress by the time elapsed so far", () => {
    const full = [heard(0, { airtimeMs: 36_000 }), heard(H, { airtimeMs: 36_000 }), heard(2 * H, { airtimeMs: 36_000 })];
    const opt = busyOption(full, colors, H, { start: 0, end: 2 * H + 1_800_000 }) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[0, 1], [H, 1], [2 * H, 2]]);
  });

  it("emits only gaps when the bucket width is unknown", () => {
    const opt = busyOption(points, colors, null, window) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[0, null], [H, null], [2 * H, null]]);
  });
});

describe("heardOption", () => {
  it("charts the observation count per bucket over the window", () => {
    const opt = heardOption([heard(0, { observations: 7 }), heard(H, { observations: 0 })], colors, window) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[0, 7], [H, 0]]);
    expect(opt.xAxis.min).toBe(0);
    expect(opt.xAxis.max).toBe(4 * H);
  });
});

describe("snrHeardOption", () => {
  const points = [heard(0, { snrAvg: 6.2, snrMin: -3 }), heard(H), heard(2 * H, { snrAvg: 4, snrMin: 1 })];

  it("charts the average and the worst SNR as two series, leaving quiet buckets as gaps", () => {
    const opt = snrHeardOption(points, colors, window) as Record<string, any>;
    expect(opt.series.map((s: { name: string }) => s.name)).toEqual(["Avg", "Min"]);
    expect(opt.series[0].data).toEqual([[0, 6.2], [H, null], [2 * H, 4]]);
    expect(opt.series[1].data).toEqual([[0, -3], [H, null], [2 * H, 1]]);
    expect(opt.series[0].connectNulls).toBe(false);
    expect(opt.xAxis.max).toBe(4 * H);
  });
});

describe("receiveErrorsOption", () => {
  const points = [
    point(1000, { receiveErrors: 5 }),
    point(2000, { receiveErrors: 8 }),
    point(3000, { receiveErrors: 8 }),
  ];

  it("charts raw counters as clamped per-report deltas", () => {
    const opt = receiveErrorsOption(points, colors, false) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[2000, 3], [3000, 0]]);
  });

  it("charts bucketed points as-is", () => {
    const opt = receiveErrorsOption(points, colors, true) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[1000, 5], [2000, 8], [3000, 8]]);
  });
});
