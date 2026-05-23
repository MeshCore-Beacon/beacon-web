import type { WsPacketObservation } from "../../types/ws";
import type { LiveRoutePulse, TowerMapState } from "./types";

const LIVE_PULSE_TTL_MS = 5200;

export function livePulsesFromPacketObservation(
  event: WsPacketObservation["data"],
  state: TowerMapState | undefined,
  now = Date.now(),
): LiveRoutePulse[] {
  if (!state) return [];
  const path = event.observation.resolvedPath ?? [];
  if (path.length < 2 || path.some((hop) => hop.confidence !== "high" || !hop.node)) {
    return [];
  }

  const pulses: LiveRoutePulse[] = [];
  for (let index = 0; index < path.length - 1; index++) {
    const from = path[index]?.node;
    const to = path[index + 1]?.node;
    if (!from || !to || !isMappableNode(from) || !isMappableNode(to)) continue;
    pulses.push({
      id: `${event.packetHash}-${event.observation.id}-${index}-${now}`,
      fromLat: from.latitude,
      fromLng: from.longitude,
      toLat: to.latitude,
      toLng: to.longitude,
      payloadTypeName: event.packet.payloadTypeName,
      heardAt: event.observation.heardAt,
      expiresAt: now + LIVE_PULSE_TTL_MS,
    });
  }
  return pulses;
}

function isMappableNode(node: { latitude: number | null; longitude: number | null }): node is { latitude: number; longitude: number } {
  return (
    typeof node.latitude === "number" &&
    typeof node.longitude === "number" &&
    Number.isFinite(node.latitude) &&
    Number.isFinite(node.longitude) &&
    node.latitude !== 0 &&
    node.longitude !== 0
  );
}
