import type { Observation } from "./api";

// individual server-sent message shapes

export interface WsHello {
  v: 1;
  type: "hello";
  serverTime: number;
  connectionId: string;
}

export interface WsSubscribed {
  v: 1;
  type: "subscribed";
  id: string;
  subscriptionId: string;
}

export interface WsUnsubscribed {
  v: 1;
  type: "unsubscribed";
  id: string;
}

export interface WsPong {
  v: 1;
  type: "pong";
  id: string;
}

export interface WsPacketObservation {
  v: 1;
  type: "event";
  event: "packetObservation";
  data: {
    packetHash: string;
    packet: {
      payloadType: number;
      payloadTypeName: string;
      routeType: number;
      isFirstObservation: boolean;
      totalObservationCount: number;
      summary: string;
    };
    observation: Observation;
  };
}

export interface WsObserverStatus {
  v: 1;
  type: "event";
  event: "observerStatus";
  data: {
    observerId: string;
    displayName: string;
    iata: string;
    online: boolean;
    batteryMv: number | null;
    uptimeSeconds: number | null;
    lastStatusAt: number;
    fields: string[];
  };
}

export interface WsNodeUpdate {
  v: 1;
  type: "event";
  event: "nodeUpdate";
  data: {
    nodeId: string;
    publicKey: string;
    name: string | null;
    supportsMultibytePaths: boolean;
    supportsMultibyteTraces: boolean;
    minFirmwareVersion: string | null;
    iatasHeardIn: string[];
    reason: "advertRefresh" | "capabilityUpgraded" | "newIataHeard";
  };
}

export interface WsLagged {
  v: 1;
  type: "lagged";
  droppedCount: number;
  since: number;
  lastObservationId: number;
}

export interface WsError {
  v: 1;
  type: "error";
  code: string;
  message: string;
}

// discriminated union of all server messages

export type WsServerMessage =
  | WsHello
  | WsSubscribed
  | WsUnsubscribed
  | WsPong
  | WsPacketObservation
  | WsObserverStatus
  | WsNodeUpdate
  | WsLagged
  | WsError;

// client-sent subscription filter

export interface SubscriptionFilter {
  iatas?: string[];
  regionIds?: string[];
  payloadTypes?: number[];
  routeTypes?: string[];
  channelHashes?: string[];
  observerIds?: string[];
  events?: string[];
}
