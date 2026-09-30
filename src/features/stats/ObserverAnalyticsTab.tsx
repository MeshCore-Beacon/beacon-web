import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ObserverTab } from "./ObserverTab";
import { ObserverPicker } from "../observers/ObserverPicker";
import { ObserverSidebar } from "../observers/ObserverSidebar";
import { useObserver } from "./useTelemetry";
import { useTopObservers } from "./useStats";
import type { WsManager } from "../../api/ws-manager";
import type { StatsRange } from "./types";

interface Props {
  range: StatsRange;
  selectedObserverId: string | null;
  onSelectObserver: (id: string) => void;
  wsManager: WsManager;
}

export function ObserverAnalyticsTab({ range, selectedObserverId, onSelectObserver, wsManager }: Props) {
  const { t } = useTranslation();
  const top = useTopObservers(range, 15);
  const selected = useObserver(selectedObserverId, true);
  const selectedName = selected.data?.displayName ?? selectedObserverId?.slice(0, 8) ?? t("observerPage.choose");

  // default to the busiest observer once the list loads and nothing is selected
  useEffect(() => {
    if (selectedObserverId) return;
    const first = top.data?.[0];
    if (first) onSelectObserver(first.observerId);
  }, [selectedObserverId, top.data, onSelectObserver]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col lg:flex-row">
      <div className="px-4 pt-4 lg:hidden">
        <ObserverPicker id={selectedObserverId ?? ""} name={selectedName} label={t("tabs.Observers")} onSelect={onSelectObserver} />
      </div>
      <div className="hidden min-h-0 w-[260px] shrink-0 flex-col py-4 pl-4 lg:flex">
        <ObserverSidebar range={range} selectedId={selectedObserverId} onSelect={onSelectObserver} />
      </div>
      <div className="min-w-0 flex-1 lg:overflow-y-auto">
        <ObserverTab range={range} selectedObserverId={selectedObserverId} onSelectObserver={onSelectObserver} wsManager={wsManager} />
      </div>
    </div>
  );
}
