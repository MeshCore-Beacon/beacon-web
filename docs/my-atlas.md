# My Atlas

Open **My Atlas** in the desktop tab row, or **More > My Atlas** on a phone. The
canonical URL is `?tab=MyAtlas`; this opens the visitor's own collection. It does
not publish someone else's saved nodes.

Expand **Add nodes** to search all regions by name or hexadecimal public-key prefix and add up to twelve
nodes. **Manage card** moves or removes a card. The selected nodes, their order
and the 24-hour/3-day activity window are stored in this browser on this origin
under `beacon-my-atlas-v1`. There is no account or cross-device synchronization.
Clearing site data removes the collection. When browser storage is unavailable,
the page explains that edits may only last for the current visit.

Cards use the current full node identity, not an ambiguous short path prefix.
Names refresh from the node record. If an old server ID disappears or points at
a different key, the page searches for the exact full key before loading reports.
An unavailable node stays in the collection and remains removable.

## Reading the cards

- **Received reports** are stored receptions of packets originating from the exact
  node key, after server deduplication. The page loads the latest 200 reports per
  node, then filters that sample to the selected rolling window. Counts are not
  a total of all node traffic. The card flags when more reports are available.
- Each bar covers one hour of the rolling window. Blank bars mean no reports in
  the loaded sample; they do not prove silence or packet loss. **Statistics &
  chart values** exposes the numeric hourly values and sample definition.
- **Mean SNR / RSSI** average finite, available measurements from that sample.
  The zero-RSSI/zero-SNR unavailable sentinel is excluded; a measured zero SNR
  with a real RSSI is included. These are last-hop measurements at the observers,
  not a measurement of the origin's radio health. Signal charts include numbers and
  accessible values; missing measurements display a dash.
- Freshness uses the server's `stale` verdict. It does not infer online/offline
  status from the report count or invent a local threshold.
- **Heard by** lazily opens the reporting observers for the latest loaded packet
  in the selected window. It is not lifetime reach or all observers of the node.
  Repeated reports from the same observer are grouped. Observer buttons open
  inspection; the packet action opens the exact packet and observed paths.
- **Open node** reuses Beacon's node inspection. Statistics also show existing
  neighbour count, radio settings, default scope and full public key.

## Cost and compatibility

The page is lazy-loaded and uses native SVG/CSS, without a new chart dependency.
No query runs for an empty collection before a valid search. Search is debounced,
limited to eight results and rejects invalid key input before issuing a request.
Each saved card normally makes two requests (node plus 200-report page) per
minute while the page is active and the document is visible. Error refreshes stop
until Retry or a later visit. A changed server ID can require two extra identity
requests. A single expanded Heard by panel uses the existing packet-detail cache.
Requests consume TanStack Query's abort signal when the page leaves.

No server schema, retention settings, MQTT behavior or authentication changes are
needed. Existing raw-retention limits still apply. Longer-lived analytics remain
separate. English and French labels ship together. Deployers can hide the page
with `VITE_DISABLED_TABS=MyAtlas`, following the existing tab configuration.

The focused tests cover persistence, corrupt/blocked storage, cross-tab changes,
exact-key recovery, rename display, bounded/lazy loading, missing signals,
expired evidence, range selection, order/removal and both languages. Release QA
also checks real Pi data, phone/desktop layout, keyboard controls, reload/Back,
and the matching public source offer.

This basic Atlas build uses packet observations only. It includes no battery, environmental or Collector telemetry integration. Dashed signal-chart segments indicate estimates across missing samples; empty hours are not measured zeroes.
