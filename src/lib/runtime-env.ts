declare global {
  interface Window {
    __BEACON_CONFIG__?: Record<string, unknown>;
  }
}

// Container config (written to /config.js at start) wins; otherwise the build-time value, so
// `npm run dev` and .env.local keep working. Callers pass import.meta.env.VITE_X explicitly so
// Vite inlines only that key, not the whole env object.
export function runtimeEnv(key: string, buildValue: string | undefined): string | undefined {
  const value = typeof window === "undefined" ? undefined : window.__BEACON_CONFIG__?.[key];
  if (typeof value === "string" && value !== "") return value;
  return buildValue;
}
