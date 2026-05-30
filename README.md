# BEACON Web

Real-time LoRa mesh packet analyzer. Desktop-first, dark-mode-primary, dense information display for radio hobbyists.

Built with React 19, TypeScript, Tailwind CSS 4, TanStack Query, and TanStack Virtual.

## Deployment

### 1. Copy the `docker/` folder to your server

```bash
scp -r docker/ user@your-server:/opt/docker/beacon-web
```

### 2. Create a `.env` file

```bash
cd /opt/docker/beacon-web
cat > .env << 'EOF'
DOMAIN=dev.meshcore.ca
VITE_API_BASE=https://dev.meshcore.ca/api/v1
VITE_WS_URL=wss://dev.meshcore.ca/ws
EOF
```

| Variable | Description |
|---|---|
| `DOMAIN` | Domain for HTTPS (Caddy auto-provisions Let's Encrypt certs) |
| `VITE_API_BASE` | Backend REST API base URL |
| `VITE_WS_URL` | Backend WebSocket URL |

### 3. Authenticate with GitHub Container Registry

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Use a Personal Access Token (classic) with `read:packages` scope as the password. You only need to do this once.

### 4. Start the services

```bash
docker compose up -d
```

Caddy will automatically obtain a TLS certificate for your domain. Ensure DNS is pointed at your server before starting.

## Local Development

```bash
npm install
cp .env.example .env    # edit with your backend URLs
npm run dev             # starts Vite dev server at http://localhost:5173
```

### Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npx vitest run` | Run tests |
| `npx tsc --noEmit` | Type-check without emitting |

## Project Structure

```
docker/
  docker-compose.yml      # production deployment compose file
  Caddyfile               # internal Caddy config (static file serving)
  Caddyfile.proxy         # reverse proxy config (HTTPS termination)
  docker-entrypoint.sh    # runtime env var injection
Dockerfile                # multi-stage build (Node + Caddy)
src/
  api/
    client.ts             # typed REST client (fetch wrapper)
    ws-manager.ts         # WebSocket connection, reconnect, subscription management
  components/             # shared UI components
  features/               # feature modules (packets, nodes, channels, map, stats)
  hooks/                  # React hooks (region, theme, WebSocket)
  lib/                    # constants, formatters, theme utilities
  types/                  # TypeScript types and enums
  App.tsx                 # providers + routing + WS init
  main.tsx                # entry point
  index.css               # Tailwind setup, theme tokens, animations
```

## Architecture

- **Region-driven**: All data queries and WS subscriptions are scoped to an IATA region code. Changing region resets the cache and resubscribes.
- **Live + historical merge**: WebSocket pushes live packets into a `LivePacketStore` buffer (capped at 500). Historical data comes from cursor-paginated REST via `useInfiniteQuery` (max 20 pages). Both are merged and deduped at render time.
- **Client-side filtering**: Filters are not part of the query key. The cache holds all packets for the current region; filters are applied via `useMemo`. Toggling a filter is instant with no refetch.
- **Reconnect with jitter**: Exponential backoff with +/-25% random jitter prevents thundering herd on server bounce.

## License

See repository root.
