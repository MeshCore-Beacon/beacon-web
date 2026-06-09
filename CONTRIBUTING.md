# Contributing to Beacon Web

Thank you for your interest in contributing. Beacon is a focused project and we
want contributions to be high quality and sustainable. Please read this guide
before opening a PR.

---

## Before you start

**Open or comment on an issue before starting work.** This avoids duplicate
effort and lets maintainers flag if something is already in progress or out of
scope. For small bug fixes a brief comment is fine; for larger features please
discuss the approach first.

**One thing per PR.** Each pull request should cover one logical change — a bug
fix, a new component, a refactor, a new test. PRs that touch many unrelated
parts of the codebase are hard to review and hard to revert if something goes
wrong.

**No fully AI-generated contributions.** We welcome developers who use AI tools
to assist their work, but PRs should reflect the author's own understanding and
judgement. PRs that appear to be unreviewed AI output may be closed without
further comment.

---

## Branches

- `main` — stable releases only, protected. Never target this directly.
- `dev` — active development. All PRs target `dev`.

## Workflow

1. Fork or create a branch from `dev`
2. Make your changes
3. Run the checklist below
4. Open a pull request against `dev` with a clear description of what changed
   and why, referencing any related issues

---

## Getting set up

```bash
npm install
cp .env.example .env    # point VITE_API_BASE / VITE_WS_URL at a beacon-server
npm run dev             # Vite dev server at http://localhost:5173
```

beacon-web is the frontend for [beacon-server](https://github.com/MeshCore-Beacon/beacon-server),
which is the source of truth for every API, packet, and WebSocket shape.
Frontend types must mirror the server contract — read it before guessing a
payload shape.

---

## Checklist before opening a PR

```
npm run build    # the real typecheck (tsc -b && vite build) — must pass
npm run lint     # eslint — no errors
npm test         # vitest — all tests pass
```

Note: `npm run build` is the only real typecheck. `tsc --noEmit` is a no-op
because the root `tsconfig.json` has `files: []`.

---

## Code style

- TypeScript strict — no `any` escape hatches without good reason
- Follow the existing patterns in each feature before introducing new ones
- Reuse existing components, hooks, and theme tokens rather than adding new ones
- Keep components small and single-purpose
- Comments state the non-obvious *why* in one terse line; a wrong comment is
  worse than none
- See [.claude/CLAUDE.md](.claude/CLAUDE.md) for the full project conventions

---

## Tests

- **Practice TDD for bugfixes and features** — write the failing test first,
  watch it fail, then implement.
- Tests live in a top-level `tests/` tree that mirrors `src/` (e.g.
  `tests/lib/formatters.test.ts`, `tests/features/map/...`). Import source via
  relative `../../src/...` paths.
- Tooling is Vitest + jsdom + @testing-library/react; global setup is in
  `tests/setup.ts`.
- Run `npm test` before opening a PR. All tests must pass.
- If you are fixing a bug, add a test that would have caught it.

---

## Commit messages

Use the conventional commits format:

```
feat(map): frame selection via fitBounds over member airports
fix(packets): dedupe live and historical merge by packetHash
refactor(hooks): collapse useWsStatus into useWsHandlers
test(formatters): add coverage for coordinate display
chore: bump tanstack/react-query
docs: expand CONTRIBUTING.md
```

Scopes are optional but helpful. Common scopes mirror the feature folders:
`packets`, `nodes`, `observers`, `channels`, `map`, `stats`.

---

## Project structure

```
src/
  api/          — typed REST client and WebSocket manager (singleton)
  components/    — shared UI primitives (DataTable, DetailPanel, Badge, …)
  features/      — one folder per domain: packets, nodes, observers, channels,
                   map, stats — each with its components, types.ts, and hooks
  hooks/         — shared hooks (useRegion, useTheme, useWsHandlers, …)
  lib/           — constants, formatters, theme utilities
  types/         — REST shapes (api.ts), enums (enums.ts), WS union (ws.ts)
  App.tsx        — providers, routing, region watcher, WS init
  main.tsx       — entry point
```

Key patterns to understand before contributing:

- **Server state via TanStack Query**, with query keys scoped by region (e.g.
  `["packets", region]`). Changing region resets the cache and resubscribes.
- **Live + historical merge:** the WebSocket pushes into a capped live buffer;
  history comes from cursor-paginated `useInfiniteQuery`. A `useMemo` merges and
  dedupes by `packetHash`.
- **Filters are client-side**, applied in a `useMemo` over the cached region
  dataset — they are not part of the query key, so toggling is instant.
- **Payload rendering** switches on `parsedPayload.type` in
  `features/packets/payload-renderers.tsx`. When the server adds a payload type,
  add a matching renderer.

---

## Releases

Merges from `dev` to `main` are done by maintainers and represent a versioned
release. Do not open PRs directly against `main`.

## Recognition

If you'd like to be listed as a contributor, add yourself to
[CONTRIBUTORS.md](CONTRIBUTORS.md) in your PR.
