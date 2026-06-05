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

export const EMPTY_FILTERS: PacketFilterState = {
  payloadTypes: [],
  routeTypes: [],
  observers: [],
  scopes: [],
  search: "",
  searchField: "hash",
};
