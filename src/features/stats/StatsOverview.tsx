import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { WsManager } from "../../api/ws-manager";
import { StatsSubHeader } from "./StatsSubHeader";
import { MeshTab } from "./MeshTab";
import { TalkersTab } from "./TalkersTab";
import { ObserverTab } from "./ObserverTab";
import { NeighbourGraphTab } from "./NeighbourGraphTab";
import type { StatsRange, StatsTab } from "./types";

const TABS: StatsTab[] = ["mesh", "talkers", "observer", "graph"];
const RANGES: StatsRange[] = ["24h", "7d", "30d"];

const asTab = (v: string | null): StatsTab => (TABS.includes(v as StatsTab) ? (v as StatsTab) : "mesh");
const asRange = (v: string | null): StatsRange => (RANGES.includes(v as StatsRange) ? (v as StatsRange) : "7d");

interface StatsOverviewProps {
  wsManager: WsManager;
}

// Stats page shell: a sub-header bar (Mesh / Observer pills + range) over the active
// sub-tab. Sub-tab, range, and selected observer live in the URL (?statsTab/?range/?observerId) so the
// view is shareable; replace:true keeps it out of history. Queries are cached, so switching is instant.
export function StatsOverview({ wsManager }: StatsOverviewProps) {
  const [params, setParams] = useSearchParams();
  const tab = asTab(params.get("statsTab"));
  const range = asRange(params.get("range"));
  const observerId = params.get("observerId");

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
  const handleSelectObserver = useCallback((id: string) => patch({ statsTab: "observer", observerId: id }), [patch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StatsSubHeader tab={tab} onTabChange={handleTab} range={range} onRangeChange={handleRange} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "mesh" && <MeshTab range={range} onSelectObserver={handleSelectObserver} wsManager={wsManager} />}
        {tab === "talkers" && <TalkersTab range={range} />}
        {tab === "observer" && (
          <ObserverTab range={range} selectedObserverId={observerId} onSelectObserver={handleSelectObserver} wsManager={wsManager} />
        )}
        {tab === "graph" && <NeighbourGraphTab />}
      </div>
    </div>
  );
}
