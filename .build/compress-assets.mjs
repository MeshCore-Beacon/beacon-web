// Writes max-quality .br and .gz copies next to each text asset, for Caddy's `precompressed`.
// Usage: node compress-assets.mjs <dir>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

const TEXT = /\.(?:js|mjs|css|html|svg|json|map|txt|xml)$/;
const br = promisify(brotliCompress);
const gz = promisify(gzip);

const dir = process.argv[2];
if (!dir) throw new Error("usage: node compress-assets.mjs <dir>");

const files = readdirSync(dir, { recursive: true }).filter((name) => TEXT.test(name));
await Promise.all(files.map(async (name) => {
  const path = join(dir, name);
  const body = readFileSync(path);
  const [brotli, gzipped] = await Promise.all([
    br(body, { params: {
      [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
    } }),
    gz(body, { level: constants.Z_BEST_COMPRESSION }),
  ]);
  // A copy that isn't smaller would only cost bytes; Caddy serves the original (or encodes it) instead.
  if (brotli.length < body.length) writeFileSync(`${path}.br`, brotli);
  if (gzipped.length < body.length) writeFileSync(`${path}.gz`, gzipped);
}));
