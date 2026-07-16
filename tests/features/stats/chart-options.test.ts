/* eslint-disable @typescript-eslint/no-explicit-any -- poking into loose ECharts option shapes */
import { describe, it, expect } from "vitest";
import { typeBarOption, leaderboardOption, donutOption, presetBarsOption, airtimeOption, receiveErrorsOption } from "../../../src/features/stats/chartOptions";
import type { ChartColors } from "../../../src/features/stats/chartTheme";
import type { TelemetryPoint } from "../../../src/features/stats/types";

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
});

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

describe("airtimeOption", () => {
  const points = [
    point(1000, { airtimeRxPct: 10, airtimeTxPct: 4 }),
    point(2000, { airtimeRxPct: 12, airtimeTxPct: 4 }),
    point(3000, { airtimeRxPct: 11, airtimeTxPct: 7 }),
  ];

  it("charts raw counters as clamped per-report deltas", () => {
    const opt = airtimeOption(points, colors, false) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[2000, 2], [3000, 0]]); // RX dips → clamp at 0
    expect(opt.series[1].data).toEqual([[2000, 0], [3000, 3]]); // TX
  });

  it("charts bucketed points as-is", () => {
    const opt = airtimeOption(points, colors, true) as Record<string, any>;
    expect(opt.series[0].data).toEqual([[1000, 10], [2000, 12], [3000, 11]]);
    expect(opt.series[1].data).toEqual([[1000, 4], [2000, 4], [3000, 7]]);
  });

  it("labels the axis and tooltip as on-air durations", () => {
    const opt = airtimeOption(points, colors, true) as Record<string, any>;
    expect(opt.yAxis.axisLabel.formatter(74)).toBe("1m 14s");
    const tip = opt.tooltip.formatter([
      { axisValueLabel: "t", seriesName: "RX", value: [2000, 74], marker: "●" },
      { seriesName: "TX", value: [2000, null], marker: "●" },
    ]);
    expect(tip).toContain("RX 1m 14s");
    expect(tip).toContain("TX —");
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
