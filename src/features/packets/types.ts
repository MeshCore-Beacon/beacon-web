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

// Filters /packets history can apply server-side; each accepts multiple comma-separated values.
export interface PacketServerFilter {
  payloadTypes?: number[];
  routeTypes?: number[];
  scopes?: string[];
  hashPrefix?: string;
}

export const EMPTY_FILTERS: PacketFilterState = {
  payloadTypes: [],
  routeTypes: [],
  observers: [],
  scopes: [],
  search: "",
  searchField: "hash",
};
