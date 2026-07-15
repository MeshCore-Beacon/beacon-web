import type { PayloadTypeValue, RouteTypeValue } from "../../types/enums";

export type SearchField = "hash" | "path" | "payload";

export interface PacketFilterState {
  payloadTypes: PayloadTypeValue[];
  routeTypes: RouteTypeValue[];
  observers: string[];
  scopes: string[]; // transport scope names, e.g. "#bc"
  search: string;
  searchField: SearchField;
}

// Filters /packets history can apply server-side (each accepts a single value per request)
export interface PacketServerFilter {
  payloadType?: number;
  routeType?: number;
  scope?: string;
}

export const EMPTY_FILTERS: PacketFilterState = {
  payloadTypes: [],
  routeTypes: [],
  observers: [],
  scopes: [],
  search: "",
  searchField: "hash",
};
