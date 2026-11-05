import { RouteType } from "../../types/enums";

// Name matching, unscoped wire routes and unresolved transport names are distinct.
// Missing capture metadata is not converted into an unscoped claim.
export function observedPacketScope(packet: {scope?:string;routeType?:number}) {
  if(packet.scope) return packet.scope;
  if(packet.routeType===RouteType.TRANSPORT_FLOOD||packet.routeType===RouteType.TRANSPORT_DIRECT)return "?";
  if(packet.routeType===RouteType.FLOOD||packet.routeType===RouteType.DIRECT)return "*";
  return "";
}
