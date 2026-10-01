import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { WsManager } from "../../api/ws-manager";
import { StatsSubHeader } from "./StatsSubHeader";
import { SectionInfoSlot } from "./section-info-slot";
import { MeshTab } from "./MeshTab";
import { TrafficTab } from "./TrafficTab";
import { SignalTab } from "./SignalTab";
import { PathsTab } from "./PathsTab";
import { ScopesTab } from "./ScopesTab";
import { TalkersTab } from "./TalkersTab";
import { ClockDriftTab } from "./ClockDriftTab";
import { CompareObserversTab } from "./CompareObserversTab";
import { NeighbourGraphTab } from "./NeighbourGraphTab";
import { observerDestination } from "../observers/observer-navigation";
import type { StatsRange, StatsTab } from "./types";

const TABS: StatsTab[] = ["mesh", "traffic", "signal", "paths", "scopes", "talkers", "clockdrift", "compare", "graph"];
const RANGES: StatsRange[] = ["24h", "7d", "30d"];

const asTab = (v: string | null): StatsTab => (TABS.includes(v as StatsTab) ? (v as StatsTab) : "mesh");
const asRange = (v: string | null): StatsRange => (RANGES.includes(v as StatsRange) ? (v as StatsRange) : "7d");

interface StatsOverviewProps {
  wsManager: WsManager;
  onViewNode?: (nodeId: string) => void;
}

// Stats page shell: an analytics sub-header and range over the active sub-tab. Sub-tab and range live
// in the URL (?statsTab/?range) so the view is shareable.
export function StatsOverview({ wsManager, onViewNode }: StatsOverviewProps) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = asTab(params.get("statsTab"));
  const range = asRange(params.get("range"));
  const legacyObserver = params.get("statsTab") === "observer";
  const [infoSlot, setInfoSlot] = useState<HTMLElement | null>(null);

  const patch = useCallback(
    (updates: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v == null) next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const handleTab = useCallback((t: StatsTab) => patch({ statsTab: t }), [patch]);
  const handleRange = useCallback((r: StatsRange) => patch({ range: r }), [patch]);
  const handleSelectObserver = useCallback((id: string) => navigate({ search: "?" + observerDestination(params, id, range).toString() }), [navigate, params, range]);

  // The observer dashboard moved to the Observers tab; old ?statsTab=observer links land there.
  useEffect(() => {
    if (legacyObserver) navigate({ search: "?" + observerDestination(params, params.get("observerId"), range).toString() }, { replace: true });
  }, [legacyObserver, navigate, params, range]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <StatsSubHeader tab={tab} onTabChange={handleTab} range={range} onRangeChange={handleRange} infoSlot={setInfoSlot} />
      <SectionInfoSlot.Provider value={infoSlot}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "mesh" && <MeshTab range={range} onSelectObserver={handleSelectObserver} wsManager={wsManager} />}
        {tab === "traffic" && <TrafficTab range={range} />}
        {tab === "signal" && <SignalTab range={range} />}
        {tab === "paths" && <PathsTab range={range} />}
        {tab === "scopes" && <ScopesTab />}
        {tab === "talkers" && <TalkersTab range={range} onViewNode={onViewNode} />}
        {tab === "clockdrift" && <ClockDriftTab />}
        {tab === "graph" && <NeighbourGraphTab />}
        {tab === "compare" && <CompareObserversTab />}
      </div>
      </SectionInfoSlot.Provider>
    </div>
  );
}
