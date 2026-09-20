// Beacon preserves explicit 0/0 advert resets in the data. They are unlocated
// radio nodes, not markers at Null Island. Either axis alone may validly be zero.
// This is a node-location rule, not a restriction on map camera coordinates.
export function hasMapLocation(
  node: { lat?: number | null; lng?: number | null } | null | undefined,
): node is { lat: number; lng: number } {
  return node?.lat != null && node.lng != null
    && Number.isFinite(node.lat) && Number.isFinite(node.lng)
    && Math.abs(node.lat) <= 90 && Math.abs(node.lng) <= 180
    && (node.lat !== 0 || node.lng !== 0);
}
