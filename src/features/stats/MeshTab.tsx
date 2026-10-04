import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { formatCount, formatUtc } from "../../lib/formatters";
import { useChartColors, nodeTypeColor } from "./chartTheme";
import { useStatsSeries, usePayloadBreakdown, useTopNodes, useTopObservers, useRadioPresets, useScopes, useNodeTypes } from "./useStats";
import { observationsAreaOption, leaderboardOption, typeBarOption, donutOption, presetBarsOption } from "./chartOptions";
import { ChartCard, StatCard } from "./cards";
import { aggregatePresets, formatPreset, payloadBarItems } from "./transforms";
import type { StatsRange, StatsSeries, SeriesValues } from "./types";

// Keep unavailable values in the cache, but do not display them under the current filters.
function readyData<T>(query: { data: T | undefined; isSuccess: boolean; isPlaceholderData: boolean }) {
  return query.isSuccess && !query.isPlaceholderData ? query.data : undefined;
}

// Missing and partial hours carry no values; keep their slot as null so the sparkline shows a gap.
function spark(series: StatsSeries | undefined, pick: (v: SeriesValues) => number) {
  return series?.hours.map((h) => (h.values ? pick(h.values) : null));
}

interface MeshTabProps {
  range: StatsRange;
  onSelectObserver: (observerId: string) => void;
}

