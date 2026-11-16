# Development audit fixes — November 2026

This candidate starts at upstream dev `b0c2f83`. The page set and native telemetry
are upstream's. The former preview Topology, scope extensions and independent
collector controls are excluded.

[Full audit and rollout plan](https://github.com/MeshCore-Beacon/beacon-docs/blob/codex/audit-docs-20261116/docs/audit-20261116.md)

- Preserve legacy My Atlas cards and links across the Atlas rename. A current
  stored Atlas, including an intentionally empty one, takes priority. Account
  ownership and conflict handling remain upstream's.
- Limit live-map GeoJSON submissions to at most 30 per second per source,
  independent of a monitor's refresh rate. Hop positions and fades use elapsed
  time, and existing flow limits remain. This bounds worker submissions, not a
  guarantee of 30 rendered frames per second on every device.
- Combine chart resize notifications into one animation-frame callback and cancel
  it before destroying the chart.
- Label suspect/ambiguous TRACE evidence, preserve an explicit reveal option, and
  draw only consumed trace hops. The analyzer displays original SNR bytes instead
  of mistaking requested hashes for the wire path. No collision is claimed as proven.
- Copy route investigation links with their precise time window and complete hash
  representation so later route updates cannot silently change the evidence.

The deployed source archive and build manifest identify the exact preview. Feature
proposals remain separate from this fix set. Browser checks and test-run evidence
are recorded in the shared audit, including any untested physical devices.
