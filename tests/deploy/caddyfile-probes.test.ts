import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CADDYFILE = readFileSync(join(process.cwd(), ".build/Caddyfile"), "utf8");

// Ban jails count 404s as probes; the app shell's 200 hid /.env and *.php scans from them.
describe("Caddyfile probe 404s", () => {
  it("answers dotfile and .php paths with a 404, but leaves /.well-known/ alone", () => {
    const matcher = /@probe \{([^}]*)\}/.exec(CADDYFILE)?.[1] ?? "";
    expect(matcher).toMatch(/^\s*path \*\/\.\* \*\.php$/m);
    expect(matcher).toMatch(/^\s*not path \/\.well-known\/\*$/m);
    expect(CADDYFILE).toMatch(/handle @probe \{\s*respond 404\s*\}/);
  });

  it("routes probes before the app shell fallback", () => {
    const probe = CADDYFILE.indexOf("handle @probe");
    expect(probe).toBeGreaterThan(-1);
    expect(probe).toBeLessThan(CADDYFILE.indexOf("try_files {path} /index.html"));
  });
});
