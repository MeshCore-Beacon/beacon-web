// MeshCore packet payload types (header bits 2-5)

export const PayloadType = {
  REQUEST: 0x00,
  RESPONSE: 0x01,
  TEXT: 0x02,
  ACK: 0x03,
  ADVERT: 0x04,
  GROUP_TEXT: 0x05,
  GROUP_DATA: 0x06,
  ANON_REQ: 0x07,
  PATH: 0x08,
  TRACE: 0x09,
  MULTI_PART: 0x0a,
  CUSTOM: 0x0f,
} as const;

export type PayloadTypeValue = (typeof PayloadType)[keyof typeof PayloadType];

export const PAYLOAD_TYPE_NAMES: Record<PayloadTypeValue, string> = {
  [PayloadType.REQUEST]: "Request",
  [PayloadType.RESPONSE]: "Response",
  [PayloadType.TEXT]: "Text",
  [PayloadType.ACK]: "Ack",
  [PayloadType.ADVERT]: "Advert",
  [PayloadType.GROUP_TEXT]: "Group",
  [PayloadType.GROUP_DATA]: "GroupData",
  [PayloadType.ANON_REQ]: "AnonReq",
  [PayloadType.PATH]: "Path",
  [PayloadType.TRACE]: "Trace",
  [PayloadType.MULTI_PART]: "MultiPart",
  [PayloadType.CUSTOM]: "Custom",
};

// routing modes (header bits 1-0) and path confidence

export const RouteType = {
  TRANSPORT_FLOOD: 0,
  FLOOD: 1,
  DIRECT: 2,
  TRANSPORT_DIRECT: 3,
} as const;

export type RouteTypeValue = (typeof RouteType)[keyof typeof RouteType];

export const ROUTE_TYPE_NAMES: Record<RouteTypeValue, string> = {
  [RouteType.TRANSPORT_FLOOD]: "Flood Transport",
  [RouteType.FLOOD]: "Flood",
  [RouteType.DIRECT]: "Direct",
  [RouteType.TRANSPORT_DIRECT]: "Direct Transport",
};

export type PathConfidence = "high" | "ambiguous" | "none";
