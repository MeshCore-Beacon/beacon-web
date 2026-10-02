#!/bin/sh
set -e

# Runtime config lives in /config.js (served no-cache), not the hashed bundle, so env changes take
# effect on any restart and reach returning visitors. Empty values fall back to the app defaults.
OUT="${BEACON_CONFIG_OUT:-/srv/config.js}"
KEYS="VITE_API_BASE VITE_WS_URL VITE_MAP_CENTER VITE_MAP_ZOOM VITE_DISABLED_TABS VITE_ENABLED_THEMES VITE_APP_NAME VITE_SKIP_SPLASH VITE_BANNER"

# Values are read from ENVIRON and JSON-escaped, so any character is safe.
awk -v keys="$KEYS" 'BEGIN {
  for (i = 1; i < 32; i++) esc[sprintf("%c", i)] = sprintf("\\u%04x", i)
  esc["\\"] = "\\\\"
  esc["\""] = "\\\""
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

exec "$@"
