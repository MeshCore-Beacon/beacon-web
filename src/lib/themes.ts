// theme loading and CSS var injection

export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
  // hidden themes are omitted from the picker unless enabled via VITE_ENABLED_THEMES
  hidden?: boolean;
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

// Rebuild the browser-tab favicon in the active primary color. A favicon file
// can't read the page's CSS vars, so we regenerate it as a data-URI on every
// theme apply (initial load + each switch) so the tab follows the theme.
function updateFavicon(primary: string) {
  if (typeof document === "undefined") return;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">` +
    `<polygon points="90,50 70,84.64 30,84.64 10,50 30,15.36 70,15.36" fill="none" stroke="${primary}" stroke-width="4.5" stroke-linejoin="round" opacity="0.3"/>` +
    `<polygon points="78,50 64,74.25 36,74.25 22,50 36,25.75 64,25.75" fill="none" stroke="${primary}" stroke-width="4.5" stroke-linejoin="round" opacity="0.6"/>` +
    `<polygon points="66,50 58,63.86 42,63.86 34,50 42,36.14 58,36.14" fill="none" stroke="${primary}" stroke-width="4.5" stroke-linejoin="round" opacity="0.95"/>` +
    `<circle cx="50" cy="50" r="6.5" fill="${primary}"/>` +
    `</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/svg+xml";
  link.href = href;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  updateFavicon(theme.vars["--palette-primary"] ?? "#3B82F6");
}
