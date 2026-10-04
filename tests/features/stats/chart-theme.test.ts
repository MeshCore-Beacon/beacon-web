import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { categoricalPalette, colorContrast, colorDistance, colorHueDistance } from "../../../src/features/stats/chartTheme";

interface ThemeFixture {
  id: string;
  vars: Record<string, string>;
}

const themes = JSON.parse(readFileSync("public/themes.json", "utf8")) as ThemeFixture[];

describe("categoricalPalette", () => {
  it("separates series when a theme reuses semantic colours", () => {
    // Phosphor intentionally uses the same green for primary and success.
    const palette = categoricalPalette(
      ["#4ADE80", "#22D3EE", "#166534"],
      "#0A1628",
      8,
      ["#4ADE80", "#FDE047", "#F87171"],
    );

    expect(palette).toHaveLength(8);
    expect(new Set(palette).size).toBe(8);
    for (let i = 0; i < palette.length; i += 1) {
      for (let j = i + 1; j < palette.length; j += 1) {
        expect(colorDistance(palette[i]!, palette[j]!)).toBeGreaterThan(0.08);
      }
    }
  });

  it("keeps generated chart colours visible on dark and light theme surfaces", () => {
    const accents = ["#007A94", "#1E7E34", "#0062CC", "#9A6A00", "#C82333", "#005F73"];
    const light = categoricalPalette(accents, "#FFFFFF");
    const dark = categoricalPalette(accents, "#111114");

    expect(light.every((color) => colorContrast(color, "#FFFFFF") >= 3)).toBe(true);
    expect(dark.every((color) => colorContrast(color, "#111114") >= 3)).toBe(true);
  });

  it("produces a distinct, visible palette for every bundled theme", () => {
    for (const theme of themes) {
      const accents = ["primary", "secondary", "primary-dim"].map((token) => theme.vars[`--palette-${token}`]!);
      const reserved = ["green", "warn", "danger"].map((token) => theme.vars[`--palette-${token}`]!);
      const background = theme.vars["--palette-bg-surface"]!;
      const palette = categoricalPalette(accents, background, 8, reserved);
      const pairs = palette.flatMap((color, i) => palette.slice(i + 1).map((other) => colorDistance(color, other)));

      expect(palette, theme.id).toHaveLength(8);
      expect(Math.min(...pairs), theme.id).toBeGreaterThan(0.075);
      expect(palette.every((color) => colorContrast(color, background) >= 3), theme.id).toBe(true);
      expect(palette.every((color) => reserved.every((status) => colorDistance(color, status) >= 0.1)), theme.id).toBe(true);
      expect(palette.every((color) => reserved.every((status) => colorHueDistance(color, status) >= 32)), theme.id).toBe(true);
    }
  });

  it("returns the requested number of colours without a named/static palette", () => {
    const palette = categoricalPalette(["#B8E636", "#4ADE80", "#36C4E6"], "#121410", 12);
    expect(palette).toHaveLength(12);
  });
});
