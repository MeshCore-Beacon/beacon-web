import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), ".build/docker-entrypoint.sh");
const TAG = '<script src="/config.js"></script>';
// Vite moves the module script but keeps this tag verbatim in dist/index.html.
const SHELL = readFileSync(join(process.cwd(), "index.html"), "utf8");
const INLINE = /<script>window\.__BEACON_CONFIG__[^]*?<\/script>/;

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function paths() {
  dir ??= mkdtempSync(join(tmpdir(), "beacon-entrypoint-"));
  return { dir, config: join(dir, "config.js"), html: join(dir, "index.html") };
}

function evalConfig(js: string): Record<string, string> {
  const window: { __BEACON_CONFIG__?: Record<string, string> } = {};
  runInNewContext(js, { window });
  return window.__BEACON_CONFIG__ ?? {};
}

// Runs the entrypoint (exec'ing `true` instead of caddy) and evaluates the config.js it writes.
function runEntrypoint(env: Record<string, string>): Record<string, string> {
  const p = paths();
  execFileSync("sh", [SCRIPT, "true"], {
    env: {
      PATH: process.env.PATH,
      BEACON_CONFIG_OUT: p.config,
      BEACON_INDEX_OUT: p.html,
      BEACON_INDEX_TEMPLATE: join(p.dir, "keep", "index.html"),
      ...env,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  return evalConfig(readFileSync(p.config, "utf8"));
}

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const inlineScripts = (html: string) =>
  [...parse(html).querySelectorAll("script:not([src])")].map((s) => s.textContent ?? "");

describe("docker-entrypoint.sh", () => {
  it("writes every key, empty when unset", () => {
    const cfg = runEntrypoint({ VITE_API_BASE: "https://api.example.com/api/v1" });
    expect(cfg.VITE_API_BASE).toBe("https://api.example.com/api/v1");
    expect(cfg.VITE_BANNER).toBe("");
    expect(Object.keys(cfg).sort()).toEqual([
      "VITE_API_BASE", "VITE_APP_NAME", "VITE_BANNER", "VITE_DISABLED_TABS", "VITE_ENABLED_THEMES",
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

  it("inlines the same config into index.html in place of the /config.js tag", () => {
    expect(SHELL).toContain(TAG);
    writeFileSync(paths().html, SHELL);
    const fromFile = runEntrypoint({ VITE_API_BASE: "https://api.example.com/api/v1", VITE_APP_NAME: "R&D" });
    const html = readFileSync(paths().html, "utf8");
    expect(html).not.toContain(TAG);
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(evalConfig(scripts[0])).toEqual(fromFile);
    expect(html.replace(INLINE, TAG)).toBe(SHELL);
  });

  it("regenerates index.html from the pristine shell on every start", () => {
    writeFileSync(paths().html, SHELL);
    runEntrypoint({ VITE_BANNER: "first" });
    runEntrypoint({ VITE_BANNER: "second", VITE_APP_NAME: "Mesh" });
    const html = readFileSync(paths().html, "utf8");
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(evalConfig(scripts[0])).toMatchObject({ VITE_BANNER: "second", VITE_APP_NAME: "Mesh" });
    expect(html.replace(INLINE, TAG)).toBe(SHELL);
  });

  it("keeps markup in a value inside the inline script string", () => {
    const banner = "</script><script>alert(1)</script><!--<script> </SCRIPT>";
    writeFileSync(paths().html, SHELL);
    runEntrypoint({ VITE_BANNER: banner });
    const html = readFileSync(paths().html, "utf8");
    expect(parse(html).scripts).toHaveLength(parse(SHELL).scripts.length);
    const scripts = inlineScripts(html);
    expect(scripts).toHaveLength(1);
    expect(evalConfig(scripts[0]).VITE_BANNER).toBe(banner);
  });

  it("leaves an index.html without the tag byte-identical", () => {
    const custom = '<!doctype html>\n<html><body><script src="/runtime.js"></script></body></html>\n';
    writeFileSync(paths().html, custom);
    expect(runEntrypoint({ VITE_BANNER: "first" }).VITE_BANNER).toBe("first");
    expect(runEntrypoint({ VITE_BANNER: "second" }).VITE_BANNER).toBe("second");
    expect(readFileSync(paths().html, "utf8")).toBe(custom);
  });

  it("still starts with the shell untouched when the pristine copy can't be kept", () => {
    writeFileSync(paths().html, SHELL);
    const blocker = join(paths().dir, "not-a-dir");
    writeFileSync(blocker, "");
    const cfg = runEntrypoint({ BEACON_INDEX_TEMPLATE: join(blocker, "index.html"), VITE_BANNER: "x" });
    expect(cfg.VITE_BANNER).toBe("x");
    expect(readFileSync(paths().html, "utf8")).toBe(SHELL);
  });
});
