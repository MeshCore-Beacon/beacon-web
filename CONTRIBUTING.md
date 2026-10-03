# Contributing to Beacon Web

Thank you for your interest in contributing. Beacon is a focused project and we
want contributions to be high quality and sustainable. Please read this guide
before opening a PR.

---

## Workflow

Branches, the pull request flow, commit message format and the release process are the same
for every Beacon repo and live in
[beacon-docs/CONTRIBUTING.md](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/CONTRIBUTING.md).
In short: open or comment on an issue first, branch from `dev`, keep each PR to one change,
write conventional commit messages, and open the PR against `dev`. Running this app against a
local beacon-server is described there too.

Before opening a PR here:

```
npm run build    # the real typecheck (tsc -b && vite build); must pass
npm run lint     # eslint; no errors
npm test         # vitest; all tests pass
```

`npm run build` is the only real typecheck. `tsc --noEmit` is a no-op because the root
`tsconfig.json` has `files: []`.

---

## Getting set up

```bash
npm install
cp .env.example .env    # point VITE_API_BASE / VITE_WS_URL at a beacon-server
npm run dev             # Vite dev server at http://localhost:5173
```

beacon-web is the frontend for [beacon-server](https://github.com/MeshCore-Beacon/beacon-server),
which is the source of truth for every API, packet, and WebSocket shape.
Frontend types must mirror the server contract; read it before guessing a
payload shape.

---

## Code style

- TypeScript strict; no `any` escape hatches without good reason
- Follow the existing patterns in each feature before introducing new ones
- Reuse existing components, hooks, and theme tokens rather than adding new ones
- Keep components small and single-purpose
- Comments state the non-obvious *why* in one terse line; a wrong comment is
  worse than none

---

## Tests

For UI text, follow the [translation guide](docs/translations.md). Add English
catalog keys and translate display labels without changing route/data identifiers.

- **Practice TDD for bugfixes and features**: write the failing test first,
  watch it fail, then implement.
- Tests live in a top-level `tests/` tree that mirrors `src/` (e.g.
  `tests/lib/formatters.test.ts`, `tests/features/map/...`). Import source via
  relative `../../src/...` paths.
- Tooling is Vitest + jsdom + @testing-library/react; global setup is in
  `tests/setup.ts`.
- Run `npm test` before opening a PR. All tests must pass.
- If you are fixing a bug, add a test that would have caught it.

---

## Project structure

```
src/
  api/            typed REST client and WebSocket manager (singleton)
  components/      shared UI primitives (DataTable, DetailPanel, Badge, …)
  features/        one folder per domain (packets, nodes, observers, channels,
                   map, routes, traces, stats), each with its components,
                   types.ts, and hooks
  hooks/           shared hooks (useRegion, useTheme, useWsHandlers, …)
  i18n/            i18next setup and locale catalogs
  lib/             constants, formatters, theme utilities
  types/           REST shapes (api.ts), enums (enums.ts), WS union (ws.ts)
  App.tsx          providers, routing, region watcher, WS init
  main.tsx         entry point
```

Key patterns to understand before contributing:

- **Server state via TanStack Query**, with query keys scoped by region (e.g.
  `["packets", region]`). Changing region resets the cache and resubscribes.
- **Live + historical merge:** the WebSocket pushes into a capped live buffer;
  history comes from cursor-paginated `useInfiniteQuery`. A `useMemo` merges and
  dedupes by `packetHash`.
- **Packet filters:** payload-type, route-type and scope filters go to the
  server and into the query key, so paging covers the full filtered history.
  The observer filter and hash/path search stay client-side in a `useMemo`.
- **Payload rendering** switches on `parsedPayload.type` in
  `features/packets/payload-renderers.tsx`. When the server adds a payload type,
  add a matching renderer.

---

## Releases

The flow is in
[Releases and versioning](https://github.com/MeshCore-Beacon/beacon-docs/blob/main/docs/releases.md#cutting-a-release).
The web-specific step is bumping `version` in `package.json`.

---

## Recognition

If you'd like to be listed as a contributor, add yourself to
[CONTRIBUTORS.md](CONTRIBUTORS.md) in your PR.
