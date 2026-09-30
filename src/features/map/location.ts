// 0/0 is an advert reset, not Null Island; a single zero axis is still a valid location.
export function hasMapLocation(
  node: { lat?: number | null; lng?: number | null } | null | undefined,
): node is { lat: number; lng: number } {
  return node?.lat != null && node.lng != null
    && Number.isFinite(node.lat) && Number.isFinite(node.lng)
    && Math.abs(node.lat) <= 90 && Math.abs(node.lng) <= 180
    && (node.lat !== 0 || node.lng !== 0);
}
