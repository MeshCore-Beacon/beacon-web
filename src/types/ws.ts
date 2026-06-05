import type { ChannelMessage } from "../features/channels/types";

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
      routeTypeName: string;
      isFirstObservation: boolean;
      observationCount: number;
      scope?: string; // matched transport scope name; omitted when none matched
    };
    observation: {
      observerId: string;
      observerName: string;
      iata: string;
      heardAt: number;
      rssi: number;
      snr: number;
      sourceBroker: string;
    };
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
    name: string;
    nodeType: number;
    iata: string;
    // integer microdegrees, same as REST /nodes — the server sends one value to both (microToDeg scales it)
    lat?: number;
    lng?: number;
  };
}

export interface WsChannelMessage {
  v: 1;
  type: "event";
  event: "channelMessage";
  data: ChannelMessage;
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
  | WsChannelMessage
  | WsLagged
  | WsError;

// client-sent subscription filter

export interface SubscriptionFilter {
  iatas?: string[];
  regionIds?: string[];
  payloadTypes?: number[];
  routeTypes?: number[];
  channelHashes?: string[];
  observerIds?: string[];
  events?: string[];
}
