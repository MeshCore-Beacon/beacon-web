# MeshCore Tower Web

Real-time LoRa mesh packet analyzer. Desktop-first, dark-mode-primary, dense information display for radio hobbyists.

Built with React 19, TypeScript, Tailwind CSS 4, TanStack Query, and TanStack Virtual.

## Quick Start (Docker)

Pull the pre-built image and run:

```yaml
# docker-compose.yml
services:
  tower-web:
    image: ghcr.io/meshcore-tower/tower-web:latest
    ports:
      - "3000:80"
    environment:
      - VITE_API_BASE=http://your-backend:8080/api/v1
      - VITE_WS_URL=ws://your-backend:8080/ws
    restart: unless-stopped
```

```bash
docker compose up -d
```

The app is available at `http://localhost:3000`.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE` | `http://localhost:8080/api/v1` | Backend REST API base URL |
| `VITE_WS_URL` | `ws://localhost:8080/ws` | Backend WebSocket URL |

These are injected at container startup, so the same image works for any environment.

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

## Building the Docker Image Locally

```bash
docker compose up --build
```

This builds from source using the multi-stage Dockerfile (Node for build, Caddy for serving) and starts the app on port 3000.

## Project Structure

```
src/
  api/
    client.ts                # typed REST client (fetch wrapper)
    ws-manager.ts            # WebSocket connection, reconnect, subscription management
  components/
    AppShell.tsx              # header, tab bar, region selector, status bar
    Badge.tsx                 # reusable badge with variant styling
    badge-utils.ts            # badge variant mapping for payload types
    Dropdown.tsx              # generic dropdown with click-outside dismiss
    FilterBar.tsx             # pill-based filter bar
    HopBadge.tsx              # path hop with confidence-based styling
    MultiSelectDropdown.tsx   # checkbox dropdown with optional search
    SearchBar.tsx             # debounced search input with field selector
  features/
    channels/
      ChannelList.tsx         # placeholder
      types.ts                # Channel, ChannelMessage types
    map/
      MapView.tsx             # placeholder
      types.ts                # MapObserver, PacketArc types
    nodes/
      NodeTable.tsx           # placeholder
      types.ts                # Node type
    observers/
      ObserverTable.tsx       # placeholder
      types.ts                # Observer type
    packets/
      PacketList.tsx           # orchestrator: filters + virtual list + catch-up banner
      PacketRow.tsx            # expandable packet row with lazy detail loading
      PacketVirtualList.tsx    # TanStack Virtual wrapper with ARIA
      PacketAnalyzerDrawer.tsx # collapsible side panel with hex dump and payload breakdown
      ObservationCard.tsx      # observation display with path hop resolution
      packet-structure.tsx     # hex dump coloring, bit breakdowns, field accents
      payload-renderers.tsx    # per-payload-type renderers (advert, trace, text, etc.)
      types.ts                 # PacketFilterState, SearchField
      usePackets.ts            # live buffer + infinite query merge
      usePacketFilters.ts      # URL-synced filter state
    stats/
      StatsOverview.tsx       # placeholder
      types.ts                # PacketVolume, ObserverCoverage types
  hooks/
    useClickOutside.ts        # click-outside dismiss hook
    useRegion.tsx              # region context (IATA code)
    useTheme.tsx               # theme loading, persistence, CSS var injection
    useWsHandlers.ts           # per-component WS event handlers
    useWsStatus.ts             # reactive WS connection state
  lib/
    constants.ts              # env vars, buffer caps, WS timing
    formatters.ts             # hex, timestamps, SNR formatting
    themes.ts                 # theme loading and CSS var injection
  types/
    api.ts                    # REST response types
    ws.ts                     # WebSocket message types
    enums.ts                  # PayloadType, RouteType, PathConfidence
  App.tsx                     # providers + routing + WS init
  main.tsx                    # entry point
  index.css                   # Tailwind setup, theme tokens, animations
```

## Architecture

- **Region-driven**: All data queries and WS subscriptions are scoped to an IATA region code. Changing region resets the cache and resubscribes.
- **Live + historical merge**: WebSocket pushes live packets into a `LivePacketStore` buffer (capped at 500). Historical data comes from cursor-paginated REST via `useInfiniteQuery` (max 20 pages). Both are merged and deduped at render time.
- **Client-side filtering**: Filters are not part of the query key. The cache holds all packets for the current region; filters are applied via `useMemo`. Toggling a filter is instant with no refetch.
- **Reconnect with jitter**: Exponential backoff with +/-25% random jitter prevents thundering herd on server bounce.

## License

See repository root.
