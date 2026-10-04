import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), ".build/docker-entrypoint.sh");

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

// Runs the entrypoint (exec'ing `true` instead of caddy) and evaluates the config.js it writes.
function runEntrypoint(env: Record<string, string>): Record<string, string> {
  dir ??= mkdtempSync(join(tmpdir(), "beacon-entrypoint-"));
  const out = join(dir, "config.js");
  execFileSync("sh", [SCRIPT, "true"], { env: { PATH: process.env.PATH, BEACON_CONFIG_OUT: out, ...env } });
  const window: { __BEACON_CONFIG__?: Record<string, string> } = {};
  runInNewContext(readFileSync(out, "utf8"), { window });
  return window.__BEACON_CONFIG__ ?? {};
}

describe("docker-entrypoint.sh", () => {
  it("writes every key, empty when unset", () => {
    const cfg = runEntrypoint({ VITE_API_BASE: "https://api.example.com/api/v1" });
    expect(cfg.VITE_API_BASE).toBe("https://api.example.com/api/v1");
    expect(cfg.VITE_BANNER).toBe("");
    expect(Object.keys(cfg).sort()).toEqual([
      "VITE_API_BASE", "VITE_APP_NAME", "VITE_BANNER", "VITE_CHANGELOG_URL", "VITE_DISABLED_TABS", "VITE_ENABLED_THEMES",
      "VITE_MAP_CENTER", "VITE_MAP_ZOOM", "VITE_SKIP_SPLASH", "VITE_WS_URL",
    ]);
  });

  it("round-trips values with JS and sed metacharacters", () => {
    const banner = 'a `tick` "quote" \'single\' ${x} & | \\ back\\slash </script> café\nline2\ttab';
    expect(runEntrypoint({ VITE_BANNER: banner, VITE_APP_NAME: "R&D | Mesh" })).toMatchObject({
      VITE_BANNER: banner,
      VITE_APP_NAME: "R&D | Mesh",
    });
  });

  it("rewrites the file on every start so a restart picks up new values", () => {
    expect(runEntrypoint({ VITE_BANNER: "first" }).VITE_BANNER).toBe("first");
    expect(runEntrypoint({ VITE_BANNER: "second" }).VITE_BANNER).toBe("second");
  });
});
