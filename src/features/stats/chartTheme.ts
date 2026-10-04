import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";

// ECharts paints to a canvas and can't inherit our CSS variables, so we read the active palette's
// resolved `--color-*` tokens (defined in index.css `@theme`, which always resolve — palette value or
// fallback) and hand them to the option builders. `useChartColors()` re-reads whenever a palette is
// applied (initial saved-theme load and every switch), so charts always match the active theme.

export interface ChartColors {
  primary: string;
  primaryDim: string;
  secondary: string;
  // Semantic status colours. Do not use these merely to distinguish unrelated series.
  green: string;
  warn: string;
  danger: string;
  textBright: string;
  textNormal: string;
  textMuted: string;
  textDim: string;
  bgBase: string;
  bgSurface: string;
  bgRaised: string;
  border: string;
  borderSubtle: string;
  // categorical palette for donuts / multi-series, derived from the theme so it stays on-brand.
  series: string[];
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type RGB = [number, number, number];
type OKLab = [number, number, number];
type OKLCH = [number, number, number];

function parseColor(c: string): RGB {
  const s = c.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m && m[1]) {
    const parts = m[1].split(",").map((p) => parseFloat(p) || 0);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }
  return [128, 128, 128];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel: number): number {
  const c = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return c * 255;
}

// OKLab is deliberately used here instead of RGB/HSL: equal distances are much closer to equal
// perceived colour differences, which is what matters when adjacent chart series must be told apart.
function rgbToOklab(color: string): OKLab {
  const [r8, g8, b8] = parseColor(color);
  const r = srgbToLinear(r8), g = srgbToLinear(g8), b = srgbToLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgbRaw([L, a, b]: OKLab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function labToLch([L, a, b]: OKLab): OKLCH {
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
}

function lchToLab([L, C, h]: OKLCH): OKLab {
  const radians = h * Math.PI / 180;
  return [L, C * Math.cos(radians), C * Math.sin(radians)];
}

function inGamut(rgb: RGB): boolean {
  return rgb.every((channel) => channel >= 0 && channel <= 255);
}

// Chroma is reduced only when the requested OKLCH colour falls outside sRGB. This preserves hue and
// lightness instead of independently clipping channels, which can collapse two generated colours.
function lchToColor(lch: OKLCH): string {
  let candidate = lch;
  if (!inGamut(oklabToRgbRaw(lchToLab(candidate)))) {
    let low = 0, high = lch[1];
    for (let i = 0; i < 14; i += 1) {
      const chroma = (low + high) / 2;
      if (inGamut(oklabToRgbRaw(lchToLab([lch[0], chroma, lch[2]])))) low = chroma;
      else high = chroma;
    }
    candidate = [lch[0], low, lch[2]];
  }
  const rgb = oklabToRgbRaw(lchToLab(candidate)).map((channel) => Math.round(Math.max(0, Math.min(255, channel)))) as RGB;
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function relativeLuminance(color: string): number {
  const [r, g, b] = parseColor(color).map(srgbToLinear);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function colorContrast(a: string, b: string): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function colorDistance(a: string, b: string): number {
  const x = rgbToOklab(a), y = rgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export function colorHueDistance(a: string, b: string): number {
  const [, chromaA, hueA] = labToLch(rgbToOklab(a));
  const [, chromaB, hueB] = labToLch(rgbToOklab(b));
  if (chromaA < 0.02 || chromaB < 0.02) return 180;
  const distance = Math.abs(hueA - hueB);
  return Math.min(distance, 360 - distance);
}

function contrastingColor(lch: OKLCH, background: string): string {
  let color = lchToColor(lch);
  if (colorContrast(color, background) >= 3) return color;
  const lighter = relativeLuminance(background) < 0.4;
  let lightness = lch[0];
  for (let i = 0; i < 24; i += 1) {
    lightness = Math.max(0.05, Math.min(0.95, lightness + (lighter ? 0.025 : -0.025)));
    color = lchToColor([lightness, lch[1], lch[2]]);
    if (colorContrast(color, background) >= 3) break;
  }
  return color;
}

/**
 * Build a categorical chart palette from the active theme's identity colours.
 *
 * Themes are allowed to reuse a semantic colour (for example Phosphor's primary and green are both
 * #4ADE80), so token order alone is not a categorical palette. We make a pool from those tokens and
 * theme-relative OKLCH hue rotations, then greedily pick the colour furthest from every colour already
 * selected. The result remains derived from the theme while avoiding duplicate/near-duplicate series.
 */
export function categoricalPalette(themeColors: string[], background: string, count = 8, reservedColors: string[] = []): string[] {
  if (themeColors.length === 0 || count <= 0) return [];
  const labs = themeColors.map(rgbToOklab);
  const lchs = labs.map(labToLch);
  const chromatic = lchs.filter(([, chroma]) => chroma > 0.02);
  const farFromReserved = (color: string) => reservedColors.every((reserved) =>
    colorDistance(color, reserved) >= 0.1 && colorHueDistance(color, reserved) >= 32);
  const anchorIndex = themeColors.findIndex(farFromReserved);
  const anchor = lchs[anchorIndex >= 0 ? anchorIndex : 0] ?? chromatic[0] ?? lchs[0]!;
  const sortedLightness = lchs.map(([lightness]) => lightness).sort((a, b) => a - b);
  const sortedChroma = chromatic.map(([, chroma]) => chroma).sort((a, b) => a - b);
  const median = (values: number[], fallback: number) => values[Math.floor(values.length / 2)] ?? fallback;
  const baseLightness = median(sortedLightness, anchor[0]);
  const baseChroma = Math.max(0.08, Math.min(0.22, median(sortedChroma, anchor[1])));

  const semantic = lchs.map((lch) => contrastingColor(lch, background));
  const generated = Array.from({ length: Math.max(32, count * 6) }, (_, i) => {
    // A golden-angle walk avoids repeatedly landing in the same hue family. Alternating lightness
    // gives later colours another perceptual dimension without introducing a fixed colour palette.
    const hue = (anchor[2] + i * 137.507764) % 360;
    const lightnessOffset = ((i % 5) - 2) * 0.06;
    return contrastingColor([Math.max(0.2, Math.min(0.88, baseLightness + lightnessOffset)), baseChroma, hue], background);
  });
  // Status colours are intentionally absent from ordinary categories: green/warn/danger must keep
  // one meaning throughout Beacon. Perceptual distance also excludes nearby derived shades.
  const candidates = [...semantic, ...generated].filter(farFromReserved);
  const selected = [candidates.shift() ?? semantic[0]!];

  while (selected.length < count) {
    let best: string | undefined;
    let bestScore = -1;
    for (const candidate of candidates) {
      const score = Math.min(...selected.map((color) => colorDistance(candidate, color)));
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best || bestScore < 0.001) break;
    selected.push(best);
    candidates.splice(candidates.indexOf(best), 1);
  }
  return selected;
}

export function withAlpha(color: string, a: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function blend(a: string, b: string, t = 0.5): string {
  const [r1, g1, b1] = parseColor(a);
  const [r2, g2, b2] = parseColor(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

export function readChartColors(): ChartColors {
  const c = {
    primary: readVar("--color-primary") || "#3B82F6",
    primaryDim: readVar("--color-primary-dim") || "#1D4ED8",
    secondary: readVar("--color-secondary") || "#A78BFA",
    green: readVar("--color-green") || "#22C55E",
    warn: readVar("--color-warn") || "#EAB308",
    danger: readVar("--color-danger") || "#EF4444",
    textBright: readVar("--color-text-bright") || "#FAFAFA",
    textNormal: readVar("--color-text-normal") || "#A1A1AA",
    textMuted: readVar("--color-text-muted") || "#73737B",
    textDim: readVar("--color-text-dim") || "#5F5F65",
    bgBase: readVar("--color-bg-base") || "#09090B",
    bgSurface: readVar("--color-bg-surface") || "#111114",
    bgRaised: readVar("--color-bg-raised") || "#1A1A1F",
    border: readVar("--color-border") || "#27272A",
    borderSubtle: readVar("--color-border-subtle") || "#1E1E22",
  };
  const series = categoricalPalette(
    [c.primary, c.secondary, c.primaryDim],
    c.bgSurface,
    8,
    [c.green, c.warn, c.danger],
  );
  return { ...c, series };
}

export function useChartColors(): ChartColors {
  const { paletteRev } = useTheme();
  // paletteRev bumps after each applyTheme, including the initial saved-theme load (which themeId
  // alone misses — it's already the saved id before the CSS vars land).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- paletteRev is the re-read trigger
  return useMemo(() => readChartColors(), [paletteRev]);
}

// Per-device-type colour, shared by the Mesh "Node types" donut and the neighbour graph so the two
// views stay in sync. These are categories, so none of them consume a semantic status colour.
export function nodeTypeColor(typeName: string, c: ChartColors): string {
  switch (typeName) {
    case "companion": return c.series[0]!;
    case "repeater": return c.series[1]!;
    case "room_server": return c.series[2]!;
    case "sensor": return c.series[3]!;
    default: return c.series[4]!;
  }
}

// A reusable ECharts tooltip style block bound to the active palette.
export function tooltipStyle(c: ChartColors) {
  return {
    backgroundColor: c.bgRaised,
    borderColor: c.border,
    borderWidth: 1,
    padding: [7, 11] as [number, number],
    textStyle: { color: c.textBright, fontFamily: "JetBrains Mono, monospace", fontSize: 11 },
  };
}
