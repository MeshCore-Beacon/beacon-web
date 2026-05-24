// theme loading and CSS var injection

export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
}

export const DEFAULT_THEME_ID = "neutral-blue";

const FALLBACK: Theme = {
  id: "neutral-blue",
  name: "Neutral Blue",
  vars: {
    "--palette-bg-base": "#09090B",
    "--palette-bg-surface": "#111114",
    "--palette-bg-raised": "#1A1A1F",
    "--palette-border": "#27272A",
    "--palette-border-subtle": "#1E1E22",
    "--palette-primary": "#3B82F6",
    "--palette-primary-dim": "#1D4ED8",
    "--palette-secondary": "#A78BFA",
    "--palette-green": "#22C55E",
    "--palette-danger": "#EF4444",
    "--palette-warn": "#EAB308",
    "--palette-text-bright": "#FAFAFA",
    "--palette-text-normal": "#A1A1AA",
    "--palette-text-muted": "#73737B",
    "--palette-text-dim": "#5F5F65",
  },
};

export async function loadThemes(): Promise<Theme[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}themes.json`);
    if (!res.ok) return [FALLBACK];
    const data: Theme[] = await res.json();
    return data.length > 0 ? data : [FALLBACK];
  } catch {
    return [FALLBACK];
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
}
