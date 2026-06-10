import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { useChartColors, type ChartColors } from "./chartTheme";
import { useStatsOverview, useStatsObservations, usePayloadBreakdown, useTopNodes, useTopObservers, useRadioPresets, useScopes } from "./useStats";
import { observationsAreaOption, leaderboardOption, typeBarOption, donutOption } from "./chartOptions";
import { Card, ChartCard, StatCard } from "./cards";
import { useLiveOverview } from "./useLiveStats";
import { aggregatePresets, formatPreset } from "./transforms";
import type { WsManager } from "../../api/ws-manager";
import type { ObservationPoint, StatsRange } from "./types";

// The observations endpoint returns one row per hour+iata; collapse to one row per hour (a no-op for a
// single selected region). uniquePackets / activeObservers summed across iatas are approximate.
function aggregateByHour(points: ObservationPoint[]) {
  const byHour = new Map<number, { hour: number; observationCount: number; uniquePackets: number; activeObservers: number }>();
  for (const p of points) {
    const cur = byHour.get(p.hour) ?? { hour: p.hour, observationCount: 0, uniquePackets: 0, activeObservers: 0 };
    cur.observationCount += p.observationCount;
    cur.uniquePackets += p.uniquePackets;
    cur.activeObservers += p.activeObservers;
    byHour.set(p.hour, cur);
  }
  return [...byHour.values()].sort((a, b) => a.hour - b.hour);
}

function nodeTypeColor(typeName: string, c: ChartColors): string {
  switch (typeName) {
    case "companion": return c.primary;
    case "repeater": return c.green;
    case "room_server": return c.secondary;
    case "sensor": return c.warn;
    default: return c.primaryDim;
  }
}

interface MeshTabProps {
  range: StatsRange;
  onSelectObserver: (observerId: string) => void;
  wsManager: WsManager;
}

