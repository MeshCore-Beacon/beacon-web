#!/bin/sh
set -e

# Runtime config lives in /config.js (served no-cache), not the hashed bundle, so env changes take
# effect on any restart and reach returning visitors. Empty values fall back to the app defaults.
OUT="${BEACON_CONFIG_OUT:-/srv/config.js}"
HTML="${BEACON_INDEX_OUT:-/srv/index.html}"
# Outside /srv so Caddy never serves it, and outside Caddy's /data and /config volumes.
TEMPLATE="${BEACON_INDEX_TEMPLATE:-/var/lib/beacon-web/index.html}"
TAG='<script src="/config.js"></script>'
KEYS="VITE_API_BASE VITE_WS_URL VITE_MAP_CENTER VITE_MAP_ZOOM VITE_DISABLED_TABS VITE_ENABLED_THEMES VITE_APP_NAME VITE_SKIP_SPLASH VITE_BANNER"

# Values are read from ENVIRON and JSON-escaped, so any character is safe; < too, so none can end
# the inline copy's script element.
awk -v keys="$KEYS" 'BEGIN {
  for (i = 1; i < 32; i++) esc[sprintf("%c", i)] = sprintf("\\u%04x", i)
  esc["\\"] = "\\\\"
  esc["\""] = "\\\""
  esc["<"] = "\\u003c"
  n = split(keys, k, " ")
  printf "window.__BEACON_CONFIG__ = {"
  for (i = 1; i <= n; i++) {
    v = ENVIRON[k[i]]
    s = ""
    for (j = 1; j <= length(v); j++) {
      c = substr(v, j, 1)
      s = s ((c in esc) ? esc[c] : c)
    }
    printf "%s\n  \"%s\": \"%s\"", (i > 1 ? "," : ""), k[i], s
  }
  printf "\n};\n"
}' > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

# Inline the same config in place of the tag, so a page load doesn't wait on a second no-cache
# request. A restart keeps the inlined file, so each start rebuilds it from the pristine copy.
inline_config() {
  if grep -qF "$TAG" "$HTML" 2>/dev/null; then
    mkdir -p "${TEMPLATE%/*}" && cp "$HTML" "$TEMPLATE" || return 1
  elif ! grep -qF '<script>window.__BEACON_CONFIG__' "$HTML" 2>/dev/null; then
    return 0 # no index.html, or a custom one without the tag: it still loads /config.js
  fi
  awk -v tag="$TAG" '
    NR == FNR { cfg = cfg (FNR > 1 ? "\n" : "") $0; next }
    !done && (i = index($0, tag)) {
      $0 = substr($0, 1, i - 1) "<script>" cfg "</script>" substr($0, i + length(tag))
      done = 1
    }
    { print }
    END { exit !done }
  ' "$OUT" "$TEMPLATE" > "$HTML.tmp" && mv "$HTML.tmp" "$HTML"
}
inline_config || { rm -f "$HTML.tmp"; echo "docker-entrypoint: could not inline the config into $HTML" >&2; }

exec "$@"
