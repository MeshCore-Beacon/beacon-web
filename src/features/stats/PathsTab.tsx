import { useMemo } from "react";
import { formatCount } from "../../lib/formatters";
import { Card, ChartCard, StatCard } from "./cards";
import { donutOption } from "./chartOptions";
import { tooltipStyle, useChartColors } from "./chartTheme";
import { pathHours, pathLengthOption, pathTrendOption } from "./paths";
import { usePathStats } from "./usePathStats";
import type { StatsRange } from "./types";

const utc = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ");

export function PathsTab({ range }: { range: StatsRange }) {
  const query = usePathStats(range), c = useChartColors();
  const loading = query.isPending || query.isPlaceholderData;
  const data = loading || query.isError ? undefined : query.data;
  const hours = useMemo(() => pathHours(data), [data]);
  const categories = useMemo(() => [
    { name: "Hash paths", value: data?.hashed ?? 0, color: c.primary },
    { name: "Empty", value: data?.empty ?? 0, color: c.textDim },
    { name: "Trace", value: data?.trace ?? 0, color: c.warn },
    { name: "Unclassified", value: data?.unclassified ?? 0, color: c.secondary },
  ], [data, c]);
  const charts = useMemo(() => {
    const width = donutOption((data?.hashWidths ?? []).map((bin, i) => ({ name: `${bin.bytes}-byte`, value: bin.receptions, color: c.series[i] })), c, formatCount(data?.hashed ?? 0), "HASH PATHS");
    const coverage = donutOption(categories, c, formatCount(data?.receptions ?? 0), "RECEPTIONS");
    return {
      width: { ...width, tooltip: { trigger: "item" as const, renderMode: "richText" as const, formatter: "{b}: {c} ({d}%)", ...tooltipStyle(c) }, aria: { enabled: true, label: { description: "Hash-width share among nonempty ordinary paths. Empty, trace and unclassified records are excluded. Exact counts follow below." } } },
      coverage: { ...coverage, tooltip: { trigger: "item" as const, renderMode: "richText" as const, formatter: "{b}: {c} ({d}%)", ...tooltipStyle(c) }, aria: { enabled: true, label: { description: "Path classification for all retained receptions. The four categories partition the total; exact counts follow alongside." } } },
      lengths: pathLengthOption(data?.pathLengths ?? [], c), trend: pathTrendOption(hours, c),
    };
  }, [data, c, categories, hours]);
  const state = { isLoading: loading, isError: query.isError };
  const multi = data?.hashWidths.filter((bin) => bin.bytes > 1).reduce((n, bin) => n + bin.receptions, 0) ?? 0;
  const largest = data?.pathLengths.at(-1)?.entries;

  return <div className="mx-auto flex w-full min-w-0 max-w-[1200px] flex-col gap-3.5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold text-text-bright">Paths &amp; Hashes</h2><p className="text-sm text-text-muted">How received packets carry route hashes.</p></div>
      <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching || query.isPending} className="rounded border border-border px-3 py-1.5 text-xs text-text-normal hover:bg-bg-raised disabled:opacity-50">Refresh paths</button>
    </div>
    {query.isError && <p role="alert" className="text-sm text-danger">Could not load path data. Try refreshing or choosing a shorter time period.</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Reported receptions" value={data ? formatCount(data.receptions) : "—"} accent={c.primary} sublabel={range} />
      <StatCard label="With hash paths" value={data ? formatCount(data.hashed) : "—"} accent={c.green} />
      <StatCard label="Multi-byte share" value={data?.hashed ? `${(100 * multi / data.hashed).toFixed(1)}%` : "—"} accent={c.secondary} />
      <StatCard label="Most path entries" value={largest ?? "—"} accent={c.warn} />
    </div>
    <p className="text-xs leading-relaxed text-text-muted">Path entries reported by observers, counted per reception. Hash-width shares use nonempty hash paths.</p>
    {data && <p className="text-xs text-text-muted">Window: {utc(data.since)} to {utc(data.until)} UTC (end exclusive). Complete-hour snapshots refresh in the background; the current hour is excluded. Blank hours lack retained records.</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
      <ChartCard title="Observed hash widths" option={charts.width} height={260} isEmpty={!data?.hashed} {...state} />
      <ChartCard title="Received path entries" option={charts.lengths} height={260} isEmpty={!data || data.hashed + data.empty === 0} {...state} />
    </div>
    <ChartCard title="Hash-path receptions over time" option={charts.trend} height={260} isEmpty={!data?.hashed} {...state} />
    <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
      <ChartCard title="Path format coverage" option={charts.coverage} height={260} isEmpty={!data?.receptions} {...state} />
      <Card title="What the counts include">
        {!data ? <p className="py-4 text-sm text-text-muted">{query.isError ? "Data unavailable" : "Loading paths…"}</p> : !data.receptions ? <p className="py-4 text-sm text-text-muted">No retained receptions in this window.</p> : <table aria-label="Path classification counts" className="w-full text-left font-mono text-xs">
          <thead className="text-text-muted"><tr><th scope="col" className="py-2">Category</th><th scope="col" className="text-right">Receptions</th><th scope="col" className="text-right">Share</th></tr></thead>
          <tbody>{categories.map((item) => <tr key={item.name} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal text-text-normal">{item.name}</th><td className="text-right text-text-bright">{item.value.toLocaleString()}</td><td className="text-right text-text-muted">{(100 * item.value / data.receptions).toFixed(1)}%</td></tr>)}</tbody>
        </table>}
        <p className="mt-3 text-xs leading-relaxed text-text-muted">Flood paths accumulate entries; direct routes contain remaining entries. Empty paths have no hash-width vote. Trace headers carry signal readings. Unclassified records lack usable payload or path metadata.</p>
      </Card>
    </div>
    {data && data.receptions > 0 && <details className="rounded-lg border border-border bg-bg-surface p-3.5">
      <summary className="cursor-pointer text-sm font-semibold text-text-normal">Exact width, path-length and hourly values</summary>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <table aria-label="Hash width counts" className="w-full text-left font-mono text-xs"><thead className="text-text-muted"><tr><th scope="col" className="py-2">Bytes per hash</th><th scope="col" className="text-right">Receptions</th></tr></thead><tbody>{data.hashWidths.map((bin) => <tr key={bin.bytes} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal">{bin.bytes}</th><td className="text-right">{bin.receptions.toLocaleString()}</td></tr>)}</tbody></table>
        <div className="max-h-[230px] overflow-auto"><table aria-label="Path entry counts" className="w-full text-left font-mono text-xs"><thead className="text-text-muted"><tr><th scope="col" className="py-2">Header entries</th><th scope="col" className="text-right">Receptions</th></tr></thead><tbody>{data.pathLengths.map((bin) => <tr key={bin.entries} className="border-t border-border-subtle"><th scope="row" className="py-1.5 font-normal">{bin.entries}</th><td className="text-right">{bin.receptions.toLocaleString()}</td></tr>)}</tbody></table></div>
      </div>
      <p className="my-3 text-xs text-text-muted">Length counts include validated ordinary empty paths at zero. In the trend, recorded hours with no hash paths show zero; absent hours remain gaps.</p>
      <div className="max-h-[340px] overflow-auto"><table aria-label="Hourly path counts" className="w-full min-w-[650px] text-left font-mono text-xs"><thead className="text-text-muted"><tr>{["UTC hour", "Receptions", "1-byte", "2-byte", "3-byte", "Empty", "Trace", "Unclassified"].map((label) => <th key={label} scope="col" className="py-2">{label}</th>)}</tr></thead><tbody>{data.hourly.map((row) => <tr key={row.hour} className="border-t border-border-subtle"><th scope="row" className="py-2 font-normal">{utc(row.hour)}</th>{[row.receptions, row.oneByte, row.twoByte, row.threeByte, row.empty, row.trace, row.unclassified].map((n, i) => <td key={i}>{n.toLocaleString()}</td>)}</tr>)}</tbody></table></div>
    </details>}
  </div>;
}
