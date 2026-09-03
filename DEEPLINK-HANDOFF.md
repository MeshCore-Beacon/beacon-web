# Packet deep link investigation — 2026-08-07

## Outcome: no bug in beacon-web

A packet deep link that "doesn't pop up" was traced to a hand-built URL missing the
`analyze=1` flag. The app behaves as designed and its own generated links are correct.

Reported URL (nothing opens):

    https://analyzer.meshmapper.net/?iata=YOW&hash=FBF4D4678D849833&tab=Packets

Same URL with the flag (analyzer opens, fully populated):

    https://analyzer.meshmapper.net/?iata=YOW&hash=FBF4D4678D849833&tab=Packets&analyze=1

## Why

`hash` alone is not "open this packet" — it's the *expanded row* selector, and the two
features are deliberately separate.

- `App.tsx:157` — `analyze=1` gates the analyzer drawer:
  `const analyzerHash = searchParams.get("analyze") === "1" ? searchParams.get("hash") : null;`
- `PacketList.tsx:80` — `hash` expands a row inline: `const expandedHash = searchParams.get("hash");`

Row expansion only works if that row is in the loaded list. The reported packet was ~7h old
and the list holds the live window (50 packets, minutes), so there was no row to expand and
nothing rendered.

Both existing comments already say this (`App.tsx:156`, `PacketList.tsx:79`).

## Links the app generates are fine

`PacketAnalyzerDrawer.tsx:75` sets the flag explicitly:

    <CopyLinkButton params={{ tab: "Packets", hash: detail.packetHash, analyze: "1" }} ... />

`App.tsx:191` does the same when the analyzer opens:

    if (hash) { n.set("hash", hash); n.set("analyze", "1"); n.delete("path"); }

So "Copy Link" always produces a working link. Only hand-written URLs can miss the flag.

## Verified

Against prod, with the fix from beacon-server#100 deployed:

- `GET /api/v1/packets/fbf4d4678d849833` → 200, 16 YOW observations
- Packet reachable at page 9 of the paginated YOW list
- Without `analyze=1`: list renders, no analyzer, no console errors, and one
  `/api/v1/packets/FBF4D4678D849833` request fires (`usePacketDetail(expandedHash)` at
  `PacketList.tsx:92`) whose result has no row to render into
- With `analyze=1`: analyzer opens — `FBF4D467 ADVERT ×16`, first/last 7h ago, all 16
  observations, raw packet, payload breakdown, `FITZZROY_ONE Repeater`

Note the "Search by hash..." box is a *different* feature bound to `q`, filtering the loaded
list client-side with no API call. It can't find packets outside the live window. Working as
designed, but easy to mistake for a broken search.

## Optional hardening (not a defect)

A `hash` with no matching loaded row silently does nothing and still spends a detail fetch.
Two small options, in preference order:

1. If `hash` is set on load and no row matches, open the analyzer instead of waiting for a row.
   Makes `?hash=` alone behave the way people expect from a shared link, and reuses the
   detail request already in flight.
2. Leave behaviour alone but surface the miss — a one-line "packet not in the live window"
   affordance with a button to open the analyzer.

Neither is required for correctness. Option 1 removes the whole class of report.

## Related

beacon-server#100 fixed a genuine backend bug found while chasing this: IATA-filtered packet
lists stopped paginating early, stranding older history. Real bug, separate cause — it was
never what broke this deep link.
