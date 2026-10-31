import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The analyzer's scrape block lets browser /api calls through on their Referer, so the page must keep sending one.
describe("referrer policy", () => {
  it("the image's Caddyfile keeps a Referer on same-origin requests", () => {
    const caddyfile = readFileSync(join(process.cwd(), ".build/Caddyfile"), "utf8");
    const policy = /^\s*Referrer-Policy\s+(\S+)/m.exec(caddyfile)?.[1];
    expect(policy).toBeDefined();
    expect(policy).not.toBe("no-referrer");
  });

  it("index.html sets no referrer policy of its own", () => {
    const shell = readFileSync(join(process.cwd(), "index.html"), "utf8");
    expect(shell).not.toMatch(/<meta[^>]+name=["']referrer["']/i);
  });
});
