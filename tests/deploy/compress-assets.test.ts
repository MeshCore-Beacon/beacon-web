import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), ".build/compress-assets.mjs");

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function assets(files: Record<string, string | Buffer>): string {
  dir = mkdtempSync(join(tmpdir(), "beacon-compress-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

const compress = (target: string) => execFileSync("node", [SCRIPT, target], { stdio: ["ignore", "pipe", "pipe"] });
const js = "export const rows = [" + Array.from({ length: 400 }, (_, i) => `{ id: ${i}, label: "row ${i}" }`).join(", ") + "];\n";

describe("compress-assets.mjs", () => {
  it("writes brotli and gzip copies that decode to the original bytes", () => {
    const target = assets({ "index-abc.js": js, "index-abc.css": `.row { color: red; }\n`.repeat(200), "nested/chunk.js": js });
    compress(target);
    for (const name of ["index-abc.js", "index-abc.css", "nested/chunk.js"]) {
      const original = readFileSync(join(target, name));
      const br = readFileSync(join(target, `${name}.br`));
      const gz = readFileSync(join(target, `${name}.gz`));
      expect(brotliDecompressSync(br).equals(original)).toBe(true);
      expect(gunzipSync(gz).equals(original)).toBe(true);
      expect(br.length).toBeLessThan(gz.length);
      expect(gz.length).toBeLessThan(original.length);
    }
  });

  it("leaves binary files and files compression wouldn't shrink alone", () => {
    const target = assets({ "logo.png": randomBytes(4096), "tiny.js": "x", "noise.js": randomBytes(2048).toString("base64") });
    compress(target);
    expect(readdirSync(target).sort()).toEqual(["logo.png", "noise.js", "noise.js.br", "noise.js.gz", "tiny.js"]);
    const before = readFileSync(join(target, "noise.js")).length;
    expect(readFileSync(join(target, "noise.js.br")).length).toBeLessThan(before);
  });

  it("is safe to run twice: no copies of copies", () => {
    const target = assets({ "index-abc.js": js });
    compress(target);
    compress(target);
    expect(readdirSync(target).sort()).toEqual(["index-abc.js", "index-abc.js.br", "index-abc.js.gz"]);
  });

  it("fails loudly on a missing directory", () => {
    const missing = join(tmpdir(), "beacon-compress-missing", String(Date.now()));
    expect(existsSync(missing)).toBe(false);
    expect(() => compress(missing)).toThrow();
  });
});
