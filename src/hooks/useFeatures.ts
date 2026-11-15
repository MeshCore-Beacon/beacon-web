import { useQuery } from "@tanstack/react-query";
import { getServerInfo } from "../api/client";

export interface Features {
  polling: boolean;
  accounts: "off" | "local" | "portal";
  registration: boolean;
  telemetryRequests: boolean;
  alerts: boolean;
}

const OFF: Features = { polling: false, accounts: "off", registration: false, telemetryRequests: false, alerts: false };

// Shares VersionGate's /info query. Until it loads, on an older server, or on a failure, every feature reads as off.
export function useFeatures(): Features {
  const { data } = useQuery({
    queryKey: ["server-info"],
    queryFn: getServerInfo,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const f = data?.features;
  if (!f) return OFF;
  return {
    polling: f.polling === true,
    accounts: f.accounts === "local" || f.accounts === "portal" ? f.accounts : "off",
    // client.ts is off limits for this change, so ServerInfo does not list the flag
    registration: (f as { registration?: unknown }).registration === true,
    telemetryRequests: f.telemetryRequests === true,
    alerts: f.alerts === true,
  };
}