export function MeshTab({ range, onSelectObserver }: MeshTabProps) {
  const { t } = useTranslation();
  const rangeLabel = t(`stats.ranges.${range}`);
  const colors = useChartColors();
  const series = useStatsSeries("24h");
  const observations = useStatsSeries(range);
  const payload = usePayloadBreakdown(range);
  const topNodes = useTopNodes(range, 10);
  const topObservers = useTopObservers(range, 8);
  const radioPresets = useRadioPresets();
  const scopes = useScopes(range);
  const nodeTypes = useNodeTypes();

  const ov = readyData(series);
  const observationsData = readyData(observations);
  const payloadData = readyData(payload);
  const topNodesData = readyData(topNodes);
  const topObserversData = readyData(topObservers);
  const radioPresetsData = readyData(radioPresets);
  const scopesData = readyData(scopes);
  const nodeTypesData = readyData(nodeTypes);

  const obs = useMemo(
    () => (observationsData?.hours ?? []).map((h) => ({ hour: h.hour, observations: h.values?.observations ?? null, uniquePackets: h.values?.uniquePackets ?? null })),
    [observationsData],
  );
  const obsOption = useMemo(
    () => observationsAreaOption(obs, colors, { observations: t("mesh.observations"), uniquePackets: t("charts.uniquePackets") }),
    [obs, colors, t],
  );

  const nodeRows = useMemo(
    () =>
      (topNodesData ?? []).map((n) => ({
        name: n.nodeName ?? n.publicKey.slice(0, 8),
        value: n.observationCount,
        color: nodeTypeColor(n.nodeTypeName, colors),
      })),
    [topNodesData, colors],
  );
  const nodesOption = useMemo(() => leaderboardOption(nodeRows, colors), [nodeRows, colors]);

  const payloadItems = useMemo(() => payloadBarItems(payloadData ?? []), [payloadData]);
  const payloadTotal = useMemo(() => payloadItems.reduce((a, p) => a + p.value, 0), [payloadItems]);
  const payloadOption = useMemo(() => typeBarOption(payloadItems, colors), [payloadItems, colors]);

  const observerRows = useMemo(
    () => (topObserversData ?? []).map((o) => ({ name: o.displayName ?? o.observerId.slice(0, 8), value: o.observationCount, color: colors.primary })),
    [topObserversData, colors],
  );
  const observersOption = useMemo(() => leaderboardOption(observerRows, colors), [observerRows, colors]);
  const observerIds = useMemo(() => (topObserversData ?? []).map((o) => o.observerId), [topObserversData]);
  const observerEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const idx = (params as { dataIndex?: number }).dataIndex;
        if (idx != null && observerIds[idx]) onSelectObserver(observerIds[idx]);
      },
    }),
    [observerIds, onSelectObserver],
  );

  const typeRows = useMemo(
    () =>
      [...(nodeTypesData ?? [])]
        .sort((a, b) => b.count - a.count)
        .map((t) => ({ name: t.nodeTypeName, value: t.count, color: nodeTypeColor(t.nodeTypeName, colors) })),
    [nodeTypesData, colors],
  );
  const typeTotal = useMemo(() => typeRows.reduce((a, t) => a + t.value, 0), [typeRows]);
  const typesOption = useMemo(() => donutOption(typeRows, colors, formatCount(typeTotal), t("mesh.nodesCenter")), [typeRows, colors, typeTotal, t]);

  const presetRows = useMemo(
    () => aggregatePresets(radioPresetsData ?? []).slice(0, 8).map((r) => ({ name: formatPreset(r.preset), nodes: r.nodes, observers: r.observers })),
    [radioPresetsData],
  );
  const presetsOption = useMemo(
    () => presetBarsOption(presetRows, colors, undefined, { nodes: t("mesh.nodes"), observers: t("mesh.observers") }),
    [presetRows, colors, t],
  );

  const scopeRows = useMemo(
    () => [...(scopesData ?? [])].sort((a, b) => b.packetCount - a.packetCount),
    [scopesData],
  );

  const sparks = useMemo(() => ({
    packets: spark(ov, (v) => v.uniquePackets),
    observations: spark(ov, (v) => v.observations),
    observers: spark(ov, (v) => v.activeObservers),
    iatas: spark(ov, (v) => v.activeIatas),
  }), [ov]);

  // with no complete hours the summary is all zeros, which would read as a dead mesh
  const kpis = ov?.completeHours ? ov.summary : undefined;
  // top-row KPIs are the last 24 rollable hours, so they lag the clock by 35–95 min; range only drives the charts below
  const ovWindow = ov
    ? t("mesh.lastHoursTo", { hours: Math.round((ov.until - ov.since) / 3_600_000), time: formatUtc(ov.until, { timeOnly: true }) })
    : t("mesh.lastHours", { hours: 24 });

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t("mesh.totalPackets")} sublabel={ovWindow} accent={colors.series[0]!} value={formatCount(kpis?.uniquePackets)} spark={sparks.packets} />
        <StatCard label={t("mesh.observations")} sublabel={ovWindow} accent={colors.series[1]!} value={formatCount(kpis?.observations)} spark={sparks.observations} />
        <StatCard label={t("mesh.activeObservers")} sublabel={ovWindow} accent={colors.series[2]!} value={kpis?.activeObservers ?? "—"} spark={sparks.observers} />
        <StatCard label={t("mesh.activeIatas")} sublabel={ovWindow} accent={colors.series[3]!} value={kpis?.activeIatas ?? "—"} spark={sparks.iatas} />
      </div>

      <ChartCard
        title={t("mesh.observationsTitle", { range: rangeLabel })}
        height={200}
        option={obsOption}
        isLoading={observations.isPending || observations.isPlaceholderData}
        isError={observations.isError}
        isEmpty={!observationsData?.completeHours}
      />

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* range-driven charts lead the grid; the all-time ones follow below */}
        <div className="min-w-0">
          <ChartCard title={t("mesh.topObservers", { range: rangeLabel })} height={208} option={observersOption} isLoading={topObservers.isPending || topObservers.isPlaceholderData} isError={topObservers.isError} isEmpty={observerRows.length === 0} onEvents={observerEvents} />
        </div>
        <ChartCard
          title={t("mesh.payloadTypes", { range: rangeLabel })}
          right={<span className="font-mono text-[10px] text-text-muted">{t("mesh.obs", { value: formatCount(payloadData === undefined ? undefined : payloadTotal) })}</span>}
          height={208}
          option={payloadOption}
          isLoading={payload.isPending || payload.isPlaceholderData}
          isError={payload.isError}
          isEmpty={payloadItems.length === 0}
        />
        <ChartCard title={t("mesh.topNodes", { range: rangeLabel })} height={208} option={nodesOption} isLoading={topNodes.isPending || topNodes.isPlaceholderData} isError={topNodes.isError} isEmpty={nodeRows.length === 0} />
        <ChartCard title={t("mesh.nodeTypes")} height={208} option={typesOption} isLoading={nodeTypes.isPending || nodeTypes.isPlaceholderData} isError={nodeTypes.isError} isEmpty={typeRows.length === 0} />
        <ChartCard title={t("mesh.radioPresets")} height={208} option={presetsOption} isLoading={radioPresets.isPending || radioPresets.isPlaceholderData} isError={radioPresets.isError} isEmpty={presetRows.length === 0} />

        <details className="self-start rounded-lg border border-border bg-bg-surface p-3.5">
          <summary className="cursor-pointer font-mono text-[11px] font-semibold uppercase tracking-wider text-text-normal">{t("stats.tabs.scopes")}</summary>
          <div className="mt-3 max-h-96 overflow-auto">
          {scopes.isError ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">{t("common.loadFailed")}</div>
          ) : scopes.isPending || scopes.isLoading || scopes.isPlaceholderData ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">{t("common.loading")}</div>
          ) : scopeRows.length === 0 ? (
            <div className="py-4 text-center font-mono text-[11px] text-text-dim">{t("common.noData")}</div>
          ) : (
            <table className="w-full font-mono text-[11px]">
              <thead>
                <tr className="text-text-muted">
                  <th className="pb-1.5 text-left font-semibold uppercase tracking-wider">{t("mesh.scope")}</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">{t("mesh.packets")}</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">{t("mesh.observers")}</th>
                  <th className="pb-1.5 text-right font-semibold uppercase tracking-wider">{t("mesh.nodes")}</th>
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
        </div>
        </details>
      </div>
    </div>
  );
}
