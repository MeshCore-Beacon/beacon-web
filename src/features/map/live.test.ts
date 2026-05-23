import { describe, expect, it } from "vitest";
import { livePulsesFromPacketObservation } from "./live";
import type { TowerMapState } from "./types";
import type { WsPacketObservation } from "../../types/ws";

describe("live map pulse adapter", () => {
  it("requires every hop to resolve with high confidence", () => {
    const event = packetEvent("ambiguous");

    expect(livePulsesFromPacketObservation(event, state()).length).toBe(0);
  });

  it("creates live segments for ordered high-confidence hops", () => {
    const event = packetEvent("high");

    const pulses = livePulsesFromPacketObservation(event, state(), 10_000);

    expect(pulses).toHaveLength(1);
    expect(pulses[0]).toMatchObject({
      fromLat: 45,
      fromLng: -75,
      toLat: 46,
      toLng: -76,
      payloadTypeName: "Advert",
    });
  });
});

function packetEvent(confidence: "high" | "ambiguous"): WsPacketObservation["data"] {
  return {
    packetHash: "abc",
    packet: {
      payloadType: 4,
      payloadTypeName: "Advert",
      routeType: 1,
      isFirstObservation: true,
      totalObservationCount: 1,
      summary: "advert",
    },
    observation: {
      id: 1,
      observerId: "observer",
      observerName: "Observer",
      iata: "YOW",
      heardAt: 1_000,
      pathLengthByte: 2,
      hashSize: 1,
      hopCount: 2,
      pathBytes: "aabb",
      rawPacket: "00",
      rssi: null,
      snr: null,
      propagationTimeMs: null,
      radio: null,
      sourceBroker: "mqtt1",
      resolvedPath: [
        {
          confidence: "high",
          node: { id: "a", name: "A", publicKey: "", latitude: 45, longitude: -75 },
        },
        {
          confidence,
          node: { id: "b", name: "B", publicKey: "", latitude: 46, longitude: -76 },
        },
      ],
    },
  };
}

function state(): TowerMapState {
  return {
    serverTime: 1,
    scope: { iatas: ["YOW"] },
    metadata: {
      basemap: "openfreemap",
      routesComplete: false,
      routesStatus: "blocked_by_ordered_path_confidence",
      liveDefaultEnabled: false,
    },
    nodes: [],
    observers: [],
    routes: [],
    activitySummary: {
      packets24h: 0,
      observations24h: 0,
      activeObservers24h: 0,
      activeIatas24h: 0,
      lastHeardAt: null,
    },
  };
}
