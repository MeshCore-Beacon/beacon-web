import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatCount } from "../../lib/formatters";
import { Card, ChartCard, StatCard } from "./cards";
import { useChartColors } from "./chartTheme";
import { signalBinLabel, signalCoverageOption, signalHistogramOption, signalHours, signalTrendOption } from "./signal";
import { useSignalStats } from "./useSignalStats";
import type { StatsRange } from "./types";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const average = (value: number | null | undefined, unit = "") => value == null ? "—" : `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;

export function SignalTab({ range }: { range: StatsRange }) {
  const { t } = useTranslation();
  const query = useSignalStats(range);
  const c = useChartColors();
  const loading = query.isPending || query.isPlaceholderData;
  const data = loading || query.isError ? undefined : query.data;
  const hours = useMemo(() => signalHours(data), [data]);
  const charts = useMemo(() => ({
    snr: signalHistogramOption(data?.snr, "SNR", "dB", c, t), rssi: signalHistogramOption(data?.rssi, "RSSI", "dBm", c, t),
    snrTrend: signalTrendOption(hours, "snr", c, t), rssiTrend: signalTrendOption(hours, "rssi", c, t), coverage: signalCoverageOption(data, c, t),
  }), [data, hours, c, t]);
  const state = { isLoading: loading, isError: query.isError };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-text-bright">{t("signal.title")}</h2><p className="text-sm text-text-muted">{t("signal.subtitle")}</p></div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">{t("signal.refresh")}</button>
      </div>
      {query.isError && <p role="alert" className="text-sm text-danger">{t("signal.error")}</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("signal.receptions")} value={data ? formatCount(data.receptions) : "—"} accent={c.primary} sublabel={t(`stats.ranges.${range}`)} />
        <StatCard label={t("signal.meanSnr")} value={<span className="whitespace-nowrap text-base sm:text-2xl">{average(data?.snr.average, "dB")}</span>} accent={c.secondary} />
        <StatCard label={t("signal.meanRssi")} value={<span className="whitespace-nowrap text-base sm:text-2xl">{average(data?.rssi.average, "dBm")}</span>} accent={c.green} />
        <StatCard label={t("signal.hoursWithRecords")} value={data ? `${data.hourly.length}/${hours.length}` : "—"} accent={c.warn} />
      </div>
      <p className="text-xs leading-relaxed text-text-muted">{t("signal.measurement")}</p>
      {data && <p className="text-xs text-text-muted">{t("signal.window", { since: utc(data.since), until: utc(data.until) })}</p>}
      <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={t("signal.histogramTitle", { metric: "SNR", unit: "dB" })} option={charts.snr} height={280} isEmpty={!data?.snr.samples} {...state} />
        <ChartCard title={t("signal.histogramTitle", { metric: "RSSI", unit: "dBm" })} option={charts.rssi} height={280} isEmpty={!data?.rssi.samples} {...state} />
        <ChartCard title={t("signal.meanTitle", { metric: "SNR", unit: "dB" })} option={charts.snrTrend} height={230} isEmpty={!data?.snr.samples} {...state} />
        <ChartCard title={t("signal.meanTitle", { metric: "RSSI", unit: "dBm" })} option={charts.rssiTrend} height={230} isEmpty={!data?.rssi.samples} {...state} />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title={t("signal.availability")} option={charts.coverage} height={150} isEmpty={!data?.receptions} {...state} />
        <Card title={t("signal.averagesTitle")}>
          {!data ? <p className="py-4 text-sm text-text-muted">{query.isError ? t("common.dataUnavailable") : t("signal.loading")}</p> : !data.receptions ? <p className="py-4 text-sm text-text-muted">{t("signal.empty")}</p> : (
            <div className="overflow-x-auto"><table aria-label={t("signal.availabilityTable")} className="w-full text-left font-mono text-xs">
              <thead className="text-[11px] text-text-muted sm:text-xs"><tr><th scope="col" className="py-2">{t("signal.metric")}</th><th scope="col" className="pl-2 text-right">{t("signal.samples")}</th><th scope="col" className="pl-2 text-right">{t("signal.missing")}</th><th scope="col" className="pl-2 text-right">{t("signal.share")}</th></tr></thead>
              <tbody>{(["snr", "rssi"] as const).map((metric) => <tr key={metric} className="border-t border-border-subtle"><th scope="row" className="py-3 text-text-normal">{metric.toUpperCase()}</th><td className="pl-2 text-right text-text-bright">{data[metric].samples.toLocaleString()}</td><td className="pl-2 text-right text-text-muted">{(data.receptions - data[metric].samples).toLocaleString()}</td><td className="pl-2 text-right text-text-muted">{(100 * data[metric].samples / data.receptions).toFixed(1)}%</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-text-muted">{t("signal.averagesHelp")}</p>
        </Card>
      </div>
      {data && data.receptions > 0 && <details className="rounded-lg border border-border bg-bg-surface p-3.5">
        <summary className="cursor-pointer text-sm font-semibold text-text-normal">{t("signal.details")}</summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["snr", "rssi"] as const).map((metric) => <table key={metric} aria-label={t("signal.histogramTable", { metric: metric.toUpperCase() })} className="w-full text-left font-mono text-xs">
            <thead className="text-text-muted"><tr><th scope="col" className="py-2">{metric.toUpperCase()} · {metric === "snr" ? "dB" : "dBm"}</th><th scope="col" className="text-right">{t("signal.samples")}</th></tr></thead>
            <tbody>{data[metric].histogram.map((bin, i) => <tr key={i} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal text-text-normal">{signalBinLabel(bin, t)}</th><td className="text-right text-text-bright">{bin.count.toLocaleString()}</td></tr>)}</tbody>
          </table>)}
        </div>
        <p className="my-3 text-xs text-text-muted">{t("signal.binsHelp")}</p>
        <div className="max-h-[340px] overflow-auto"><table aria-label={t("signal.hourlyTable")} className="w-full min-w-[540px] text-left font-mono text-xs">
          <thead className="text-text-muted"><tr><th scope="col" className="py-2">{t("signal.utcHour")}</th><th scope="col">{t("signal.receptionsColumn")}</th><th scope="col">{t("signal.metricSamples", { metric: "SNR" })}</th><th scope="col">{t("signal.meanUnit", { unit: "dB" })}</th><th scope="col">{t("signal.metricSamples", { metric: "RSSI" })}</th><th scope="col">{t("signal.meanUnit", { unit: "dBm" })}</th></tr></thead>
          <tbody>{data.hourly.map((row) => <tr key={row.hour} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal text-text-normal">{utc(row.hour)}</th><td>{row.receptions.toLocaleString()}</td><td>{row.snrSamples.toLocaleString()}</td><td>{average(row.snrAverage)}</td><td>{row.rssiSamples.toLocaleString()}</td><td>{average(row.rssiAverage)}</td></tr>)}</tbody>
        </table></div>
      </details>}
    </div>
  );
}
