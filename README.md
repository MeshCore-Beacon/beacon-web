# BEACON Web

[![CodeQL](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/codeql.yml)
[![CI](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/ci.yml)
[![Docker](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/MeshCore-Beacon/beacon-web/actions/workflows/docker-publish.yml)

Real-time LoRa mesh packet analyzer. Desktop-first, dark-mode-primary, dense information display for radio hobbyists.

Built with React 19, TypeScript, Tailwind CSS 4, TanStack Query, and TanStack Virtual.

## Deployment

Beacon Web ships as a container image, `ghcr.io/meshcore-beacon/beacon-web`, and is deployed
together with beacon-server. The compose files and walkthroughs are in
[beacon-docs](https://github.com/MeshCore-Beacon/beacon-docs): the
[all-in-one stack](https://github.com/MeshCore-Beacon/beacon-docs#deploy-the-all-in-one-stack)
or the [split deployment](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docker-deployment-type2/README.md).
The `VITE_*` variables the container reads are listed in
[Configuration](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docs/configuration.md#web-environment-variables).
Image tags and versioning are in
[Releases and versioning](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docs/releases.md).

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev                   # Vite dev server at http://localhost:5173
```

For live updates against a local beacon-server, uncomment these three lines in `.env.local`
before starting Vite. They route `/api` and `/ws` through the dev server so the WebSocket
arrives with the server's own origin, which beacon-server's same-origin check requires:

```
VITE_DEV_PROXY=http://localhost:8080
VITE_API_BASE=/api/v1
VITE_WS_URL=ws://localhost:5173/ws
```

Without them the page talks to `localhost:8080` directly and the WebSocket is refused. Running
the server itself is covered in the
[shared contributor guide](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/CONTRIBUTING.md#running-the-full-stack-locally).

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

## Documentation

- [API contract](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docs/api-contract.md): every REST, packet and WebSocket shape this app consumes
- [High level design](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docs/high-level-design.md)
- [Translations](docs/translations.md): adding a language
- [Contributing](CONTRIBUTING.md), and the [shared workflow](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/CONTRIBUTING.md) for branches, commits and releases

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors are welcome; please
also read the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue,
see [SECURITY.md](SECURITY.md).

## License

Licensed under the GNU Affero General Public License v3.0 or later
(AGPL-3.0-or-later). See [LICENSE](LICENSE) for the full text and
[CONTRIBUTORS.md](CONTRIBUTORS.md) for acknowledgements.
