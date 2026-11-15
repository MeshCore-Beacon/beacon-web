import { useQuery } from "@tanstack/react-query";
import { getServerInfo } from "../api/client";

export interface Features {
  polling: boolean;
  accounts: "off" | "local" | "portal";
  registration: boolean;
  telemetryRequests: boolean;
  alerts: boolean;
  portalUrl?: string;
}

const OFF: Features = { polling: false, accounts: "off", registration: false, telemetryRequests: false, alerts: false };

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
    portalUrl: typeof f.portalUrl === "string" && f.portalUrl !== "" ? f.portalUrl : undefined,
  };
}
