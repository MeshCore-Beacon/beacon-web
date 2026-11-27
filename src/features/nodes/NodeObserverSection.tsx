import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FoldSection, Section } from "../../components/DetailPanel";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { ObserverAdvertList } from "../observers/ObserverAdverts";
import { ObserverSummary } from "../observers/ObserverSummary";
import { ChartCard } from "../stats/cards";
import { airtimeOption, batteryOption, noiseFloorOption } from "../stats/chartOptions";
import { useChartColors } from "../stats/chartTheme";
import { Segmented } from "../stats/Segmented";
import { hasTelemetry, intervalToMs } from "../stats/transforms";
import type { StatsRange } from "../stats/types";
import { useObserver, useObserverActivity, useObserverTelemetry } from "../stats/useTelemetry";

const CHART_HEIGHT = 130;
const RANGES: StatsRange[] = ["24h", "7d", "30d"];

// Lazy chunk: the node panel's Observer view, mounted only while that view is open so nothing loads before.
export default function NodeObserverSection({ observerId, onOpenDashboard, onAnalyzePacket }: {
  observerId: string;
  onOpenDashboard: () => void;
  onAnalyzePacket?: (hash: string, observationId?: number) => void;
}) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const [range, setRange] = useState<StatsRange>("7d");
  const observer = useObserver(observerId, true);
  const telemetry = useObserverTelemetry(observerId, range);
  const activity = useObserverActivity(observerId, range);
  const points = useMemo(() => telemetry.data?.points ?? [], [telemetry.data]);
  // Same bucket handling as the dashboard: hourly points are plotted unbucketed.
  const bucketMs = telemetry.data != null && telemetry.data.interval !== "1h" ? intervalToMs(telemetry.data.interval) : null;
  const airtime = useMemo(() => airtimeOption(points, colors, bucketMs), [points, colors, bucketMs]);
  const battery = useMemo(() => batteryOption(points, colors, t("observerPage.batteryV")), [points, colors, t]);
  const noise = useMemo(() => noiseFloorOption(points, colors, t("observerPage.noiseDbm")), [points, colors, t]);
  const ready = !telemetry.isLoading && !telemetry.isError;
  const missing = (...read: ((p: (typeof points)[number]) => number | null)[]) => ready && !points.some((p) => read.some((r) => r(p) != null));
  const chartState = { height: CHART_HEIGHT, isLoading: telemetry.isLoading, isError: !telemetry.data && telemetry.isError };

  const dashboard = (
    <div className="border-t border-border-subtle px-3 py-2.5">
      <button type="button" onClick={onOpenDashboard} className={`${ACTION_BUTTON_CLASS} w-full text-center`}>{t("nodeDetail.observer.openDashboard")}</button>
    </div>
  );

  if (observer.isError && !observer.data) {
    return <>
      <div role="alert" className="space-y-1 px-3 py-2.5 font-mono text-[13px] text-danger">
        <p>{t("nodeDetail.observer.loadFailed")}</p>
        <button type="button" disabled={observer.isFetching} className={ACTION_BUTTON_CLASS} onClick={() => void observer.refetch()}>{t("nodeDetail.retry")}</button>
      </div>
      {dashboard}
    </>;
  }
  if (!observer.data) return <p role="status" className="px-3 py-2.5 font-mono text-[13px] text-text-dim">{t("common.loading")}</p>;

  return <>
    <div className="flex flex-col gap-2 px-3 pb-2.5">
      <ObserverSummary compact observer={observer.data} activity={activity.data} points={points} pending={activity.isLoading || (!activity.data && activity.isError)} />
    </div>
    <Section title={t("nodeDetail.observer.device")}>
      <Segmented
        size="xs"
        ariaLabel={t("nodeDetail.observer.range")}
        value={range}
        onChange={(v) => setRange(v as StatsRange)}
        options={RANGES.map((r) => ({ value: r, label: t(`stats.ranges.${r}`) }))}
      />
      {ready && !hasTelemetry(points) ? (
        <p className="mt-2 font-mono text-[13px] text-text-dim">{t("observerPage.noTelemetry")}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <ChartCard title={t("observerPage.battery")} option={battery} {...chartState} isEmpty={missing((p) => p.batteryMv)} />
          <ChartCard title={t("observerPage.noise")} option={noise} {...chartState} isEmpty={missing((p) => p.noiseFloorDb)} />
          <ChartCard title={t("observerPage.airtime")} option={airtime} {...chartState} isEmpty={missing((p) => p.airtimeTxSecs, (p) => p.airtimeRxSecs)} />
        </div>
      )}
    </Section>
    <FoldSection id="node-observer-adverts" title={t("observerPage.advertsHeard")}>
      <ObserverAdvertList observerId={observerId} onAnalyzePacket={(hash, id) => onAnalyzePacket?.(hash, id)} />
    </FoldSection>
    {dashboard}
  </>;
}
