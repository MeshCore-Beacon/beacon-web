import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InfoTip } from "../../components/InfoTip";
import { EmptyState } from "../../components/EmptyState";
import { ACTION_BUTTON_CLASS } from "../../components/action-button";
import { formatRadioParts } from "../../lib/formatters";
import { ObserverComparison } from "../observers/ObserverComparison";
import { ObserverSummary } from "../observers/ObserverSummary";
import { useChartColors } from "./chartTheme";
import { activityParamsFor, useObserver, useObserverActivity, useObserverTelemetry } from "./useTelemetry";
import {
  airtimeOption,
  batteryOption,
  noiseFloorOption,
  queueOption,
  receiveErrorsOption,
  busyOption,
  heardOption,
  snrHeardOption,
  typeBarOption,
} from "./chartOptions";
import { Card, ChartCard } from "./cards";
import { fillActivity, hasTelemetry, intervalToMs, latestAirtimePct, payloadBarItems } from "./transforms";
import { useLiveObserver } from "./useLiveStats";
import { isNotFound } from "../../api/client";
import type { WsManager } from "../../api/ws-manager";
import { RANGE_MS, type StatsRange } from "./types";

function airtimeLabel(a: { rx: number | null; tx: number | null }): string {
  return [a.rx != null && `RX ${a.rx}%`, a.tx != null && `TX ${a.tx}%`].filter(Boolean).join(" · ");
}
interface ObserverTabProps {
  range: StatsRange;
  selectedObserverId: string | null;
  onSelectObserver: (id: string) => void;
  wsManager: WsManager;
  comparison?: { id: string; until: number | null; onSelect: (id: string) => void; onRefresh: () => number };
  // observer-level controls the host page puts on the header's name row
  actions?: ReactNode;
}
export function ObserverTab({ range, selectedObserverId, wsManager, comparison, actions }: ObserverTabProps) {
  const { t } = useTranslation();
  const colors = useChartColors();
  useLiveObserver(wsManager, selectedObserverId, range);
  const observer = useObserver(selectedObserverId, true);
  const telemetry = useObserverTelemetry(selectedObserverId, range);
  const activity = useObserverActivity(selectedObserverId, range, comparison?.until ?? undefined);
  const points = useMemo(() => telemetry.data?.points ?? [], [telemetry.data]);
  // Use the response interval so the plotted bucket width always matches the data.
  const bucketMs =
    telemetry.data != null && telemetry.data.interval !== "1h" ? intervalToMs(telemetry.data.interval) : null;
  const bucketed = bucketMs != null;
  const airtime = useMemo(() => airtimeOption(points, colors, bucketMs), [points, colors, bucketMs]);
  // Show the latest airtime percentage only when computed from unbucketed reports.
  const latestAirtime = useMemo(
    () => (bucketMs == null && hasTelemetry(points) ? latestAirtimePct(points, null) : { rx: null, tx: null }),
    [points, bucketMs],
  );
  const battery = useMemo(() => batteryOption(points, colors, t("observerPage.batteryV")), [points, colors, t]);
  const noise = useMemo(() => noiseFloorOption(points, colors, t("observerPage.noiseDbm")), [points, colors, t]);
  const queue = useMemo(() => queueOption(points, colors, t("observerPage.queue")), [points, colors, t]);
  const recvErrors = useMemo(
    () => receiveErrorsOption(points, colors, bucketed, t("observerPage.errors")),
    [points, colors, bucketed, t],
  );

  // Bots / MQTT bridges report status but no device telemetry — show one clear empty state rather
  // than five flat-zero charts. When some telemetry exists, gate each chart on its own metric.
  const ready = !telemetry.isLoading && !telemetry.isError;
  const noTelemetry = ready && !hasTelemetry(points);
  // a chart is empty when none of its metric(s) have a non-null value across the window
  const missing = (...accessors: ((p: (typeof points)[number]) => number | null)[]) =>
    ready && !points.some((p) => accessors.some((a) => a(p) != null));

  // A 404 without cached data means this server has no activity endpoint yet.
  const heardUnavailable = !activity.data && activity.isError && isNotFound(activity.error);
  const heardLoading = activity.isLoading;
  const heardData = activity.data;
  const intervalMs = heardData ? intervalToMs(heardData.interval) : null;
  // the window ends at the last fetch so the right edge follows now on every poll
  const heardWindow = useMemo(() => {
    const end = heardData?.windowEnd ?? activity.dataUpdatedAt;
    const span = (heardData && intervalToMs(heardData.range)) ?? RANGE_MS[range];
    return { start: heardData?.windowStart ?? end - span, end };
  }, [heardData, activity.dataUpdatedAt, range]);
  const heard = useMemo(
    () => (heardData && intervalMs ? fillActivity(heardData.points, intervalMs, heardWindow, heardData) : []),
    [heardData, intervalMs, heardWindow],
  );
  const busy = useMemo(
    () => busyOption(heard, colors, intervalMs, heardWindow, t("charts.busy")),
    [heard, colors, intervalMs, heardWindow, t],
  );
  const heardCount = useMemo(
    () => heardOption(heard, colors, heardWindow, t("observerPage.packets")),
    [heard, colors, heardWindow, t],
  );
  const snr = useMemo(
    () =>
      snrHeardOption(heard, colors, heardWindow, {
        average: t("observerPage.mean"),
        minimum: t("observerPage.minimum"),
      }),
    [heard, colors, heardWindow, t],
  );
  const payloadItems = useMemo(
    () =>
      payloadBarItems(heardData?.payloadTypes ?? []).map((item) =>
        item.name.toLowerCase() === "unknown" ? { ...item, name: t("observerPage.unknown") } : item,
      ),
    [heardData, t],
  );
  const payload = useMemo(() => typeBarOption(payloadItems, colors), [payloadItems, colors]);
  const nothingHeard = heardData != null && heardData.points.length === 0;
  const costed = heardData?.points.some((p) => p.airtimeMs != null) ?? false;
  const heardSnr = heard.some((p) => p.snrAvg != null);
  const radioLabel = formatRadioParts(heardData?.radio ?? {});
  const interval = heardData?.interval ?? activityParamsFor(range).interval;
  const perBucket =
    interval === "1h"
      ? t("observerPage.hour")
      : interval === "24h"
        ? t("observerPage.day")
        : interval.replace("m", " min").replace("h", " h");

  if (!selectedObserverId) return <EmptyState title={t("observerPage.choose")} />;
  if (observer.isError)
    return (
      <div className="p-4" role="alert">
        <p>{t("observerPage.loadFailed")}</p>
        <button className={ACTION_BUTTON_CLASS} onClick={() => void observer.refetch()}>
          {t("observerPage.retry")}
        </button>
      </div>
    );
  if (!observer.data)
    return (
      <p className="p-4" role="status">
        {t("observerPage.recording")}
      </p>
    );
  return (
    <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4">
      <ObserverSummary
        observer={observer.data}
        activity={heardData}
        points={points}
        pending={heardLoading || (!heardData && activity.isError)}
        actions={actions}
      />
      {comparison && <ObserverComparison observerA={observer.data} activityA={heardData} range={range} observerBId={comparison.id} until={comparison.until} onSelect={comparison.onSelect} onRefresh={() => {
        const nextUntil = comparison.onRefresh();
        void observer.refetch();
        void telemetry.refetch();
        if (nextUntil === comparison.until) void activity.refetch();
        return nextUntil;
      }} />}
      {heardUnavailable ? (
        <Card title={t("observerPage.records")}>
          <p className="text-sm text-text-muted">{t("observerPage.summaryMissing")}</p>
        </Card>
      ) : nothingHeard ? (
        <Card title={t("observerPage.records")}>
          <EmptyState title={t("observerPage.empty")} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard
              title={t("observerPage.activity", { interval: perBucket })}
              option={heardCount}
              height={235}
              isLoading={heardLoading}
              isError={!heardData && activity.isError}
            />
            <ChartCard
              title={t("observerPage.mix")}
              option={payload}
              height={235}
              isLoading={heardLoading}
              isError={!heardData && activity.isError}
              isEmpty={heardData != null && payloadItems.length === 0}
            />
            <ChartCard
              title={t("observerPage.signal")}
              option={snr}
              height={235}
              isLoading={heardLoading}
              isError={!heardData && activity.isError}
              isEmpty={heardData != null && !heardSnr}
            />
          </div>
          {activity.isError && (
            <button className={ACTION_BUTTON_CLASS} onClick={() => void activity.refetch()}>
              {t("observerPage.retry")}
            </button>
          )}
        </>
      )}
      <h2 className="mt-2 text-lg font-semibold text-text-bright">{t("observerPage.device")}</h2>
      {noTelemetry ? (
        <Card title={t("observerPage.noTelemetry")} right={<InfoTip text={t("observerPage.noTelemetryHelp")} />}>
          {null}
        </Card>
      ) : (
        <>
          <ChartCard
            title={`${t("observerPage.airtime")} · ${t(`stats.ranges.${range}`)}`}
            right={<span className="text-xs text-text-muted">{airtimeLabel(latestAirtime)}</span>}
            height={200}
            option={airtime}
            isLoading={telemetry.isLoading}
            isError={!telemetry.data && telemetry.isError}
            isEmpty={missing(
              (p) => p.airtimeTxSecs,
              (p) => p.airtimeRxSecs,
            )}
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title={t("observerPage.battery")}
              height={180}
              option={battery}
              isLoading={telemetry.isLoading}
              isError={!telemetry.data && telemetry.isError}
              isEmpty={missing((p) => p.batteryMv)}
            />
            <ChartCard
              title={t("observerPage.noise")}
              height={180}
              option={noise}
              isLoading={telemetry.isLoading}
              isError={!telemetry.data && telemetry.isError}
              isEmpty={missing((p) => p.noiseFloorDb)}
            />
            <ChartCard
              title={t("observerPage.queue")}
              height={180}
              option={queue}
              isLoading={telemetry.isLoading}
              isError={!telemetry.data && telemetry.isError}
              isEmpty={missing((p) => p.queueLength)}
            />
            <ChartCard
              title={t("observerPage.errors")}
              height={180}
              option={recvErrors}
              isLoading={telemetry.isLoading}
              isError={!telemetry.data && telemetry.isError}
              isEmpty={missing((p) => p.receiveErrors)}
            />
          </div>
          {telemetry.isError && (
            <button className={ACTION_BUTTON_CLASS} onClick={() => void telemetry.refetch()}>
              {t("observerPage.retry")}
            </button>
          )}
        </>
      )}
      {!heardUnavailable && costed && (
        <ChartCard
          title={`${t("observerPage.busy")} · ${t(`stats.ranges.${range}`)}`}
          right={<span className="text-xs text-text-muted">{radioLabel}</span>}
          height={180}
          option={busy}
          isLoading={heardLoading}
          isError={!heardData && activity.isError}
        />
      )}
    </section>
  );
}
