import { useQuery } from "@tanstack/react-query";
import { getServerInfo } from "../api/client";
import type { DistanceUnit, TemperatureUnit } from "../lib/units";

export interface Features {
  polling: boolean;
  accounts: "off" | "local" | "portal";
  registration: boolean;
  telemetryRequests: boolean;
  alerts: boolean;
  atlasTelemetry: boolean;
  mapTelemetry: boolean;
  alertDelivery: "push" | "email" | undefined;
  portalUrl?: string;
}

const OFF: Features = { polling: false, accounts: "off", registration: false, telemetryRequests: false, alerts: false, atlasTelemetry: false, mapTelemetry: false, alertDelivery: undefined };

// Shares VersionGate's /info query. Until it loads, on an older server, or on a failure, every feature reads as off.
function useInfo() {
  return useQuery({
    queryKey: ["server-info"],
    queryFn: () => getServerInfo(),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

// True only until /info first settles, so a view can tell "not loaded yet" from "accounts off".
export function useFeaturesLoading(): boolean {
  return useInfo().isPending;
}

export function useFeatures(): Features {
  const f = useInfo().data?.features;
  if (!f) return OFF;
  return {
    polling: f.polling === true,
    accounts: f.accounts === "local" || f.accounts === "portal" ? f.accounts : "off",
    registration: f.registration === true,
    telemetryRequests: f.telemetryRequests === true,
    alerts: f.alerts === true,
    atlasTelemetry: f.atlasTelemetry === true,
    mapTelemetry: f.mapTelemetry === true,
    alertDelivery: f.alertDelivery === "push" || f.alertDelivery === "email" ? f.alertDelivery : undefined,
    portalUrl: typeof f.portalUrl === "string" && f.portalUrl !== "" ? f.portalUrl : undefined,
  };
}

// The instance's display units from /info; Celsius and metric when absent or unrecognised.
export function useDisplayUnits(): { temperature: TemperatureUnit; distance: DistanceUnit } {
  const d = useInfo().data?.display;
  return {
    temperature: d?.temperatureUnit === "f" ? "f" : "c",
    distance: d?.distanceUnit === "imperial" ? "imperial" : "metric",
  };
}
