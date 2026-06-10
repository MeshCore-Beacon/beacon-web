import { describe, it, expect } from "vitest";
import { typeBarOption, leaderboardOption, donutOption } from "../../../src/features/stats/chartOptions";
import type { ChartColors } from "../../../src/features/stats/chartTheme";

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
  it("centers the total on the ring via a textAlign-centered title at the pie's x", () => {
    const opt = donutOption([{ name: "repeater", value: 3 }], colors, "10", "NODES") as Record<string, any>;
    // the old graphic-text approach anchored its left edge at the ring center and clipped
    expect(opt.graphic).toBeUndefined();
    expect(opt.title.textAlign).toBe("center");
    expect(opt.title.text).toBe("10");
    expect(parseFloat(opt.title.left)).toBeCloseTo(parseFloat(opt.series[0].center[0]), 0);
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
