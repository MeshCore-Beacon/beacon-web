import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getServerInfo } from "../api/client";
import { isBelowVersion } from "../lib/version";
import { BeaconLogo } from "./BeaconLogo";

// Blocks the app when the server needs a newer Beacon Web. Any failure to read /info lets it through.
export function VersionGate({ currentVersion = __APP_VERSION__ }: { currentVersion?: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["server-info"],
    queryFn: getServerInfo,
    retry: false,
    staleTime: 60_000, // also throttles the refetch on focus
    refetchOnWindowFocus: true,
  });

  const min = data?.minWebVersion;
  if (!isBelowVersion(currentVersion, min)) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="version-gate-message"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-bg-base px-4"
    >
      <div className="flex flex-col items-center gap-5 max-w-md text-center">
        <BeaconLogo size={64} className="text-primary" />
        <p id="version-gate-message" className="font-mono text-sm text-text-normal leading-relaxed">
          {t("versionGate.message", { min, current: currentVersion })}
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => window.location.reload()}
          className="h-8 text-xs font-mono px-4 rounded-sm border border-primary-dim bg-primary/6 text-primary hover:bg-primary/15 cursor-pointer transition-colors"
        >
          {t("versionGate.reload")}
        </button>
      </div>
    </div>
  );
}
