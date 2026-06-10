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

export function withAlpha(color: string, a: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function blend(a: string, b: string, t = 0.5): string {
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
  // 8 categorical colors blended from the palette so any theme stays cohesive.
  const series = [
    c.primary,
    c.green,
    c.secondary,
    c.warn,
    c.danger,
    c.primaryDim,
    blend(c.primary, c.secondary),
    blend(c.green, c.warn),
  ];
  return { ...c, series };
}

export function useChartColors(): ChartColors {
  const { paletteRev } = useTheme();
  // paletteRev bumps after each applyTheme, including the initial saved-theme load (which themeId
  // alone misses — it's already the saved id before the CSS vars land).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- paletteRev is the re-read trigger
  return useMemo(() => readChartColors(), [paletteRev]);
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
