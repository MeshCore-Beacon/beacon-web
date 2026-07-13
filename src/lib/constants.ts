export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8080/api/v1";
export const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080/ws";

export const LIVE_BUFFER_CAP = 500;
export const MAX_INFINITE_PAGES = 20;
export const DEFAULT_PAGE_SIZE = 50;

export const SCROLL_TOP_THRESHOLD_PX = 100;
export const SCROLL_BOTTOM_THRESHOLD_PX = 500;

export const WS_PING_INTERVAL_MS = 30_000;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 30_000;
export const WS_RECONNECT_JITTER = 0.25;

// app tab names, in display order; the ?tab URL param is validated against this list
export const TABS = ["Packets", "Channels", "Map", "Nodes", "Observers", "Routes", "Traces", "Analytics"] as const;

// Per-deployment .env config (VITE_* prefix is required so the build can expose it to the browser;
// the Docker entrypoint sed-substitutes each sentinel at container start — see .build/).

// Split a comma-separated env value into trimmed, non-empty entries. An unset var or an
// un-substituted "__VITE_..__" sentinel yields a harmless single entry that matches nothing.
export function parseEnvList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// Tabs left after removing the disabled ones (case-insensitive), keeping display order.
export function filterEnabledTabs(tabs: readonly string[], disabledRaw: string | undefined): string[] {
  const disabled = new Set(parseEnvList(disabledRaw).map((t) => t.toLowerCase()));
  return tabs.filter((t) => !disabled.has(t.toLowerCase()));
}

// Truthy env flag: "1"/"true"/"yes"/"on" (case-insensitive). Anything else — empty, unset, or an
// un-substituted sentinel — is false, so the gated behaviour only turns on when explicitly asked for.
export function parseEnvBool(raw: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((raw ?? "").trim().toLowerCase());
}

// The themes offered in the picker. When VITE_ENABLED_THEMES lists ids it's an EXCLUSIVE allowlist —
// only those show (e.g. a branded deployment that wants just its own themes). Otherwise every
// non-hidden theme shows and `hidden` ones (like the MeshMapper pair) stay out.
export function selectableThemes<T extends { id: string; hidden?: boolean }>(
  themes: readonly T[],
  enabledIds: Set<string>,
): T[] {
  if (enabledIds.size > 0) {
    return themes.filter((t) => enabledIds.has(t.id.toLowerCase()));
  }
  return themes.filter((t) => !t.hidden);
}

const enabledTabs = filterEnabledTabs(TABS, import.meta.env.VITE_DISABLED_TABS);
// Floor: an all-disabled misconfig would otherwise leave a blank app.
export const ENABLED_TABS = enabledTabs.length > 0 ? enabledTabs : [...TABS];

export const ENABLED_THEME_IDS = new Set(
  parseEnvList(import.meta.env.VITE_ENABLED_THEMES).map((s) => s.toLowerCase()),
);

// "||" (not "??") so an empty sed substitution falls back to the default too.
export const APP_NAME = import.meta.env.VITE_APP_NAME || "BEACON";
export const GITHUB_URL = "https://github.com/MeshCore-Beacon";

// Skip the once-per-session load splash entirely (e.g. an embedded/branded deployment).
export const SKIP_SPLASH = parseEnvBool(import.meta.env.VITE_SKIP_SPLASH);
