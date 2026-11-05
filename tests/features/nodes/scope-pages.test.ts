import { describe,it,expect } from "vitest";
import { matchesScope,nodeScopeStats } from "../../../src/features/nodes/scope-evidence";
import { scopeMapHref } from "../../../src/features/scopes/model";
import { observedPacketScope } from "../../../src/features/scopes/packet-scope";
import { scopeHistoryBuckets } from "../../../src/features/scopes/model";
import { parseMapView,buildMapParams } from "../../../src/features/map/map-url";

describe("scope evidence windows and sources",()=>{
  const node={defaultScope:"#advert",scopeEvidence:{since:0,until:24*3600000,scopes:[{name:"#ykf",repeatObservations:40,repeatObservations6h:10,repeatObservations1h:1},{name:"*",repeatObservations:10,repeatObservations6h:3,repeatObservations1h:2,reported:true},{name:"#configured",repeatObservations:0,reported:true}]}};
  it("selects observed winners independently of defaults and configured lists",()=>{
    expect(nodeScopeStats(node,24).repeatScope).toBe("#ykf");expect(nodeScopeStats(node,1).repeatScope).toBe("*");
    expect(matchesScope(node,"#configured","any",1)).toBe(true);expect(matchesScope(node,"#configured","repeated",1)).toBe(false);expect(matchesScope(node,"#advert","default",24)).toBe(true);
    expect(matchesScope({},"","none",24)).toBe(false);
  });
  it("round-trips scope URLs without private-name or wildcard corruption",()=>{
    for(const scope of ["*","?","#ON","$private/name&x=1"]){const href=scopeMapHref(scope,6,"?iata=YKF&nodePage=old");const view=parseMapView(new URLSearchParams(href.slice(1)));expect(view.scopeFocus).toBe(scope);expect(view.scopeHours).toBe(6);expect(view.scopeMode).toBe("isolate");expect(href).not.toContain("nodePage");}
    expect(buildMapParams({center:[0,0],zoom:3,clustered:true,nodeType:"",neighborLines:"off",styleId:"dark",flow:false,borders:false,scopeHours:1,scopeFocus:"#ykf",scopeMode:"highlight"}).scope_hours).toBe("1");
  });
  it("keeps missing graph buckets empty and unresolved transport distinct",()=>{
    const buckets=scopeHistoryBuckets([{name:"*",hour:3600000,reports:5,uniqueSamples:1,firstSeen:3600000,lastSeen:3600001}],0,6);expect(buckets[0]!.rows).toEqual([]);expect(buckets[1]!.rows[0]!.reports).toBe(5);
    expect(observedPacketScope({routeType:0})).toBe("?");expect(observedPacketScope({routeType:1})).toBe("*");expect(observedPacketScope({})).toBe("");expect(observedPacketScope({scope:"#Exact"})).toBe("#Exact");
  });
});
