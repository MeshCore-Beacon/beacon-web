# BEACON Web

[![CodeQL](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml)
[![CI](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml)
[![Docker](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml)

Real-time LoRa mesh packet analyzer. Desktop-first, dark-mode-primary, dense information display for radio hobbyists.

Built with React 19, TypeScript, Tailwind CSS 4, TanStack Query, and TanStack Virtual.

## Deployment

The `docker/` example serves only the frontend; it needs a separately reachable beacon-server backend.

### 1. Copy the `docker/` folder to your server

```bash
scp -r docker/ user@your-server:/opt/docker/beacon-web
```

### 2. Create a `.env` file

```bash
cd /opt/docker/beacon-web
cat > .env << 'EOF'
DOMAIN=web.example.com
BEACON_WEB_IMAGE=ghcr.io/meshcore-beacon/beacon-web:2.0.0
VITE_API_BASE=https://api.example.com/api/v1
VITE_WS_URL=wss://api.example.com/ws
EOF
```

| Variable | Description |
|---|---|
| `DOMAIN` | Domain for HTTPS (Caddy auto-provisions Let's Encrypt certs) |
| `BEACON_WEB_IMAGE` | Image to run: a release tag (e.g. `:2.0.0`), `:latest`, or `:dev` |
| `VITE_API_BASE` | Backend REST API base URL |
| `VITE_WS_URL` | Backend WebSocket URL |

Optional, all blank by default:

| Variable | Description |
|---|---|
| `VITE_MAP_CENTER` / `VITE_MAP_ZOOM` | Fallback map view as decimal `lat,lon` and zoom 0-22, used before airports load or when a selection has none. Unset is a world view |
| `VITE_DISABLED_TABS` | Comma list of tabs to hide: `Packets,Channels,Map,Nodes,Observers,Routes,Traces,Analytics` |
| `VITE_ENABLED_THEMES` | Comma list of theme ids. When set, only these themes are offered in the picker (this is also how the hidden `meshmapper_dark` / `meshmapper_light` themes are enabled) |
| `VITE_APP_NAME` | Wordmark text in the top-left. Default `BEACON` |
| `VITE_SKIP_SPLASH` | `true` skips the once-per-session load splash |
| `VITE_BANNER` | Notice shown above the header on every page. `[label](url)` and bare URLs become links |

See `docker/.env.example` for examples. These are read when the container starts, so after editing
`.env` run `docker compose up -d` and visitors get the new values on their next page load. Any
characters are fine in values.

### 3. Start the services

```bash
docker compose up -d
```

The images are public on GitHub Container Registry — no `docker login` required.
If a pull fails with `403 Forbidden`, the package visibility has regressed to
Private; a maintainer needs to set it back to Public (see the troubleshooting note
in [beacon-docs](https://github.com/MeshCore-Beacon/beacon-docs)).

Caddy will automatically obtain a TLS certificate for your domain. Ensure DNS is pointed at your server before starting.

Image tags: `latest` is the newest `main` build, each `vX.Y.Z` release tag publishes `X.Y.Z` and `X.Y`,
and `dev` tracks the `dev` branch. Web and server releases share major.minor versions
(web `2.0.x` pairs with server `2.0.x`); patch levels are independent.

## Local Development

```bash
npm install
cp .env.example .env.local    # optional, edit with your backend URLs
npm run dev                   # starts Vite dev server at http://localhost:5173
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server in the foreground |
| `npm run start` / `stop` / `restart` | Run the dev server in the background (`scripts/devserver.sh`) |
| `npm run dev:status` / `dev:stop-all` | Show or stop background dev servers |
| `npm run build` | Type-check and build for production. This is the only real typecheck |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests |

The UI is translatable; see [docs/translations.md](docs/translations.md) to add a language.

## Project Structure

```
.build/
  Dockerfile              # multi-stage build (Node + Caddy)
  Caddyfile               # internal Caddy config (static file serving)
  docker-entrypoint.sh    # runtime env var injection
docker/
  docker-compose.yml      # production deployment compose file
  .env.example            # deployment variables
  data/Caddy/             # reverse proxy config (Caddyfile.proxy) and cert storage
src/
  api/
    client.ts             # typed REST client (fetch wrapper)
    ws-manager.ts         # WebSocket connection, reconnect, subscription management
  components/             # shared UI components
  features/               # feature modules (packets, nodes, observers, channels, map, routes, traces, stats)
  hooks/                  # React hooks (region, theme, WebSocket)
  i18n/                   # i18next setup and locale catalogs
  lib/                    # constants, formatters, theme utilities
  types/                  # TypeScript types and enums
  App.tsx                 # providers + routing + WS init
  main.tsx                # entry point
  index.css               # Tailwind setup, theme tokens, animations
```

## Architecture

- **Region-driven**: All data queries and WS subscriptions are scoped to an IATA region code. Changing region resets the cache and resubscribes.
- **Live + historical merge**: WebSocket pushes live packets into a `LivePacketStore` buffer (capped at 500). Historical data comes from cursor-paginated REST via `useInfiniteQuery` (max 20 pages). Both are merged and deduped at render time.
- **Packet filtering**: Payload-type, route-type and scope filters are sent to the server and added to the query key, so paging walks the full filtered history. The observer filter and hash/path search stay client-side; one `useMemo` predicate runs over the merged list, so live packets are filtered too.
- **Reconnect with jitter**: Exponential backoff with +/-25% random jitter prevents thundering herd on server bounce.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are welcome — please
also read the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue,
see [SECURITY.md](SECURITY.md).

## License

Licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text and
[CONTRIBUTORS.md](CONTRIBUTORS.md) for acknowledgements.
