export interface ScopeActivityHour { hour:number; receiverReports:number; uniqueSamples:number; repeatReports:number }
export interface ScopeActivityRow { name:string; receiverReports:number; uniqueSamples:number; repeatReports:number; activeRepeaters:number; receivingObservers:number; unresolvedHops:number; ambiguousHops:number; hourly:ScopeActivityHour[] }
export interface ScopeObserverActivity { observerId:string; name:string; iata:string; country:string; scope:string; reports:number; lastSeen:number }
export interface ScopeCountryActivity { country:string; scope:string; reports:number; uniqueSamples:number; observers:number }
export interface ScopeActivity { since:number; until:number; firstSeen?:number; lastSeen?:number; truncated:boolean; scopes:ScopeActivityRow[]; observers:ScopeObserverActivity[]; countries:ScopeCountryActivity[] }
