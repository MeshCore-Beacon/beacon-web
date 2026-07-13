#!/bin/sh
set -e

API_BASE="${VITE_API_BASE:-http://localhost:8080/api/v1}"
WS_URL="${VITE_WS_URL:-ws://localhost:8080/ws}"
# Optional map view — leave empty when unset; the app falls back to a world overview.
MAP_CENTER="${VITE_MAP_CENTER:-}"
MAP_ZOOM="${VITE_MAP_ZOOM:-}"
# Optional branding/customization — empty means default behaviour (all tabs, hidden themes hidden).
DISABLED_TABS="${VITE_DISABLED_TABS:-}"
ENABLED_THEMES="${VITE_ENABLED_THEMES:-}"
# APP_NAME is substituted verbatim; avoid '&' and '|' (sed replacement metachar and delimiter).
APP_NAME="${VITE_APP_NAME:-BEACON}"

find /srv -name '*.js' -exec sed -i \
  -e "s|__VITE_API_BASE__|${API_BASE}|g" \
  -e "s|__VITE_WS_URL__|${WS_URL}|g" \
  -e "s|__VITE_MAP_CENTER__|${MAP_CENTER}|g" \
  -e "s|__VITE_MAP_ZOOM__|${MAP_ZOOM}|g" \
  -e "s|__VITE_DISABLED_TABS__|${DISABLED_TABS}|g" \
  -e "s|__VITE_ENABLED_THEMES__|${ENABLED_THEMES}|g" \
  -e "s|__VITE_APP_NAME__|${APP_NAME}|g" \
  {} +

exec "$@"
