import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { Card, ChartCard, StatCard } from "./cards";
import { useChartColors } from "./chartTheme";
import { signalBinLabel, signalCoverageOption, signalHistogramOption, signalHours, signalTrendOption } from "./signal";
import { useSignalStats } from "./useSignalStats";
import type { StatsRange } from "./types";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");
const average = (value: number | null | undefined, unit = "") => value == null ? "—" : `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;

export function SignalTab({ range }: { range: StatsRange }) {
  const query = useSignalStats(range);
  const c = useChartColors();
  const loading = query.isPending || query.isPlaceholderData;
  const data = loading || query.isError ? undefined : query.data;
  const hours = useMemo(() => signalHours(data), [data]);
  const charts = useMemo(() => ({
    snr: signalHistogramOption(data?.snr, "SNR", "dB", c), rssi: signalHistogramOption(data?.rssi, "RSSI", "dBm", c),
    snrTrend: signalTrendOption(hours, "snr", c), rssiTrend: signalTrendOption(hours, "rssi", c), coverage: signalCoverageOption(data, c),
  }), [data, hours, c]);
  const state = { isLoading: loading, isError: query.isError };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-text-bright">RF / Signal</h2><p className="text-sm text-text-muted">The signal behind reported receptions.</p></div>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">Refresh signal</button>
      </div>
      {query.isError && <p role="alert" className="text-sm text-danger">Could not load signal data. Try refreshing or choosing a shorter time period.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reported receptions" value={data ? formatCount(data.receptions) : "—"} accent={c.primary} sublabel={range} />
        <StatCard label="Mean SNR" value={average(data?.snr.average, "dB")} accent={c.secondary} />
        <StatCard label="Mean RSSI" value={average(data?.rssi.average, "dBm")} accent={c.green} />
        <StatCard label="Hours with records" value={data ? `${data.hourly.length}/${hours.length}` : "—"} accent={c.warn} />
      </div>
      <p className="text-xs leading-relaxed text-text-muted">These readings describe the last hop into an observer, not end-to-end quality or packet loss. Counts are retained receptions, not unique packets. Missing readings and zero/zero unavailable pairs are excluded; a real zero SNR remains valid. Colors distinguish values, not good/bad thresholds.</p>
      {data && <p className="text-xs text-text-muted">Window: {utc(data.since)} to {utc(data.until)} UTC (end exclusive). Updates once a minute. Edge hours may be partial; blank hours do not establish an outage.</p>}
      <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="SNR distribution · dB" option={charts.snr} height={280} isEmpty={!data?.snr.samples} {...state} />
        <ChartCard title="RSSI distribution · dBm" option={charts.rssi} height={280} isEmpty={!data?.rssi.samples} {...state} />
        <ChartCard title="Hourly mean SNR · dB" option={charts.snrTrend} height={230} isEmpty={!data?.snr.samples} {...state} />
        <ChartCard title="Hourly mean RSSI · dBm" option={charts.rssiTrend} height={230} isEmpty={!data?.rssi.samples} {...state} />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
        <ChartCard title="Sample availability" option={charts.coverage} height={150} isEmpty={!data?.receptions} {...state} />
        <Card title="What the averages include">
          {!data ? <p className="py-4 text-sm text-text-muted">{query.isError ? "Data unavailable" : "Loading signal…"}</p> : !data.receptions ? <p className="py-4 text-sm text-text-muted">No retained receptions in this window.</p> : (
            <table aria-label="Signal sample availability" className="w-full text-left font-mono text-xs">
              <thead className="text-text-muted"><tr><th scope="col" className="py-2">Metric</th><th scope="col" className="text-right">Samples</th><th scope="col" className="text-right">Missing</th><th scope="col" className="text-right">Share</th></tr></thead>
              <tbody>{(["snr", "rssi"] as const).map((metric) => <tr key={metric} className="border-t border-border-subtle"><th scope="row" className="py-3 text-text-normal">{metric.toUpperCase()}</th><td className="text-right text-text-bright">{data[metric].samples.toLocaleString()}</td><td className="text-right text-text-muted">{(data.receptions - data[metric].samples).toLocaleString()}</td><td className="text-right text-text-muted">{(100 * data[metric].samples / data.receptions).toFixed(1)}%</td></tr>)}</tbody>
            </table>
          )}
          <p className="mt-3 text-xs leading-relaxed text-text-muted">Each mean weights every available reception equally. Missing includes absent, unavailable and invalid readings. SNR and RSSI can have different sample counts.</p>
        </Card>
      </div>
      {data && data.receptions > 0 && <details className="rounded-lg border border-border bg-bg-surface p-3.5">
        <summary className="cursor-pointer text-sm font-semibold text-text-normal">Exact histogram and hourly values</summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(["snr", "rssi"] as const).map((metric) => <table key={metric} aria-label={`${metric.toUpperCase()} histogram`} className="w-full text-left font-mono text-xs">
            <thead className="text-text-muted"><tr><th scope="col" className="py-2">{metric.toUpperCase()} · {metric === "snr" ? "dB" : "dBm"}</th><th scope="col" className="text-right">Samples</th></tr></thead>
            <tbody>{data[metric].histogram.map((bin, i) => <tr key={i} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal text-text-normal">{signalBinLabel(bin)}</th><td className="text-right text-text-bright">{bin.count.toLocaleString()}</td></tr>)}</tbody>
          </table>)}
        </div>
        <p className="my-3 text-xs text-text-muted">Bins include the lower bound and exclude the upper bound. The outer bins include all values beyond the display range. Hourly means below are rounded to one decimal place.</p>
        <div className="max-h-[340px] overflow-auto"><table aria-label="Hourly signal values" className="w-full min-w-[540px] text-left font-mono text-xs">
          <thead className="text-text-muted"><tr><th scope="col" className="py-2">UTC hour</th><th scope="col">Receptions</th><th scope="col">SNR samples</th><th scope="col">Mean dB</th><th scope="col">RSSI samples</th><th scope="col">Mean dBm</th></tr></thead>
          <tbody>{data.hourly.map((row) => <tr key={row.hour} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal text-text-normal">{utc(row.hour)}</th><td>{row.receptions.toLocaleString()}</td><td>{row.snrSamples.toLocaleString()}</td><td>{average(row.snrAverage)}</td><td>{row.rssiSamples.toLocaleString()}</td><td>{average(row.rssiAverage)}</td></tr>)}</tbody>
        </table></div>
      </details>}
    </div>
  );
}
