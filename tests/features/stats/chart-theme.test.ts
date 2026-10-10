import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { blend, colorContrast, colorDistance, distinctColors } from "../../../src/features/stats/chartTheme";

interface ThemeFixture {
  id: string;
  vars: Record<string, string>;
}

const themes = JSON.parse(readFileSync("public/themes.json", "utf8")) as ThemeFixture[];

function seriesFor(theme: ThemeFixture) {
  const v = (token: string) => theme.vars[`--palette-${token}`]!;
  return [v("primary"), v("green"), v("secondary"), v("warn"), v("danger"), v("primary-dim"), blend(v("primary"), v("secondary")), blend(v("green"), v("warn"))];
}

describe("distinctColors", () => {
  it("keeps a theme's colours when none repeat", () => {
    const colors = ["#3B82F6", "#22C55E", "#A78BFA", "#EAB308"];
    expect(distinctColors(colors, "#111114")).toEqual(colors);
  });

  it("replaces a repeated colour with a distinct, visible one", () => {
    // Phosphor uses the same green for primary and success
    const [primary, green] = distinctColors(["#4ADE80", "#4ADE80", "#22D3EE"], "#0A1628");
    expect(primary).toBe("#4ADE80");
    expect(colorDistance(green!, "#4ADE80")).toBeGreaterThan(0.1);
    expect(colorDistance(green!, "#22D3EE")).toBeGreaterThan(0.1);
    expect(colorContrast(green!, "#0A1628")).toBeGreaterThanOrEqual(3);
  });

  it("gives every bundled theme eight separable series and leaves clash-free themes untouched", () => {
    for (const theme of themes) {
      const wanted = seriesFor(theme);
      const series = distinctColors(wanted, theme.vars["--palette-bg-surface"]!);
      const pairs = series.flatMap((color, i) => series.slice(i + 1).map((other) => colorDistance(color, other)));
      expect(series, theme.id).toHaveLength(8);
      expect(Math.min(...pairs), theme.id).toBeGreaterThanOrEqual(0.05);
      if (theme.id === "neutral-blue") expect(series).toEqual(wanted);
    }
  });
});
