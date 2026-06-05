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
  CONTROL: 0x0b,
  CUSTOM: 0x0f,
} as const;

export type PayloadTypeValue = (typeof PayloadType)[keyof typeof PayloadType];

export const PAYLOAD_TYPE_NAMES: Record<PayloadTypeValue, string> = {
  [PayloadType.REQUEST]: "REQ",
  [PayloadType.RESPONSE]: "RESPONSE",
  [PayloadType.TEXT]: "TXT_MSG",
  [PayloadType.ACK]: "ACK",
  [PayloadType.ADVERT]: "ADVERT",
  [PayloadType.GROUP_TEXT]: "GRP_TXT",
  [PayloadType.GROUP_DATA]: "GRP_DATA",
  [PayloadType.ANON_REQ]: "ANON_REQ",
  [PayloadType.PATH]: "PATH",
  [PayloadType.TRACE]: "TRACE",
  [PayloadType.MULTI_PART]: "MULTI_PART",
  [PayloadType.CONTROL]: "CONTROL",
  [PayloadType.CUSTOM]: "CUSTOM",
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
  [RouteType.TRANSPORT_FLOOD]: "TRANSPORT_FLOOD",
  [RouteType.FLOOD]: "FLOOD",
  [RouteType.DIRECT]: "DIRECT",
  [RouteType.TRANSPORT_DIRECT]: "TRANSPORT_DIRECT",
};

export type PathConfidence = "high" | "ambiguous" | "none";
