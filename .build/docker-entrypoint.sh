#!/bin/sh
set -e

API_BASE="${VITE_API_BASE:-http://localhost:8080/api/v1}"
WS_URL="${VITE_WS_URL:-ws://localhost:8080/ws}"
# Optional map view — leave empty when unset; the app falls back to a world overview.
MAP_CENTER="${VITE_MAP_CENTER:-}"
MAP_ZOOM="${VITE_MAP_ZOOM:-}"

find /srv -name '*.js' -exec sed -i \
  -e "s|__VITE_API_BASE__|${API_BASE}|g" \
  -e "s|__VITE_WS_URL__|${WS_URL}|g" \
  -e "s|__VITE_MAP_CENTER__|${MAP_CENTER}|g" \
  -e "s|__VITE_MAP_ZOOM__|${MAP_ZOOM}|g" \
  {} +

exec "$@"
