import { expect, it } from "vitest";
import { observerDestination, observerRange } from "../../../src/features/observers/observer-navigation";
it("normalizes legacy analytics links without losing region",()=>{
 const p=observerDestination(new URLSearchParams("tab=Analytics&statsTab=observer&observerId=abc&range=30d&iata=YOW"),"abc");
 expect(p.get("tab")).toBe("Observers");expect(p.get("observer")).toBe("abc");expect(p.get("range")).toBe("30d");expect(p.get("iata")).toBe("YOW");expect(p.has("observerId")).toBe(false);expect(p.has("statsTab")).toBe(false);
});
it("drops unrelated investigation selectors and bounds range",()=>{
 const p=observerDestination(new URLSearchParams("hash=abc&analyze=1&node=n&path=p"),"b");
 expect(p.toString()).toBe("tab=Observers&observer=b&range=7d");expect(observerRange("invalid")).toBe("7d");
});