export function MeshTab({ range, onSelectObserver, wsManager }: MeshTabProps) {
  const colors = useChartColors();
  useLiveOverview(wsManager);
  const overview = useStatsOverview();
  const observations = useStatsObservations(range);
  const payload = usePayloadBreakdown(range);
  const topNodes = useTopNodes(10);
  const topObservers = useTopObservers(range, 8);
  const radioPresets = useRadioPresets();
  const scopes = useScopes();

  const obs = useMemo(() => aggregateByHour(observations.data ?? []), [observations.data]);
  const obsOption = useMemo(() => observationsAreaOption(obs, colors), [obs, colors]);

  const nodeRows = useMemo(
    () =>
      (topNodes.data ?? []).map((n) => ({
        name: n.nodeName ?? n.nodeId.slice(0, 8),
        value: n.observationCount,
        color: nodeTypeColor(n.nodeTypeName, colors),
      })),
    [topNodes.data, colors],
  );
  const nodesOption = useMemo(() => leaderboardOption(nodeRows, colors), [nodeRows, colors]);

  const payloadItems = useMemo(
    () =>
      (payload.data ?? [])
        .map((p) => ({ name: p.payloadTypeName.toLowerCase(), value: p.count }))
        .sort((a, b) => b.value - a.value),
    [payload.data],
  );
  const payloadTotal = useMemo(() => payloadItems.reduce((a, p) => a + p.value, 0), [payloadItems]);
  const payloadOption = useMemo(() => typeBarOption(payloadItems, colors), [payloadItems, colors]);

  const observerRows = useMemo(
    () => (topObservers.data ?? []).map((o) => ({ name: o.displayName ?? o.observerId.slice(0, 8), value: o.observationCount, color: colors.secondary })),
    [topObservers.data, colors],
  );
  const observersOption = useMemo(() => leaderboardOption(observerRows, colors), [observerRows, colors]);
  const observerIds = useMemo(() => (topObservers.data ?? []).map((o) => o.observerId), [topObservers.data]);
  const observerEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const idx = (params as { dataIndex?: number }).dataIndex;
        if (idx != null && observerIds[idx]) onSelectObserver(observerIds[idx]);
      },
    }),
    [observerIds, onSelectObserver],
  );

  const nodeTypeData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of topNodes.data ?? []) counts.set(n.nodeTypeName, (counts.get(n.nodeTypeName) ?? 0) + 1);
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value, color: nodeTypeColor(name, colors) }))
      .sort((a, b) => b.value - a.value);
  }, [topNodes.data, colors]);
  const nodeTypeTotal = useMemo(() => nodeTypeData.reduce((a, d) => a + d.value, 0), [nodeTypeData]);
  // few categories, so a donut reads fine here — payload types stays a bar chart (10+ categories)
  const nodeTypeOption = useMemo(
    () => donutOption(nodeTypeData, colors, String(nodeTypeTotal), "NODES"),
    [nodeTypeData, nodeTypeTotal, colors],
  );

  const presetRows = useMemo(
    () => aggregatePresets(radioPresets.data ?? []).slice(0, 8).map((r) => ({ name: formatPreset(r.preset), value: r.value, color: colors.primary })),
    [radioPresets.data, colors],
  );
  const presetsOption = useMemo(() => leaderboardOption(presetRows, colors, 150), [presetRows, colors]);

  const scopeRows = useMemo(
    () => [...(scopes.data ?? [])].sort((a, b) => b.packetCount - a.packetCount),
    [scopes.data],
  );

  const obsSpark = useMemo(() => obs.slice(-24).map((p) => p.observationCount), [obs]);
  const observerSpark = useMemo(() => obs.slice(-24).map((p) => p.activeObservers), [obs]);

  const ov = overview.data;
  const kpiLoading = overview.isLoading;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-3.5 px-4 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total packets" sublabel="24h" accent="var(--color-primary)" value={kpiLoading ? "—" : formatCount(ov?.totalPackets)} />
        <StatCard label="Observations" sublabel="24h" accent="var(--color-green)" value={kpiLoading ? "—" : formatCount(ov?.totalObservations)} spark={obsSpark} />
        <StatCard label="Active observers" sublabel="24h" accent="var(--color-secondary)" value={kpiLoading ? "—" : (ov?.activeObservers ?? "—")} spark={observerSpark} />
        <StatCard label="Active IATAs" sublabel="24h" accent="var(--color-warn)" value={kpiLoading ? "—" : (ov?.activeIatas ?? "—")} />
      </div>

      <ChartCard
        title={<>Observations · {range}</>}
        height={200}
        option={obsOption}
        isLoading={observations.isLoading}
        isError={observations.isError}
        isEmpty={obs.length === 0}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="Top nodes" height={208} option={nodesOption} isLoading={topNodes.isLoading} isError={topNodes.isError} isEmpty={nodeRows.length === 0} />
        <ChartCard
          title={<>Payload types · {range}</>}
          right={<span className="font-mono text-[10px] text-text-muted">{formatCount(payloadTotal)} obs</span>}
          height={208}
          option={payloadOption}
          isLoading={payload.isLoading}
          isError={payload.isError}
          isEmpty={payloadItems.length === 0}
        />
        <ChartCard title={<>Top observers · {range}</>} height={208} option={observersOption} isLoading={topObservers.isLoading} isError={topObservers.isError} isEmpty={observerRows.length === 0} onEvents={observerEvents} />
        <ChartCard title="Node types · top" height={208} option={nodeTypeOption} isLoading={topNodes.isLoading} isError={topNodes.isError} isEmpty={nodeTypeData.length === 0} />
        <ChartCard title="Radio presets" height={208} option={presetsOption} isLoading={radioPresets.isLoading} isError={radioPresets.isError} isEmpty={presetRows.length === 0} />

        <Card title={<>Scopes · all regions</>}>
          {scopes.isError ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">Failed to load</div>
          ) : scopes.isLoading ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">Loading…</div>
          ) : scopeRows.length === 0 ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">No data</div>
          ) : (
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="text-text-muted">
                  <th className="pb-1.5 text-left font-semibold uppercase tracking-wider">Scope</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Packets</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Observers</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">Nodes</th>
                </tr>
              </thead>
              <tbody>
                {scopeRows.map((s) => (
                  <tr key={s.name} className="border-t border-border-subtle">
                    <td className="py-1 text-left text-text-normal">{s.name}</td>
                    <td className={`py-1 text-right tabular-nums ${s.packetCount === 0 ? "text-text-dim" : "text-text-bright"}`}>{formatCount(s.packetCount)}</td>
                    <td className={`py-1 text-right tabular-nums ${s.observerCount === 0 ? "text-text-dim" : "text-text-normal"}`}>{formatCount(s.observerCount)}</td>
                    <td className={`py-1 text-right tabular-nums ${s.nodeCount === 0 ? "text-text-dim" : "text-text-normal"}`}>{formatCount(s.nodeCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
